"""Test storage abstraction, pre-signed upload URLs, confirmation, and direct uploads."""

import io
import json
import os
import tempfile
import time
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image
from backend import config, store
from backend.app import app
from backend.storage import LocalStorage, get_storage

def local_login(c):
    res = c.post("/api/auth/local", headers={"x-local-token": config.LOCAL_TOKEN})
    assert res.status_code == 200, res.text
    c.headers["x-csrf-token"] = res.json()["csrf"]

def test_direct_upload_and_confirmation():
    with TestClient(app) as c:
        local_login(c)
        job = c.post("/api/jobs", json={"tool": "images"}).json()
        
        # 1. Request upload URL
        url_resp = c.post(
            f"/api/jobs/{job['id']}/upload-url",
            json={
                "filename": "sample.png",
                "size": 120,
                "content_type": "image/png",
            },
        )
        assert url_resp.status_code == 200, url_resp.text
        upload_data = url_resp.json()
        assert "upload_url" in upload_data
        assert "asset_key" in upload_data
        asset_key = upload_data["asset_key"]
        
        # 2. Upload file content to direct upload endpoint
        img_buf = io.BytesIO()
        Image.new("RGB", (30, 30), "red").save(img_buf, "PNG")
        raw_bytes = img_buf.getvalue()
        
        put_resp = c.put(
            upload_data["upload_url"],
            content=raw_bytes,
            headers={"Content-Type": "image/png"},
        )
        assert put_resp.status_code == 200, put_resp.text
        
        # 3. Confirm upload
        confirm_resp = c.post(
            f"/api/jobs/{job['id']}/upload-confirm",
            json={
                "asset_id": upload_data["asset_id"],
                "asset_key": asset_key,
                "filename": "sample.png",
                "size": len(raw_bytes),
                "modified": time.time(),
            },
        )
        assert confirm_resp.status_code == 200, confirm_resp.text
        
        # Verify asset appears in job files
        files_resp = c.get(f"/api/jobs/{job['id']}/files")
        assert files_resp.status_code == 200
        files = files_resp.json()
        assert len(files) == 1
        assert files[0]["name"] == "sample.png"

def test_invalid_magic_bytes_rejected():
    with TestClient(app) as c:
        local_login(c)
        job = c.post("/api/jobs", json={"tool": "images"}).json()
        
        url_resp = c.post(
            f"/api/jobs/{job['id']}/upload-url",
            json={"filename": "fake.png", "size": 20, "content_type": "image/png"},
        )
        assert url_resp.status_code == 200
        upload_data = url_resp.json()
        
        # Upload non-image bytes
        c.put(upload_data["upload_url"], content=b"not a valid image header")
        
        confirm_resp = c.post(
            f"/api/jobs/{job['id']}/upload-confirm",
            json={
                "asset_id": upload_data["asset_id"],
                "asset_key": upload_data["asset_key"],
                "filename": "fake.png",
                "size": 24,
            },
        )
        assert confirm_resp.status_code == 400
        assert "verification failed" in confirm_resp.text.lower()
