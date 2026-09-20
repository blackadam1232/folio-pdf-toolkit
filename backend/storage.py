"""Storage abstraction layer supporting Local Filesystem and S3-compatible cloud storage (AWS S3, Cloudflare R2, Supabase Storage, MinIO)."""

import io
import os
import shutil
import time
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
from . import config

EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}

class StorageBackend:
    """Base interface for document and asset storage."""

    def get_upload_url(
        self, asset_key: str, filename: str, content_type: str, max_size_bytes: int, expires_in: int = 900
    ) -> Dict[str, Any]:
        raise NotImplementedError

    def get_download_url(
        self, asset_key: str, filename: str, expires_in: int = 3600
    ) -> str:
        raise NotImplementedError

    def verify_upload(
        self, asset_key: str, tool: str, expected_size: Optional[int] = None
    ) -> Tuple[bool, int, str]:
        """Verify uploaded object existence, actual size, and format magic bytes."""
        raise NotImplementedError

    def download_to_file(self, asset_key: str, local_dest: Path) -> Path:
        raise NotImplementedError

    def upload_from_file(self, local_src: Path, asset_key: str, content_type: str = "application/pdf") -> None:
        raise NotImplementedError

    def delete(self, asset_key: str) -> bool:
        raise NotImplementedError

    def exists(self, asset_key: str) -> bool:
        raise NotImplementedError

    def get_size(self, asset_key: str) -> int:
        raise NotImplementedError


class LocalStorage(StorageBackend):
    """Local filesystem storage used in local mode or local tests."""

    def __init__(self, root: Optional[Path] = None):
        self.root = (root or config.ROOT).resolve()
        self.assets_dir = self.root / "assets"
        self.jobs_dir = self.root / "jobs"
        self.assets_dir.mkdir(parents=True, exist_ok=True)
        self.jobs_dir.mkdir(parents=True, exist_ok=True)

    def _resolve(self, asset_key: str) -> Path:
        # Prevent directory traversal
        clean_key = Path(asset_key).name
        target = self.assets_dir / clean_key
        return target

    def get_upload_url(
        self, asset_key: str, filename: str, content_type: str, max_size_bytes: int, expires_in: int = 900
    ) -> Dict[str, Any]:
        clean_key = Path(asset_key).name
        return {
            "mode": "local",
            "upload_url": f"/api/storage/direct-upload?key={clean_key}",
            "method": "PUT",
            "headers": {"Content-Type": content_type},
            "asset_key": clean_key,
            "expires_in": expires_in,
        }

    def get_download_url(
        self, asset_key: str, filename: str, expires_in: int = 3600
    ) -> str:
        clean_key = Path(asset_key).name
        return f"/api/storage/direct-download?key={clean_key}&filename={filename}"

    def verify_upload(
        self, asset_key: str, tool: str, expected_size: Optional[int] = None
    ) -> Tuple[bool, int, str]:
        path = self._resolve(asset_key)
        if not path.is_file():
            return False, 0, "Uploaded file not found"
        actual_size = path.stat().st_size
        if actual_size <= 0:
            return False, 0, "Uploaded file is empty"
        if expected_size is not None and abs(actual_size - expected_size) > 1024:
            return False, actual_size, f"Size mismatch: got {actual_size} bytes, expected {expected_size}"
        
        # Verify magic bytes
        with path.open("rb") as f:
            magic = f.read(16)
        
        suffix = path.suffix.lower()
        if tool == "images" or suffix in EXTENSIONS:
            is_valid_image = (
                magic.startswith((b"\xff\xd8", b"\x89PNG", b"BM", b"II*\x00", b"MM\x00*"))
                or (magic[:4] == b"RIFF" and magic[8:12] == b"WEBP")
            )
            if not is_valid_image:
                return False, actual_size, "File content is not a recognized image format"
        else:
            if not magic.startswith(b"%PDF-"):
                return False, actual_size, "File content does not start with valid PDF header"
        
        return True, actual_size, "OK"

    def download_to_file(self, asset_key: str, local_dest: Path) -> Path:
        src = self._resolve(asset_key)
        if src.resolve() != local_dest.resolve():
            shutil.copyfile(src, local_dest)
        return local_dest

    def upload_from_file(self, local_src: Path, asset_key: str, content_type: str = "application/pdf") -> None:
        dest = self._resolve(asset_key)
        if local_src.resolve() != dest.resolve():
            shutil.copyfile(local_src, dest)

    def delete(self, asset_key: str) -> bool:
        path = self._resolve(asset_key)
        try:
            path.unlink(missing_ok=True)
            return True
        except OSError:
            return False

    def exists(self, asset_key: str) -> bool:
        return self._resolve(asset_key).is_file()

    def get_size(self, asset_key: str) -> int:
        path = self._resolve(asset_key)
        return path.stat().st_size if path.is_file() else 0


class S3Storage(StorageBackend):
    """S3-compatible cloud storage (Cloudflare R2, AWS S3, Supabase, MinIO)."""

    def __init__(
        self,
        bucket: str,
        endpoint_url: Optional[str] = None,
        region: Optional[str] = None,
        access_key: Optional[str] = None,
        secret_key: Optional[str] = None,
    ):
        import boto3
        from botocore.config import Config

        self.bucket = bucket
        self.endpoint_url = endpoint_url or os.getenv("S3_ENDPOINT")
        self.region = region or os.getenv("S3_REGION", "auto")
        self.access_key = access_key or os.getenv("S3_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY_ID")
        self.secret_key = secret_key or os.getenv("S3_SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_ACCESS_KEY")

        cfg = Config(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"},
        )
        self.s3 = boto3.client(
            "s3",
            endpoint_url=self.endpoint_url,
            region_name=self.region,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            config=cfg,
        )

    def get_upload_url(
        self, asset_key: str, filename: str, content_type: str, max_size_bytes: int, expires_in: int = 900
    ) -> Dict[str, Any]:
        url = self.s3.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": self.bucket,
                "Key": asset_key,
                "ContentType": content_type,
            },
            ExpiresIn=expires_in,
        )
        return {
            "mode": "s3",
            "upload_url": url,
            "method": "PUT",
            "headers": {"Content-Type": content_type},
            "asset_key": asset_key,
            "expires_in": expires_in,
        }

    def get_download_url(
        self, asset_key: str, filename: str, expires_in: int = 3600
    ) -> str:
        return self.s3.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": self.bucket,
                "Key": asset_key,
                "ResponseContentDisposition": f'attachment; filename="{filename}"',
            },
            ExpiresIn=expires_in,
        )

    def verify_upload(
        self, asset_key: str, tool: str, expected_size: Optional[int] = None
    ) -> Tuple[bool, int, str]:
        from botocore.exceptions import ClientError
        try:
            head = self.s3.head_object(Bucket=self.bucket, Key=asset_key)
            actual_size = head.get("ContentLength", 0)
            if actual_size <= 0:
                return False, 0, "Uploaded object is empty"
            if expected_size is not None and abs(actual_size - expected_size) > 1024:
                return False, actual_size, f"Size mismatch: got {actual_size}, expected {expected_size}"
            
            # Fetch first 16 bytes for magic check
            resp = self.s3.get_object(Bucket=self.bucket, Key=asset_key, Range="bytes=0-15")
            magic = resp["Body"].read()

            suffix = Path(asset_key).suffix.lower()
            if tool == "images" or suffix in EXTENSIONS:
                is_valid_image = (
                    magic.startswith((b"\xff\xd8", b"\x89PNG", b"BM", b"II*\x00", b"MM\x00*"))
                    or (magic[:4] == b"RIFF" and magic[8:12] == b"WEBP")
                )
                if not is_valid_image:
                    return False, actual_size, "File content is not a recognized image format"
            else:
                if not magic.startswith(b"%PDF-"):
                    return False, actual_size, "File content does not start with valid PDF header"
            
            return True, actual_size, "OK"
        except ClientError as e:
            return False, 0, f"S3 error: {e}"

    def download_to_file(self, asset_key: str, local_dest: Path) -> Path:
        local_dest.parent.mkdir(parents=True, exist_ok=True)
        self.s3.download_file(self.bucket, asset_key, str(local_dest))
        return local_dest

    def upload_from_file(self, local_src: Path, asset_key: str, content_type: str = "application/pdf") -> None:
        self.s3.upload_file(
            str(local_src),
            self.bucket,
            asset_key,
            ExtraArgs={"ContentType": content_type},
        )

    def delete(self, asset_key: str) -> bool:
        try:
            self.s3.delete_object(Bucket=self.bucket, Key=asset_key)
            return True
        except Exception:
            return False

    def exists(self, asset_key: str) -> bool:
        try:
            self.s3.head_object(Bucket=self.bucket, Key=asset_key)
            return True
        except Exception:
            return False

    def get_size(self, asset_key: str) -> int:
        try:
            head = self.s3.head_object(Bucket=self.bucket, Key=asset_key)
            return head.get("ContentLength", 0)
        except Exception:
            return 0


def get_storage() -> StorageBackend:
    """Factory function returning configured storage backend."""
    storage_type = os.getenv("FOLIO_STORAGE_BACKEND", "").lower()
    s3_bucket = os.getenv("S3_BUCKET")
    if storage_type == "s3" or s3_bucket:
        if not s3_bucket:
            raise RuntimeError("S3_BUCKET environment variable must be specified for S3 storage")
        return S3Storage(bucket=s3_bucket)
    return LocalStorage()
