"""Standalone background worker service for executing PDF jobs from the durable queue."""

import json
import logging
import multiprocessing as mp
import os
import shutil
import signal
import sys
import time
from pathlib import Path
from typing import Optional, Dict, Any, List

from . import config, store
from .models import Options
from .operations import images_to_pdf, pdf_operation
from .storage import get_storage, LocalStorage, S3Storage
from .worker import limits, Cancelled

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [worker-%(process)d] %(message)s",
)
logger = logging.getLogger("folio.worker_service")

WORKER_ID = f"worker-{os.getpid()}-{time.time()}"
STOP_REQUESTED = False


def sig_handler(signum, frame):
    global STOP_REQUESTED
    logger.info("Received termination signal %s, stopping gracefully...", signum)
    STOP_REQUESTED = True


def claim_next_job() -> Optional[Dict[str, Any]]:
    """Atomically claim the oldest queued job."""
    now = time.time()
    with store.db() as c:
        c.execute("BEGIN IMMEDIATE")
        
        # Check for crashed/abandoned running jobs (> MAX_SECONDS + 120s old)
        stale_threshold = now - (config.MAX_SECONDS + 120)
        stale = c.execute(
            "SELECT id FROM jobs WHERE state='running' AND updated < ?",
            (stale_threshold,)
        ).fetchall()
        for row in stale:
            logger.warning("Recovering stale/crashed job %s", row["id"])
            c.execute(
                "UPDATE jobs SET state='failed', detail=?, updated=? WHERE id=?",
                (
                    json.dumps({"message": "Worker timed out or terminated unexpectedly."}),
                    now,
                    row["id"],
                ),
            )
        
        # Find next queued job
        row = c.execute(
            "SELECT * FROM jobs WHERE state='queued' AND cancel=0 ORDER BY created LIMIT 1"
        ).fetchone()
        if not row:
            return None
        
        jobid = row["id"]
        c.execute(
            "UPDATE jobs SET state='running', updated=?, locked_at=?, locked_by=?, attempts=attempts+1 WHERE id=?",
            (now, now, WORKER_ID, jobid),
        )
        job = store.get_job(jobid)
        return job


def process_job(job: Dict[str, Any], storage=None) -> bool:
    """Execute a single claimed job with end-to-end reliability and storage synchronization."""
    if storage is None:
        storage = get_storage()
    jobid = job["id"]
    folder = config.ROOT / "jobs" / jobid
    folder.mkdir(parents=True, exist_ok=True)
    start_time = time.monotonic()
    detail: Dict[str, Any] = {}
    last_update = 0

    def progress(done, total, current, phase="processing", **extra):
        nonlocal last_update, detail
        now = time.monotonic()
        if now - last_update < 0.2 and done != 0 and phase != "validating":
            return
        
        # Check cancellation
        latest = store.get_job(jobid)
        if not latest or latest.get("cancel"):
            raise Cancelled("Job cancelled by user")
        
        if now - start_time > config.MAX_SECONDS:
            raise ValueError(f"Job exceeded the {config.MAX_SECONDS}s maximum runtime limit")
        
        detail = {
            "processed": done,
            "total": total,
            "current": current,
            "phase": phase,
            "elapsed": round(now - start_time, 1),
            **extra,
        }
        store.update(jobid, detail=detail)
        last_update = now

    try:
        logger.info("Starting processing for job %s (tool: %s)", jobid, job["tool"])
        assets = store.job_assets(jobid)
        if not assets:
            raise ValueError("No input files associated with this job")
        
        # If running with S3 storage, download assets to local scratch folder
        local_assets = []
        for a in assets:
            storage_key = a.get("storage_key") or a["path"]
            if isinstance(storage, S3Storage) and storage_key and not Path(a["path"]).is_file():
                cached_file = folder / "inputs" / Path(a["name"]).name
                cached_file.parent.mkdir(parents=True, exist_ok=True)
                storage.download_to_file(storage_key, cached_file)
                local_a = dict(a)
                local_a["path"] = str(cached_file)
                local_assets.append(local_a)
            else:
                local_assets.append(a)

        # Run conversion operation
        if job["tool"] == "images":
            outputs, extra = images_to_pdf(local_assets, job["options"], folder, progress)
        else:
            outputs, extra = pdf_operation(
                job["tool"], local_assets, job["options"], folder, progress
            )

        progress(
            detail.get("total", len(outputs)),
            detail.get("total", len(outputs)),
            "Final checks and storage sync",
            phase="validating",
        )

        # If using S3 storage, upload outputs to S3
        if isinstance(storage, S3Storage):
            for out_name in outputs:
                local_out = folder / out_name
                s3_key = f"jobs/{jobid}/{out_name}"
                storage.upload_from_file(local_out, s3_key, content_type="application/pdf")

        total_bytes = sum((folder / p).stat().st_size for p in outputs if (folder / p).is_file())
        result = {
            **detail,
            **extra,
            "outputs": outputs,
            "bytes": total_bytes,
            "elapsed": round(time.monotonic() - start_time, 2),
            "phase": "complete",
        }
        result["processed"] = result.get("total", len(outputs))
        store.update(jobid, "complete", result)
        logger.info("Job %s completed successfully in %.2fs (%s bytes)", jobid, result["elapsed"], total_bytes)
        return True

    except Cancelled:
        logger.info("Job %s was cancelled", jobid)
        shutil.rmtree(folder, ignore_errors=True)
        store.update(jobid, "cancelled", {"message": "Conversion cancelled by user"})
        return False

    except Exception as exc:
        logger.error("Job %s failed: %s", jobid, exc, exc_info=True)
        shutil.rmtree(folder, ignore_errors=True)
        msg = str(exc) if isinstance(exc, ValueError) else f"{type(exc).__name__}: Processing failed"
        store.update(jobid, "failed", {"message": msg, "elapsed": round(time.monotonic() - start_time, 2)})
        return False

    finally:
        # Clean temporary inputs
        shutil.rmtree(folder / "inputs", ignore_errors=True)


def run_worker_loop(poll_interval: float = 0.5, once: bool = False):
    """Main worker poll loop."""
    logger.info("Worker service started (ID: %s, mode: %s)", WORKER_ID, config.MODE)
    storage = get_storage()
    store.init()

    while not STOP_REQUESTED:
        try:
            job = claim_next_job()
            if job:
                process_job(job, storage=storage)
                if once:
                    break
            else:
                if once:
                    break
                time.sleep(poll_interval)
        except KeyboardInterrupt:
            logger.info("Worker interrupted by keyboard")
            break
        except Exception as exc:
            logger.error("Error in worker loop: %s", exc, exc_info=True)
            time.sleep(2)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, sig_handler)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, sig_handler)
    
    run_worker_loop()
