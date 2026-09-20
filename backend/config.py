import os
from pathlib import Path

MODE = os.getenv("FOLIO_MODE", "local")
if MODE not in ("local", "web"):
    raise RuntimeError("FOLIO_MODE must be local or web")
IS_VERCEL = bool(os.getenv("VERCEL") or os.getenv("VERCEL_ENV"))
default_root = "/tmp/.folio-toolkit" if IS_VERCEL else str(Path.home() / ".folio-toolkit")
ROOT = Path(
    os.getenv(
        "FOLIO_DATA", os.getenv("IMAGEPDF_DATA", default_root)
    )
).resolve()
ORIGIN = os.getenv("FOLIO_ORIGIN", "")
UPLOAD_MB = int(os.getenv("FOLIO_UPLOAD_MB", "128"))
QUOTA_MB = int(os.getenv("FOLIO_QUOTA_MB", "20480"))
PDF_MB = int(os.getenv("FOLIO_PDF_INPUT_MB", "256"))
MAX_PAGES = int(os.getenv("FOLIO_MAX_PAGES", "10000"))
MAX_SECONDS = int(os.getenv("FOLIO_JOB_SECONDS", "1800"))
MEMORY_MB = int(os.getenv("FOLIO_WORKER_MEMORY_MB", "2048"))
QUEUE_LIMIT = int(os.getenv("FOLIO_QUEUE_LIMIT", "20"))
COOKIE_SECURE = MODE == "web"
LOCAL_TOKEN = os.getenv("IMAGEPDF_TOKEN", "")

# Cloud Storage & Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "")
S3_BUCKET = os.getenv("S3_BUCKET", "")
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "")
S3_REGION = os.getenv("S3_REGION", "auto")
S3_ACCESS_KEY_ID = os.getenv("S3_ACCESS_KEY_ID", os.getenv("AWS_ACCESS_KEY_ID", ""))
S3_SECRET_ACCESS_KEY = os.getenv("S3_SECRET_ACCESS_KEY", os.getenv("AWS_SECRET_ACCESS_KEY", ""))
STORAGE_BACKEND = os.getenv("FOLIO_STORAGE_BACKEND", "s3" if S3_BUCKET else "local")


def validate():
    if MODE == "web" and not ORIGIN.startswith("https://") and not IS_VERCEL:
        raise RuntimeError("Web mode requires FOLIO_ORIGIN=https://your-domain")
    ROOT.mkdir(parents=True, exist_ok=True)
    for name in ("assets", "jobs", "tmp"):
        (ROOT / name).mkdir(exist_ok=True)
