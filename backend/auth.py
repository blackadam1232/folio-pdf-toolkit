import hashlib
import secrets
import time
import uuid
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from . import config
from .store import db, audit

router = APIRouter(prefix="/api/auth")
passwords = PasswordHasher()
DUMMY = passwords.hash(secrets.token_urlsafe(32))


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def email(value):
    result = value.strip().lower()
    if len(result) > 254 or "@" not in result or any(c.isspace() for c in result):
        raise HTTPException(400, "Enter a valid email address")
    return result


def rate_limit(key):
    now = time.time()
    with db() as c:
        c.execute("BEGIN IMMEDIATE")
        c.execute("DELETE FROM attempts WHERE until<?", (now,))
        row = c.execute("SELECT * FROM attempts WHERE key=?", (key,)).fetchone()
        if row and row["count"] >= 10:
            raise HTTPException(429, "Too many attempts. Try again in 15 minutes.")
        c.execute(
            "INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
            (key, now + 900),
        )


def public_user(row):
    return {
        k: row[k]
        for k in ("id", "email", "name", "role", "active", "quota_mb", "retention")
    }


def current(request: Request):
    token = request.cookies.get("folio_session", "")
    with db() as c:
        row = c.execute(
            "SELECT u.*,s.csrf FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.active=1",
            (digest(token), time.time()),
        ).fetchone()
    if not row:
        raise HTTPException(401, "Please sign in")
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if not secrets.compare_digest(
            request.headers.get("x-csrf-token", ""), row["csrf"]
        ):
            raise HTTPException(
                403, "Session verification failed. Refresh and try again."
            )
    return dict(row)


def admin(user=Depends(current)):
    if user["role"] != "admin":
        raise HTTPException(403, "Administrator access required")
    return user


def establish(response, user):
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    with db() as c:
        c.execute("DELETE FROM sessions WHERE expires<?", (time.time(),))
        c.execute(
            "INSERT INTO sessions VALUES(?,?,?,?)",
            (digest(token), user["id"], csrf, time.time() + 43200),
        )
    response.set_cookie(
        "folio_session",
        token,
        httponly=True,
        secure=config.COOKIE_SECURE,
        samesite="strict",
        max_age=43200,
        path="/",
    )
    return {"user": public_user(user), "csrf": csrf, "mode": config.MODE}


class Login(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=256)


class Register(Login):
    name: str = Field(min_length=1, max_length=80)
    invitation: str = Field(min_length=20, max_length=256)


class Reset(BaseModel):
    token: str = Field(min_length=20, max_length=256)
    password: str = Field(min_length=12, max_length=256)


@router.post("/local")
def local_login(request: Request, response: Response):
    if (
        config.MODE != "local"
        or not config.LOCAL_TOKEN
        or not secrets.compare_digest(
            request.headers.get("x-local-token", ""), config.LOCAL_TOKEN
        )
    ):
        raise HTTPException(403, "Open the URL from the local launcher")
    with db() as c:
        user = c.execute("SELECT * FROM users WHERE id='local'").fetchone()
    return establish(response, user)


@router.post("/login")
def login(body: Login, request: Request, response: Response):
    key = email(body.email)
    rate_limit("login:" + key)
    rate_limit("ip:" + request.client.host)
    with db() as c:
        user = c.execute("SELECT * FROM users WHERE email=?", (key,)).fetchone()
    try:
        passwords.verify(
            user["password"] if user and user["password"] else DUMMY, body.password
        )
        if not user or not user["active"]:
            raise ValueError()
    except (VerificationError, InvalidHashError, ValueError):
        raise HTTPException(
            401, "Email or password is incorrect, or the account is disabled"
        )
    with db() as c:
        audit(c, user["id"], "login")
    return establish(response, user)


@router.post("/register")
def register(body: Register, request: Request, response: Response):
    rate_limit("register:" + request.client.host)
    if len(body.password) < 12:
        raise HTTPException(400, "Use a password of at least 12 characters")
    key = email(body.email)
    encoded = passwords.hash(body.password)
    with db() as c:
        c.execute("BEGIN IMMEDIATE")
        ticket = c.execute(
            "SELECT * FROM tickets WHERE token=? AND kind='invite' AND expires>?",
            (digest(body.invitation), time.time()),
        ).fetchone()
        if (
            not ticket
            or ticket["email"] != key
            or c.execute("SELECT 1 FROM users WHERE email=?", (key,)).fetchone()
        ):
            raise HTTPException(400, "Invitation is invalid, expired, or already used")
        uid = str(uuid.uuid4())
        c.execute(
            "INSERT INTO users(id,email,name,password,quota_mb,created) VALUES(?,?,?,?,?,?)",
            (uid, key, body.name, encoded, config.QUOTA_MB, time.time()),
        )
        c.execute("DELETE FROM tickets WHERE token=?", (digest(body.invitation),))
        audit(c, uid, "registered")
        user = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    return establish(response, user)


@router.post("/reset")
def reset(body: Reset, request: Request):
    rate_limit("reset:" + request.client.host)
    encoded = passwords.hash(body.password)
    with db() as c:
        c.execute("BEGIN IMMEDIATE")
        ticket = c.execute(
            "SELECT * FROM tickets WHERE token=? AND kind='reset' AND expires>?",
            (digest(body.token), time.time()),
        ).fetchone()
        if not ticket:
            raise HTTPException(400, "Reset token is invalid or expired")
        user = c.execute(
            "SELECT id FROM users WHERE email=?", (ticket["email"],)
        ).fetchone()
        if not user:
            raise HTTPException(400, "Reset token is invalid")
        c.execute("UPDATE users SET password=? WHERE id=?", (encoded, user["id"]))
        c.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
        c.execute(
            "DELETE FROM tickets WHERE email=? AND kind='reset'", (ticket["email"],)
        )
        audit(c, user["id"], "password_reset")
    return {"ok": True}


@router.get("/me")
def me(user=Depends(current)):
    return {"user": public_user(user), "csrf": user["csrf"], "mode": config.MODE}


@router.post("/logout")
def logout(request: Request, response: Response, user=Depends(current)):
    with db() as c:
        c.execute(
            "DELETE FROM sessions WHERE token=?",
            (digest(request.cookies.get("folio_session", "")),),
        )
    response.delete_cookie("folio_session", path="/")
    return {"ok": True}


class Profile(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    retention: int = Field(ge=1, le=30)


@router.patch("/profile")
def profile(body: Profile, user=Depends(current)):
    with db() as c:
        c.execute(
            "UPDATE users SET name=?,retention=? WHERE id=?",
            (body.name, body.retention, user["id"]),
        )
    return {"ok": True}


class ChangePassword(BaseModel):
    current_password: str = Field(max_length=256)
    password: str = Field(min_length=12, max_length=256)


@router.post("/password")
def change_password(body: ChangePassword, user=Depends(current)):
    if user["id"] == "local":
        raise HTTPException(400, "Local mode does not use a password")
    try:
        passwords.verify(user["password"], body.current_password)
    except (VerificationError, InvalidHashError):
        raise HTTPException(400, "Current password is incorrect")
    with db() as c:
        c.execute(
            "UPDATE users SET password=? WHERE id=?",
            (passwords.hash(body.password), user["id"]),
        )
        c.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
        audit(c, user["id"], "password_changed")
    return {"ok": True}
