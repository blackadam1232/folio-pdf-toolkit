import io
import json
import os
import tempfile
import time
import uuid
from pathlib import Path

os.environ["FOLIO_DATA"] = tempfile.mkdtemp(prefix="folio-tests-")
os.environ["IMAGEPDF_TOKEN"] = "test-token"
from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfReader
from backend import config, store
from backend.app import app
from backend.auth import passwords


def local(c):
    result = c.post("/api/auth/local", headers={"x-local-token": "test-token"})
    assert result.status_code == 200, result.text
    c.headers["x-csrf-token"] = result.json()["csrf"]


def wait(c, jid):
    for _ in range(300):
        job = c.get("/api/jobs/" + jid).json()
        if job["state"] not in ("running", "queued"):
            return job
        time.sleep(0.05)
    raise AssertionError("Worker did not finish")


def add_image(c, job, name="image.png"):
    data = io.BytesIO()
    Image.new("RGB", (40, 60), "red").save(data, "PNG")
    response = c.post(
        f'/api/jobs/{job["id"]}/upload',
        files={"file": (name, data.getvalue(), "image/png")},
    )
    assert response.status_code == 200, response.text


def test_image_revision_and_shared_source_cleanup():
    with TestClient(app) as c:
        assert c.get("/api/jobs").status_code == 401
        local(c)
        assert (
            c.post(
                "/api/jobs",
                json={"tool": "images"},
                headers={"origin": "https://evil.invalid"},
            ).status_code
            == 403
        )
        assert (
            c.post(
                "/api/jobs", json={"tool": "images"}, headers={"x-csrf-token": "bad"}
            ).status_code
            == 403
        )
        job = c.post("/api/jobs", json={"tool": "images"}).json()
        for name in ["10.png", "2.png", "1.png"]:
            add_image(c, job, name)
        assert [f["name"] for f in c.get(f'/api/jobs/{job["id"]}/files').json()] == [
            "1.png",
            "2.png",
            "10.png",
        ]
        assert c.post(f'/api/jobs/{job["id"]}/start', json={}).status_code == 200
        done = wait(c, job["id"])
        assert done["state"] == "complete", done
        assert (
            len(
                PdfReader(
                    io.BytesIO(c.get(f'/api/jobs/{job["id"]}/download/0').content)
                ).pages
            )
            == 3
        )
        revision = c.post(f'/api/jobs/{job["id"]}/revise', json={}).json()
        options = revision["options"]
        options["margin"] = 20
        options["sort"] = "Filename Z-A"
        assert (
            c.patch(
                "/api/jobs/" + revision["id"], json={"options": options}
            ).status_code
            == 200
        )
        assert c.delete("/api/jobs/" + job["id"]).status_code == 200
        assert all(Path(a["path"]).exists() for a in store.job_assets(revision["id"]))
        c.post(f'/api/jobs/{revision["id"]}/start', json={})
        assert wait(c, revision["id"])["state"] == "complete"
        sources = [Path(a["path"]) for a in store.job_assets(revision["id"])]
        c.delete("/api/jobs/" + revision["id"])
        assert not any(p.exists() for p in sources)


def test_user_management_and_isolation(monkeypatch):
    monkeypatch.setattr(config, "MODE", "web")
    monkeypatch.setattr(config, "ORIGIN", "https://testserver")
    monkeypatch.setattr(config, "COOKIE_SECURE", True)
    with TestClient(app, base_url="https://testserver") as admin_client:
        admin_id = str(uuid.uuid4())
        admin_email = f"{admin_id}@example.com"
        with store.db() as c:
            c.execute(
                "INSERT INTO users(id,email,name,password,role,quota_mb,created) VALUES(?,?,?,?,?,?,?)",
                (
                    admin_id,
                    admin_email,
                    "Admin",
                    passwords.hash("Correct-password-123"),
                    "admin",
                    1024,
                    time.time(),
                ),
            )
        response = admin_client.post(
            "/api/auth/login",
            json={"email": admin_email, "password": "Correct-password-123"},
        )
        assert response.status_code == 200, response.text
        admin_client.headers["x-csrf-token"] = response.json()["csrf"]
        target = f"{uuid.uuid4()}@example.com"
        invite = admin_client.post(
            "/api/admin/tickets", json={"email": target, "kind": "invite"}
        ).json()
        # A separate cookie jar represents another user, not another server lifecycle.
        from httpx import Cookies

        original = admin_client.cookies
        admin_client.cookies = Cookies()
        registration = admin_client.post(
            "/api/auth/register",
            json={
                "email": target,
                "name": "Member",
                "password": "Member-password-123",
                "invitation": invite["token"],
            },
        )
        assert registration.status_code == 200, registration.text
        uid = registration.json()["user"]["id"]
        member_csrf = registration.json()["csrf"]
        member_cookies = admin_client.cookies
        admin_client.headers["x-csrf-token"] = member_csrf
        assert admin_client.get("/api/admin/users").status_code == 403
        assert admin_client.get("/api/browse").status_code == 403
        job = admin_client.post("/api/jobs", json={"tool": "images"}).json()
        assert (
            admin_client.post(
                f'/api/jobs/{job["id"]}/folder', json={"path": "/tmp"}
            ).status_code
            == 403
        )
        admin_client.cookies = original
        admin_client.headers["x-csrf-token"] = response.json()["csrf"]
        for endpoint in ["", "/files", "/errors", "/download/0"]:
            assert (
                admin_client.get("/api/jobs/" + job["id"] + endpoint).status_code == 404
            )
        assert (
            admin_client.post("/api/jobs/" + job["id"] + "/revise", json={}).status_code
            == 404
        )
        reset = admin_client.post(
            "/api/admin/tickets", json={"email": target, "kind": "reset"}
        ).json()
        assert (
            admin_client.post(
                "/api/auth/reset",
                json={"token": reset["token"], "password": "Changed-password-456"},
            ).status_code
            == 200
        )
        assert (
            admin_client.post(
                "/api/auth/reset",
                json={"token": reset["token"], "password": "Changed-password-456"},
            ).status_code
            == 400
        )
        admin_client.cookies = member_cookies
        assert admin_client.get("/api/auth/me").status_code == 401
        login = admin_client.post(
            "/api/auth/login",
            json={"email": target, "password": "Changed-password-456"},
        )
        assert login.status_code == 200
        admin_client.cookies = original
        admin_client.headers["x-csrf-token"] = response.json()["csrf"]
        assert (
            admin_client.patch(
                "/api/admin/users/" + uid,
                json={"role": "user", "active": False, "quota_mb": 1024},
            ).status_code
            == 200
        )
        assert (
            admin_client.post(
                "/api/auth/login",
                json={"email": target, "password": "Changed-password-456"},
            ).status_code
            == 401
        )


def test_preview_margin_validation_and_cancel():
    with TestClient(app) as c:
        local(c)
        job = c.post("/api/jobs", json={"tool": "images"}).json()
        add_image(c, job)
        asset = c.get(f'/api/jobs/{job["id"]}/files').json()[0]
        preview = c.post(
            f'/api/jobs/{job["id"]}/preview',
            json={"asset": asset["id"], "options": job["options"]},
        )
        assert preview.status_code == 200, preview.text
        assert preview.content.startswith(b"\x89PNG")
        invalid = {**job["options"], "margins": [0, -1, 0, 0]}
        assert (
            c.patch("/api/jobs/" + job["id"], json={"options": invalid}).status_code
            == 400
        )
        c.post(f'/api/jobs/{job["id"]}/start', json={})
        c.post(f'/api/jobs/{job["id"]}/cancel', json={})
        assert wait(c, job["id"])["state"] == "cancelled"
