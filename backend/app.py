import json
import os
import secrets
import shutil
import threading
import time
import uuid
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse
from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    Request,
    Response,
    UploadFile,
    File,
    Form,
)
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from . import config, store
from .auth import router as auth_router, current
from .admin import router as admin_router
from .models import NewJob, Options, SaveOptions, Start, validated
from .operations import ordered
from .storage import get_storage, LocalStorage, S3Storage
from .worker import scheduler, bounded_preview

mutation_lock = threading.RLock()
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


def cleanup_job(jobid, owner):
    with store.db() as c:
        c.execute("BEGIN IMMEDIATE")
        row = c.execute(
            "SELECT state FROM jobs WHERE id=? AND owner=?", (jobid, owner)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Job not found")
        if row["state"] in ("running", "queued"):
            raise HTTPException(409, "Cancel the active job before deleting it")
        ids = [
            r[0]
            for r in c.execute("SELECT asset FROM job_assets WHERE job=?", (jobid,))
        ]
        c.execute("DELETE FROM jobs WHERE id=?", (jobid,))
        for aid in ids:
            if not c.execute(
                "SELECT 1 FROM job_assets WHERE asset=?", (aid,)
            ).fetchone():
                asset = c.execute(
                    "SELECT path,managed FROM assets WHERE id=?", (aid,)
                ).fetchone()
                if asset["managed"]:
                    Path(asset["path"]).unlink(missing_ok=True)
                c.execute("DELETE FROM assets WHERE id=?", (aid,))
    shutil.rmtree(config.ROOT / "jobs" / jobid, ignore_errors=True)


def cleanup_expired(owner=None):
    with store.db() as c:
        rows = c.execute(
            "SELECT j.id,j.owner FROM jobs j JOIN users u ON j.owner=u.id WHERE j.state NOT IN ('running','queued') AND j.updated < ?-u.retention*86400"
            + (" AND j.owner=?" if owner else ""),
            (time.time(), owner) if owner else (time.time(),),
        ).fetchall()
    for row in rows:
        cleanup_job(row["id"], row["owner"])
    return len(rows)


@asynccontextmanager
async def lifespan(app):
    store.init()
    guard = None
    if config.MODE == "local" and not config.IS_VERCEL:
        guard = open(config.ROOT / "server.lock", "a+b")
        guard.write(b"0")
        guard.flush()
        guard.seek(0)
        try:
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(guard.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(guard.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            guard.close()
            raise RuntimeError("Another Folio server is using this data directory")
    
    if not config.IS_VERCEL:
        scheduler.stop_event.clear()
        scheduler.start()
        cleanup_expired()
        # Recover files left by a terminated worker, without touching successful outputs.
        with store.db() as c:
            failed = [
                r[0]
                for r in c.execute(
                    "SELECT id FROM jobs WHERE state IN ('failed','cancelled')"
                )
            ]
            referenced = {
                r[0] for r in c.execute("SELECT path FROM assets WHERE managed=1")
            }
        for jobid in failed:
            shutil.rmtree(config.ROOT / "jobs" / jobid, ignore_errors=True)
        if (config.ROOT / "assets").exists():
            for path in (config.ROOT / "assets").iterdir():
                if str(path) not in referenced:
                    path.unlink(missing_ok=True)
        if (config.ROOT / "tmp").exists():
            for path in (config.ROOT / "tmp").iterdir():
                if path.is_dir():
                    shutil.rmtree(path, ignore_errors=True)
                else:
                    path.unlink(missing_ok=True)
    yield
    if not config.IS_VERCEL:
        scheduler.close()
    if guard:
        guard.close()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)
app.include_router(auth_router)
app.include_router(admin_router)


@app.middleware("http")
async def guards(request, call_next):
    host = request.headers.get("host", "").split(":")[0]
    if config.MODE == "local" and host not in ("localhost", "127.0.0.1", "testserver"):
        return JSONResponse({"detail": "Local connections only"}, 403)
    if config.MODE == "web" and not config.IS_VERCEL and config.ORIGIN:
        if host != urlparse(config.ORIGIN).hostname:
            return JSONResponse({"detail": "Invalid host"}, 403)
    origin = request.headers.get("origin")
    expected = (
        config.ORIGIN
        if config.MODE == "web" and config.ORIGIN
        else "http://" + request.headers.get("host", "")
    )
    if origin and origin != expected:
        if not (config.IS_VERCEL and origin.endswith(".vercel.app")):
            return JSONResponse({"detail": "Origin not allowed"}, 403)
    if request.method in ("POST", "PUT", "PATCH"):
        raw = request.headers.get("content-length")
        if raw is None and not request.url.path.endswith("/direct-upload"):
            return JSONResponse({"detail": "Content-Length is required"}, 411)
        if raw is not None:
            try:
                size = int(raw)
            except ValueError:
                return JSONResponse({"detail": "Invalid Content-Length"}, 400)
            maximum = (
                (config.UPLOAD_MB + 1) * 1048576
                if request.url.path.endswith("/upload") or request.url.path.endswith("/direct-upload")
                else 4 * 1048576
            )
            if size < 0 or size > maximum:
                return JSONResponse(
                    {"detail": "Request exceeds configured size limit"}, 413
                )
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' blob: data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' blob: https:; frame-ancestors 'none'; base-uri 'self'"
    )
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health")
def health():
    return {"status": "ok", "mode": config.MODE}


@app.get("/api/config")
def public_config():
    return {
        "mode": config.MODE,
        "upload_mb": config.UPLOAD_MB,
        "pdf_input_mb": config.PDF_MB,
        "max_pages": config.MAX_PAGES,
        "data_directory": str(config.ROOT) if config.MODE == "local" else None,
    }


def job_for(jobid, user, editable=False):
    job = store.get_job(jobid, user["id"])
    if not job:
        raise HTTPException(404, "Job not found")
    if editable and job["state"] != "draft":
        raise HTTPException(409, "Create an editable revision of this job first")
    return job


def usage(user):
    with store.db() as c:
        inputs = c.execute(
            "SELECT COALESCE(SUM(size),0) FROM assets WHERE owner=? AND managed=1",
            (user["id"],),
        ).fetchone()[0]
        ids = [
            r[0] for r in c.execute("SELECT id FROM jobs WHERE owner=?", (user["id"],))
        ]
    outputs = temporary = 0
    for jobid in ids:
        folder = config.ROOT / "jobs" / jobid
        if folder.exists():
            for p in folder.iterdir():
                if p.is_file():
                    try:
                        if p.suffix in (".partial", ".bin"):
                            temporary += p.stat().st_size
                        else:
                            outputs += p.stat().st_size
                    except FileNotFoundError:
                        pass
    return {
        "inputs": inputs,
        "outputs": outputs,
        "temporary": temporary,
        "total": inputs + outputs + temporary,
        "free": shutil.disk_usage(config.ROOT).free,
        "quota": user["quota_mb"] * 1048576,
    }


@app.get("/api/storage")
def storage(user=Depends(current)):
    return usage(user)


@app.post("/api/storage/cleanup")
def cleanup(user=Depends(current)):
    with mutation_lock:
        return {"removed": cleanup_expired(user["id"])}


@app.get("/api/jobs")
def list_jobs(user=Depends(current)):
    with store.db() as c:
        ids = [
            r[0]
            for r in c.execute(
                "SELECT id FROM jobs WHERE owner=? ORDER BY created DESC LIMIT 200",
                (user["id"],),
            )
        ]
    return [store.get_job(j, user["id"]) for j in ids]


@app.post("/api/jobs")
def new_job(body: NewJob, user=Depends(current)):
    jobid = str(uuid.uuid4())
    now = time.time()
    with store.db() as c:
        c.execute(
            "INSERT INTO jobs(id,owner,tool,state,options,created,updated) VALUES(?,?,?,?,?,?,?)",
            (
                jobid,
                user["id"],
                body.tool,
                "draft",
                Options().model_dump_json(),
                now,
                now,
            ),
        )
    return store.get_job(jobid, user["id"])


@app.get("/api/jobs/{jobid}")
def get_job(jobid: str, user=Depends(current)):
    return job_for(jobid, user)


@app.patch("/api/jobs/{jobid}")
def save_options(jobid: str, body: SaveOptions, user=Depends(current)):
    with mutation_lock:
        job_for(jobid, user, True)
        try:
            options = validated(body.options)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        with store.db() as c:
            c.execute(
                "UPDATE jobs SET options=?,updated=? WHERE id=?",
                (json.dumps(options), time.time(), jobid),
            )
    return {"ok": True}


@app.get("/api/jobs/{jobid}/files")
def list_files(jobid: str, user=Depends(current)):
    job = job_for(jobid, user)
    return [
        {k: v for k, v in a.items() if k not in ("path", "owner", "managed")}
        for a in ordered(store.job_assets(jobid), job["options"])
    ]


def add_asset(c, jobid, user, path, name, managed, modified=None, storage_key=None):
    aid = str(uuid.uuid4())
    size = path.stat().st_size if Path(path).is_file() else 0
    c.execute(
        "INSERT INTO assets(id,owner,name,path,size,modified,managed,storage_key) VALUES(?,?,?,?,?,?,?,?)",
        (
            aid,
            user["id"],
            name,
            str(path),
            size,
            modified or (path.stat().st_mtime if Path(path).is_file() else time.time()),
            int(managed),
            storage_key,
        ),
    )
    position = c.execute(
        "SELECT COUNT(*) FROM job_assets WHERE job=?", (jobid,)
    ).fetchone()[0]
    if position >= 20000:
        raise HTTPException(400, "Selection is limited to 20,000 files")
    c.execute("INSERT INTO job_assets VALUES(?,?,?)", (jobid, aid, position))


@app.post("/api/jobs/{jobid}/upload")
def upload(
    jobid: str,
    file: UploadFile = File(...),
    modified: float | None = Form(default=None, ge=0, le=4102444800),
    user=Depends(current),
):
    with mutation_lock:
        job = job_for(jobid, user, True)
        name = (file.filename or "input").replace("\\", "/").split("/")[-1][:200]
        suffix = Path(name).suffix.lower()
        if suffix not in (EXTENSIONS if job["tool"] == "images" else {".pdf"}):
            raise HTTPException(400, "Unsupported input format")
        destination = config.ROOT / "assets" / (str(uuid.uuid4()) + suffix)
        used = usage(user)["total"]
        written = 0
        try:
            with destination.open("wb") as out:
                while chunk := file.file.read(1024 * 1024):
                    written += len(chunk)
                    if (
                        written > config.UPLOAD_MB * 1048576
                        or used + written > user["quota_mb"] * 1048576
                    ):
                        raise HTTPException(
                            413, "File size or account storage quota exceeded"
                        )
                    if shutil.disk_usage(config.ROOT).free < 64 * 1048576:
                        raise HTTPException(507, "Working disk is full")
                    out.write(chunk)
            with destination.open("rb") as incoming:
                magic = incoming.read(16)
            if suffix == ".pdf" and not magic.startswith(b"%PDF-"):
                raise HTTPException(400, "This file is not a PDF")
            if suffix != ".pdf" and not (
                magic.startswith(
                    (b"\xff\xd8", b"\x89PNG", b"BM", b"II*\x00", b"MM\x00*")
                )
                or magic[:4] == b"RIFF"
                and magic[8:12] == b"WEBP"
            ):
                raise HTTPException(
                    400, "Image header does not match a supported image"
                )
            with store.db() as c:
                add_asset(c, jobid, user, destination, name, True, modified)
        except Exception:
            destination.unlink(missing_ok=True)
            raise
        finally:
            file.file.close()
    return {"ok": True}


class UploadUrlRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=200)
    size: int = Field(ge=1, le=config.UPLOAD_MB * 1048576)
    content_type: str = Field(default="application/octet-stream")


class UploadConfirmRequest(BaseModel):
    asset_id: str = Field(min_length=1)
    asset_key: str = Field(min_length=1)
    filename: str = Field(min_length=1, max_length=200)
    size: int = Field(ge=1)
    modified: float | None = Field(default=None, ge=0, le=4102444800)


@app.post("/api/jobs/{jobid}/upload-url")
def request_upload_url(jobid: str, body: UploadUrlRequest, user=Depends(current)):
    with mutation_lock:
        job = job_for(jobid, user, True)
        name = body.filename.replace("\\", "/").split("/")[-1][:200]
        suffix = Path(name).suffix.lower()
        if suffix not in (EXTENSIONS if job["tool"] == "images" else {".pdf"}):
            raise HTTPException(400, "Unsupported input format")
        used = usage(user)["total"]
        if used + body.size > user["quota_mb"] * 1048576:
            raise HTTPException(413, "Account storage quota exceeded")
        
        asset_id = str(uuid.uuid4())
        asset_key = f"{asset_id}{suffix}"
        storage = get_storage()
        url_info = storage.get_upload_url(
            asset_key=asset_key,
            filename=name,
            content_type=body.content_type,
            max_size_bytes=body.size,
            expires_in=900,
        )
        return {
            **url_info,
            "asset_id": asset_id,
            "filename": name,
        }


@app.post("/api/jobs/{jobid}/upload-confirm")
def confirm_upload(jobid: str, body: UploadConfirmRequest, user=Depends(current)):
    with mutation_lock:
        job = job_for(jobid, user, True)
        storage = get_storage()
        ok, actual_size, msg = storage.verify_upload(body.asset_key, job["tool"], expected_size=body.size)
        if not ok:
            storage.delete(body.asset_key)
            raise HTTPException(400, f"Upload verification failed: {msg}")
        
        if isinstance(storage, LocalStorage):
            local_path = storage._resolve(body.asset_key)
        else:
            local_path = Path(body.asset_key)
            
        with store.db() as c:
            add_asset(c, jobid, user, local_path, body.filename, True, body.modified)
            c.execute("UPDATE assets SET storage_key=? WHERE id=?", (body.asset_key, body.asset_id))
    return {"ok": True, "size": actual_size}


@app.put("/api/storage/direct-upload")
async def local_direct_upload(request: Request, key: str = "", user=Depends(current)):
    clean_key = Path(key).name
    if not clean_key:
        raise HTTPException(400, "Missing upload key")
    storage = get_storage()
    if not isinstance(storage, LocalStorage):
        raise HTTPException(400, "Direct PUT upload endpoint is only for local storage")
    dest = storage._resolve(clean_key)
    used = usage(user)["total"]
    written = 0
    with dest.open("wb") as out:
        async for chunk in request.stream():
            written += len(chunk)
            if written > config.UPLOAD_MB * 1048576 or used + written > user["quota_mb"] * 1048576:
                dest.unlink(missing_ok=True)
                raise HTTPException(413, "Storage quota exceeded")
            out.write(chunk)
    return {"ok": True, "bytes": written}


class Folder(BaseModel):
    path: str
    recursive: bool = False


@app.get("/api/browse")
def browse(path: str = "", user=Depends(current)):
    if config.MODE != "local":
        raise HTTPException(403, "Folder browsing is only available in local mode")
    target = Path(path).expanduser().resolve() if path else Path.home()
    try:
        folders = sorted(
            [
                {"name": p.name, "path": str(p)}
                for p in target.iterdir()
                if p.is_dir() and not p.name.startswith(".")
            ],
            key=lambda p: p["name"].casefold(),
        )
        return {
            "path": str(target),
            "parent": str(target.parent),
            "folders": folders,
            "roots": (
                [
                    f"{c}:\\"
                    for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                    if Path(f"{c}:\\").exists()
                ]
                if os.name == "nt"
                else ["/"]
            ),
        }
    except OSError:
        raise HTTPException(400, "Folder is unavailable or access is denied")


@app.post("/api/jobs/{jobid}/folder")
def import_folder(jobid: str, body: Folder, user=Depends(current)):
    if config.MODE != "local":
        raise HTTPException(403, "Server filesystem import is disabled")
    with mutation_lock:
        job = job_for(jobid, user, True)
        target = Path(body.path).expanduser().resolve()
        if not target.is_dir():
            raise HTTPException(400, "Folder not found")
        suffixes = EXTENSIONS if job["tool"] == "images" else {".pdf"}
        seen = {a["path"] for a in store.job_assets(jobid)}
        try:
            with store.db() as c:
                for path in target.rglob("*") if body.recursive else target.iterdir():
                    resolved = path.resolve()
                    if (
                        resolved.is_file()
                        and resolved.is_relative_to(target)
                        and resolved.suffix.lower() in suffixes
                        and str(resolved) not in seen
                    ):
                        add_asset(
                            c,
                            jobid,
                            user,
                            resolved,
                            str(path.relative_to(target)),
                            False,
                        )
                        seen.add(str(resolved))
        except OSError:
            raise HTTPException(400, "One or more files could not be read")
    return {"ok": True}


@app.post("/api/jobs/{jobid}/order")
def display_order(jobid: str, body: SaveOptions, user=Depends(current)):
    job_for(jobid, user)
    try:
        options = validated(body.options)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return [
        {k: v for k, v in a.items() if k not in ("path", "owner", "managed")}
        for a in ordered(store.job_assets(jobid), options)
    ]


@app.delete("/api/jobs/{jobid}/files/{aid}")
def remove_file(jobid: str, aid: str, user=Depends(current)):
    with mutation_lock:
        job_for(jobid, user, True)
        with store.db() as c:
            c.execute("DELETE FROM job_assets WHERE job=? AND asset=?", (jobid, aid))
            if not c.execute(
                "SELECT 1 FROM job_assets WHERE asset=?", (aid,)
            ).fetchone():
                row = c.execute(
                    "SELECT * FROM assets WHERE id=? AND owner=?", (aid, user["id"])
                ).fetchone()
                if row:
                    if row["managed"]:
                        Path(row["path"]).unlink(missing_ok=True)
                    c.execute("DELETE FROM assets WHERE id=?", (aid,))
    return {"ok": True}


@app.post("/api/jobs/{jobid}/revise")
def revise(jobid: str, user=Depends(current)):
    with mutation_lock:
        job = job_for(jobid, user)
        if job["state"] in ("running", "queued"):
            raise HTTPException(409, "Wait for this job to finish")
        missing = [
            a["name"] for a in store.job_assets(jobid) if not Path(a["path"]).is_file()
        ]
        if missing:
            raise HTTPException(
                409, "Select missing source files again: " + ", ".join(missing[:3])
            )
        revised = new_job(NewJob(tool=job["tool"]), user)
        with store.db() as c:
            c.execute(
                "UPDATE jobs SET options=?,parent=? WHERE id=?",
                (json.dumps(job["options"]), jobid, revised["id"]),
            )
            c.execute(
                "INSERT INTO job_assets SELECT ?,asset,position FROM job_assets WHERE job=?",
                (revised["id"], jobid),
            )
        return store.get_job(revised["id"], user["id"])


@app.post("/api/jobs/{jobid}/start")
def start(jobid: str, body: Start, user=Depends(current)):
    with mutation_lock, scheduler.lock:
        job = job_for(jobid, user, True)
        assets = store.job_assets(jobid)
        if not assets:
            raise HTTPException(400, "Select files first")
        if job["tool"] not in ("images", "merge") and len(assets) != 1:
            raise HTTPException(400, "Select one PDF for this tool")
        if job["tool"] == "protect" and len(body.output_password) < 12:
            raise HTTPException(
                400, "Use an output password with at least 12 characters"
            )
        if usage(user)["total"] >= user["quota_mb"] * 1048576:
            raise HTTPException(413, "Storage quota reached")
        with store.db() as c:
            c.execute("BEGIN IMMEDIATE")
            count = c.execute(
                "SELECT COUNT(*) FROM jobs WHERE state IN ('queued','running')"
            ).fetchone()[0]
            if count >= config.QUEUE_LIMIT:
                raise HTTPException(429, "Queue is full; try again later")
            c.execute(
                "UPDATE jobs SET state='queued',cancel=0,updated=? WHERE id=?",
                (time.time(), jobid),
            )
            store.audit(c, user["id"], "job_queued", jobid)
        scheduler.secrets[jobid] = (body.input_password, body.output_password)
    return {"ok": True}


@app.post("/api/jobs/{jobid}/cancel")
def cancel(jobid: str, user=Depends(current)):
    job_for(jobid, user)
    with store.db() as c:
        c.execute(
            "UPDATE jobs SET cancel=1 WHERE id=? AND state IN ('queued','running')",
            (jobid,),
        )
    return {"ok": True}


@app.delete("/api/jobs/{jobid}")
def delete_job(jobid: str, user=Depends(current)):
    with mutation_lock:
        cleanup_job(jobid, user["id"])
    return {"ok": True}


class Preview(BaseModel):
    asset: str
    page: int = Field(default=1, ge=1)
    options: Options
    password: str = Field(default="", max_length=256)


@app.post("/api/jobs/{jobid}/preview")
def preview_job(jobid: str, body: Preview, user=Depends(current)):
    job = job_for(jobid, user)
    item = next((a for a in store.job_assets(jobid) if a["id"] == body.asset), None)
    if not item:
        raise HTTPException(404, "File not found")
    try:
        payload, count = bounded_preview(
            item, validated(body.options), job["tool"], body.page - 1, body.password
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return Response(
        payload, media_type="image/png", headers={"X-Page-Count": str(count)}
    )


@app.get("/api/jobs/{jobid}/download/{index}")
def download(jobid: str, index: int, user=Depends(current)):
    job = job_for(jobid, user)
    outputs = job["detail"].get("outputs", [])
    if job["state"] != "complete" or index < 0 or index >= len(outputs):
        raise HTTPException(404, "Completed output not found")
    output_name = outputs[index]
    stem = job["options"]["filename"].strip().strip(".") or "document"
    name = stem + Path(output_name).suffix if len(outputs) == 1 else stem + "-" + output_name

    storage = get_storage()
    if isinstance(storage, S3Storage):
        s3_key = f"jobs/{jobid}/{output_name}"
        from fastapi.responses import RedirectResponse
        return RedirectResponse(storage.get_download_url(s3_key, name))

    path = config.ROOT / "jobs" / jobid / output_name
    if not path.is_file():
        raise HTTPException(410, "Output expired or was removed")
    return FileResponse(path, filename=name)


@app.get("/api/jobs/{jobid}/download-url/{index}")
def download_url(jobid: str, index: int, user=Depends(current)):
    job = job_for(jobid, user)
    outputs = job["detail"].get("outputs", [])
    if job["state"] != "complete" or index < 0 or index >= len(outputs):
        raise HTTPException(404, "Completed output not found")
    output_name = outputs[index]
    stem = job["options"]["filename"].strip().strip(".") or "document"
    name = stem + Path(output_name).suffix if len(outputs) == 1 else stem + "-" + output_name

    storage = get_storage()
    if isinstance(storage, S3Storage):
        s3_key = f"jobs/{jobid}/{output_name}"
        url = storage.get_download_url(s3_key, name)
    else:
        url = f"/api/jobs/{jobid}/download/{index}"
    return {"download_url": url, "filename": name}


@app.get("/api/jobs/{jobid}/errors")
def errors(jobid: str, user=Depends(current)):
    job = job_for(jobid, user)
    return JSONResponse(
        job["detail"].get("errors", []),
        headers={"Content-Disposition": 'attachment; filename="errors.json"'},
    )


@app.post("/api/jobs/{jobid}/archive")
def archive(jobid: str, user=Depends(current)):
    with mutation_lock:
        job = job_for(jobid, user)
        if job["state"] != "complete":
            raise HTTPException(409, "Job has not completed")
        folder = config.ROOT / "jobs" / jobid
        size = sum((folder / name).stat().st_size for name in job["detail"]["outputs"])
        if (
            usage(user)["total"] + size > user["quota_mb"] * 1048576
            or shutil.disk_usage(config.ROOT).free < size + 64 * 1048576
        ):
            raise HTTPException(
                413,
                "Not enough storage to create an archive; download outputs individually",
            )
        with zipfile.ZipFile(
            folder / "outputs.zip.partial", "w", zipfile.ZIP_STORED, allowZip64=True
        ) as z:
            for name in job["detail"]["outputs"]:
                z.write(folder / name, name)
        os.replace(folder / "outputs.zip.partial", folder / "outputs.zip")
    return {"ok": True}


@app.get("/api/jobs/{jobid}/archive")
def download_archive(jobid: str, user=Depends(current)):
    job_for(jobid, user)
    path = config.ROOT / "jobs" / jobid / "outputs.zip"
    if not path.exists():
        raise HTTPException(404, "Create the export archive first")
    return FileResponse(path, filename="outputs.zip")


DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")
