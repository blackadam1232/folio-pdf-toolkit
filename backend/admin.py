import secrets
import time
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from .auth import admin, digest, email
from .store import db, audit

router = APIRouter(prefix="/api/admin", dependencies=[Depends(admin)])


@router.get("/users")
def users():
    with db() as c:
        return [
            dict(r)
            for r in c.execute(
                "SELECT id,email,name,role,active,quota_mb,retention,created FROM users ORDER BY created DESC"
            )
        ]


class Ticket(BaseModel):
    email: str
    kind: Literal["invite", "reset"] = "invite"


@router.post("/tickets")
def ticket(body: Ticket, user=Depends(admin)):
    target = email(body.email)
    token = secrets.token_urlsafe(32)
    with db() as c:
        existing = c.execute("SELECT 1 FROM users WHERE email=?", (target,)).fetchone()
        if (body.kind == "reset" and not existing) or (
            body.kind == "invite" and existing
        ):
            raise HTTPException(
                400, "Use reset for an existing account; invite for a new account"
            )
        c.execute("DELETE FROM tickets WHERE email=? AND kind=?", (target, body.kind))
        c.execute(
            "INSERT INTO tickets VALUES(?,?,?,?)",
            (
                digest(token),
                target,
                body.kind,
                time.time() + (3600 if body.kind == "reset" else 86400),
            ),
        )
        audit(c, user["id"], "issued_" + body.kind, target)
    return {
        "token": token,
        "email": target,
        "kind": body.kind,
        "expires_in_seconds": 3600 if body.kind == "reset" else 86400,
    }


class UserUpdate(BaseModel):
    role: Literal["user", "admin"]
    active: bool
    quota_mb: int = Field(ge=128, le=1048576)


@router.patch("/users/{uid}")
def update_user(uid: str, body: UserUpdate, user=Depends(admin)):
    with db() as c:
        c.execute("BEGIN IMMEDIATE")
        target = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        if not target or uid == "local":
            raise HTTPException(400, "This account cannot be changed")
        if (
            target["role"] == "admin"
            and target["active"]
            and (not body.active or body.role != "admin")
        ):
            count = c.execute(
                "SELECT COUNT(*) FROM users WHERE role='admin' AND active=1"
            ).fetchone()[0]
            if count <= 1:
                raise HTTPException(409, "Keep at least one active administrator")
        c.execute(
            "UPDATE users SET role=?,active=?,quota_mb=? WHERE id=?",
            (body.role, int(body.active), body.quota_mb, uid),
        )
        c.execute("DELETE FROM sessions WHERE user_id=?", (uid,))
        if not body.active:
            c.execute(
                "UPDATE jobs SET cancel=1 WHERE owner=? AND state IN ('queued','running')",
                (uid,),
            )
        audit(c, user["id"], "account_updated", uid)
    return {"ok": True}


@router.post("/users/{uid}/revoke-sessions")
def revoke(uid: str, user=Depends(admin)):
    with db() as c:
        c.execute("DELETE FROM sessions WHERE user_id=?", (uid,))
        audit(c, user["id"], "sessions_revoked", uid)
    return {"ok": True}


@router.get("/audit")
def audit_log():
    with db() as c:
        return [
            dict(r) for r in c.execute("SELECT * FROM audit ORDER BY id DESC LIMIT 200")
        ]
