"""Test standalone worker service claim, execution, progress, and crash recovery."""

import io
import json
import os
import tempfile
import time
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfReader
from backend import config, store
from backend.app import app
from backend import worker_service

def test_worker_claim_and_process():
    with TestClient(app) as c:
        res = c.post("/api/auth/local", headers={"x-local-token": config.LOCAL_TOKEN})
        assert res.status_code == 200
        c.headers["x-csrf-token"] = res.json()["csrf"]
        
        # Create job
        job = c.post("/api/jobs", json={"tool": "images"}).json()
        
        # Add image
        img_buf = io.BytesIO()
        Image.new("RGB", (50, 50), "green").save(img_buf, "JPEG")
        c.post(
            f"/api/jobs/{job['id']}/upload",
            files={"file": ("green.jpg", img_buf.getvalue(), "image/jpeg")},
        )
        
        # Queue job
        c.post(f"/api/jobs/{job['id']}/start", json={})
        queued_job = store.get_job(job["id"])
        assert queued_job["state"] == "queued"
        
        # Test worker claim
        claimed = worker_service.claim_next_job()
        assert claimed is not None
        assert claimed["id"] == job["id"]
        assert store.get_job(job["id"])["state"] == "running"
        
        # Test worker process
        success = worker_service.process_job(claimed)
        assert success is True
        
        completed = store.get_job(job["id"])
        assert completed["state"] == "complete"
        assert len(completed["detail"]["outputs"]) == 1

def test_worker_stale_job_recovery():
    # Insert a stale running job
    now = time.time()
    stale_time = now - (config.MAX_SECONDS + 200)
    with store.db() as c:
        c.execute(
            "INSERT INTO jobs(id, owner, tool, state, options, created, updated, locked_at, attempts) VALUES(?,?,?,?,?,?,?,?,?)",
            ("stale-job-id", "local", "images", "running", "{}", stale_time, stale_time, stale_time, 1),
        )
    
    # Running claim_next_job triggers recovery
    worker_service.claim_next_job()
    
    recovered = store.get_job("stale-job-id")
    assert recovered["state"] == "failed"
    assert "timed out or terminated" in recovered["detail"]["message"]
