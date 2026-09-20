import json
import multiprocessing as mp
import os
import shutil
import threading
import time
import tempfile
from pathlib import Path
from . import config, store
from .operations import images_to_pdf, pdf_operation, preview


class Cancelled(Exception):
    pass


def limits():
    if os.name != "nt":
        import resource

        resource.setrlimit(
            resource.RLIMIT_AS, (config.MEMORY_MB * 1048576, config.MEMORY_MB * 1048576)
        )
        resource.setrlimit(
            resource.RLIMIT_CPU, (config.MAX_SECONDS, config.MAX_SECONDS + 1)
        )
        resource.setrlimit(resource.RLIMIT_NOFILE, (256, 256))


def execute(jobid, passwords, root_dir=None):
    if root_dir:
        config.ROOT = Path(root_dir).resolve()
        os.environ["FOLIO_DATA"] = str(config.ROOT)
    limits()
    start = time.monotonic()
    last = 0
    folder = config.ROOT / "jobs" / jobid
    folder.mkdir(parents=True, exist_ok=True)
    job = store.get_job(jobid)
    detail = {}

    def progress(done, total, current, phase="processing", **extra):
        nonlocal last, detail
        now = time.monotonic()
        if now - last < 0.2 and done != 0 and phase != "validating":
            return
        latest = store.get_job(jobid)
        if latest["cancel"]:
            raise Cancelled()
        if now - start > config.MAX_SECONDS:
            raise ValueError("Job runtime limit reached")
        if shutil.disk_usage(config.ROOT).free < 64 * 1048576:
            raise ValueError("Working disk is almost full")
        with store.db() as c:
            quota = c.execute(
                "SELECT quota_mb FROM users WHERE id=?", (job["owner"],)
            ).fetchone()[0]
            inputs = c.execute(
                "SELECT COALESCE(SUM(size),0) FROM assets WHERE owner=? AND managed=1",
                (job["owner"],),
            ).fetchone()[0]
            completed = sum(
                json.loads(r[0]).get("bytes", 0)
                for r in c.execute(
                    "SELECT detail FROM jobs WHERE owner=? AND state='complete'",
                    (job["owner"],),
                )
            )
        used = sum(p.stat().st_size for p in folder.iterdir() if p.is_file())
        if inputs + completed + used > quota * 1048576:
            raise ValueError("Account storage quota reached")
        detail = {
            "processed": done,
            "total": total,
            "current": current,
            "phase": phase,
            "elapsed": round(now - start, 1),
            **extra,
        }
        store.update(jobid, detail=detail)
        last = now

    try:
        assets = store.job_assets(jobid)
        if job["tool"] == "images":
            outputs, extra = images_to_pdf(assets, job["options"], folder, progress)
        else:
            outputs, extra = pdf_operation(
                job["tool"], assets, job["options"], folder, progress, *passwords
            )
        progress(
            detail.get("total", len(outputs)),
            detail.get("total", len(outputs)),
            "Final checks",
            phase="validating",
        )
        if store.get_job(jobid)["cancel"]:
            raise Cancelled()
        result = {
            **detail,
            **extra,
            "outputs": outputs,
            "bytes": sum((folder / p).stat().st_size for p in outputs),
            "elapsed": round(time.monotonic() - start, 2),
            "phase": "complete",
        }
        result["processed"] = result.get("total", len(outputs))
        store.update(jobid, "complete", result)
    except Cancelled:
        shutil.rmtree(folder, ignore_errors=True)
        store.update(
            jobid,
            "cancelled",
            {"message": "Conversion cancelled; previous revisions are unchanged."},
        )
    except Exception as exc:
        shutil.rmtree(folder, ignore_errors=True)
        message = (
            str(exc)
            if isinstance(exc, ValueError)
            else f"{type(exc).__name__}: conversion failed. Check the input or server resource limits."
        )
        store.update(
            jobid,
            "failed",
            {"message": message, "elapsed": round(time.monotonic() - start, 2)},
        )
    finally:
        passwords = None


class Scheduler:
    def __init__(self):
        self.stop_event = threading.Event()
        self.secrets = {}
        self.lock = threading.RLock()
        self.thread = None
        self.process = None

    def start(self):
        with store.db() as c:
            c.execute(
                "UPDATE jobs SET state='failed',detail=? WHERE state IN ('running','queued')",
                (
                    json.dumps(
                        {
                            "message": "Server restarted. Retry the job; document passwords must be entered again."
                        }
                    ),
                ),
            )
        self.thread = threading.Thread(target=self.loop, daemon=True)
        self.thread.start()

    def loop(self):
        while not self.stop_event.wait(0.2):
            with self.lock:
                with store.db() as c:
                    c.execute("BEGIN IMMEDIATE")
                    row = c.execute(
                        "SELECT id,cancel FROM jobs WHERE state='queued' ORDER BY created LIMIT 1"
                    ).fetchone()
                    if not row:
                        continue
                    jobid = row["id"]
                    if row["cancel"]:
                        c.execute(
                            "UPDATE jobs SET state='cancelled' WHERE id=?", (jobid,)
                        )
                        self.secrets.pop(jobid, None)
                        continue
                    c.execute("UPDATE jobs SET state='running' WHERE id=?", (jobid,))
                passwords = self.secrets.pop(jobid, ("", ""))
            process = mp.get_context("spawn").Process(
                target=execute, args=(jobid, passwords, str(config.ROOT)), daemon=True
            )
            self.process = process
            process.start()
            passwords = None
            started = time.monotonic()
            cancel_since = None
            while process.is_alive() and not self.stop_event.wait(0.2):
                job = store.get_job(jobid)
                if job is None:
                    break
                if job["cancel"]:
                    cancel_since = cancel_since or time.monotonic()
                if (
                    cancel_since and time.monotonic() - cancel_since > 3
                ) or time.monotonic() - started > config.MAX_SECONDS + 5:
                    process.terminate()
                    break
            if process.is_alive():
                process.terminate()
            process.join(5)
            self.process = None
            job = store.get_job(jobid)
            if job and job["state"] == "running":
                shutil.rmtree(config.ROOT / "jobs" / jobid, ignore_errors=True)
                store.update(
                    jobid,
                    "cancelled" if job["cancel"] else "failed",
                    {
                        "message": "Worker stopped: cancellation, shutdown, or resource limit. Previous revisions are unchanged."
                    },
                )

    def close(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join(8)
        self.secrets.clear()


scheduler = Scheduler()


def preview_child(connection, asset, options, tool, index, password, root_dir=None):
    try:
        if root_dir:
            config.ROOT = Path(root_dir).resolve()
            os.environ["FOLIO_DATA"] = str(config.ROOT)
        limits()
        (config.ROOT / "tmp").mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=config.ROOT / "tmp") as folder:
            image, count = preview(asset, options, tool, index, password, Path(folder))
            connection.send((True, image, count))
    except Exception as exc:
        connection.send(
            (
                False,
                (
                    str(exc)
                    if isinstance(exc, ValueError)
                    else "Preview unavailable for this file"
                ),
                0,
            )
        )
    finally:
        connection.close()


preview_lock = threading.Semaphore(1)


def bounded_preview(asset, options, tool, index, password):
    if not preview_lock.acquire(blocking=False):
        raise ValueError("Another preview is rendering. Try again shortly.")
    parent, child = mp.get_context("spawn").Pipe(duplex=False)
    process = mp.get_context("spawn").Process(
        target=preview_child,
        args=(child, asset, options, tool, index, password, str(config.ROOT)),
        daemon=True,
    )
    try:
        process.start()
        child.close()
        if not parent.poll(20):
            raise ValueError("Preview timed out; try a smaller document")
        ok, payload, count = parent.recv()
        if not ok:
            raise ValueError(payload)
        return payload, count
    finally:
        if process.is_alive():
            process.terminate()
        process.join(2)
        parent.close()
        preview_lock.release()
