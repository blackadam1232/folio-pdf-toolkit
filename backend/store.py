"""Persistent job queue, dual-database driver (SQLite / PostgreSQL), and asset ownership."""

import json
import os
import sqlite3
import time
from contextlib import contextmanager
from . import config


class PostgresCursorWrapper:
    def __init__(self, raw_cursor):
        self.cursor = raw_cursor

    def execute(self, sql, params=None):
        clean_sql = sql.strip()
        if clean_sql.upper().startswith("BEGIN IMMEDIATE"):
            return self
        if clean_sql.upper().startswith("PRAGMA"):
            return self
        # Convert ? to %s for PostgreSQL
        converted_sql = sql.replace("?", "%s")
        if "INSERT OR IGNORE INTO users" in converted_sql:
            converted_sql = converted_sql.replace("INSERT OR IGNORE INTO users", "INSERT INTO users") + " ON CONFLICT (id) DO NOTHING"
        self.cursor.execute(converted_sql, params or ())
        return self

    def executemany(self, sql, seq_of_params):
        converted_sql = sql.replace("?", "%s")
        self.cursor.executemany(converted_sql, seq_of_params)
        return self

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()

    def executescript(self, script):
        for stmt in script.split(";"):
            s = stmt.strip()
            if s:
                self.execute(s)
        return self


class PostgresConnectionWrapper:
    def __init__(self, conn):
        self.conn = conn

    def cursor(self):
        import psycopg2.extras
        return PostgresCursorWrapper(self.conn.cursor(cursor_factory=psycopg2.extras.DictCursor))

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()

    def execute(self, sql, params=None):
        cur = self.cursor()
        cur.execute(sql, params)
        return cur


@contextmanager
def db():
    if config.DATABASE_URL and (config.DATABASE_URL.startswith("postgres://") or config.DATABASE_URL.startswith("postgresql://")):
        import psycopg2
        url = config.DATABASE_URL
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        raw_conn = psycopg2.connect(url, connect_timeout=15)
        wrapped = PostgresConnectionWrapper(raw_conn)
        cur = wrapped.cursor()
        try:
            yield cur
            wrapped.commit()
        except Exception:
            wrapped.rollback()
            raise
        finally:
            wrapped.close()
    else:
        connection = sqlite3.connect(config.ROOT / "folio.sqlite3", timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()


def init():
    config.validate()
    with db() as c:
        c.execute("PRAGMA journal_mode=WAL")
        is_pg = bool(config.DATABASE_URL and ("postgres" in config.DATABASE_URL))
        id_type = "SERIAL PRIMARY KEY" if is_pg else "INTEGER PRIMARY KEY AUTOINCREMENT"
        real_type = "DOUBLE PRECISION" if is_pg else "REAL"
        
        tables = f"""
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,
          password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',active INTEGER NOT NULL DEFAULT 1,
          quota_mb INTEGER NOT NULL,retention INTEGER NOT NULL DEFAULT 7,created {real_type} NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          csrf TEXT NOT NULL,expires {real_type} NOT NULL);
        CREATE TABLE IF NOT EXISTS tickets (
          token TEXT PRIMARY KEY,email TEXT NOT NULL,kind TEXT NOT NULL,expires {real_type} NOT NULL);
        CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY,count INTEGER NOT NULL,until {real_type} NOT NULL);
        CREATE TABLE IF NOT EXISTS assets (
          id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,
          path TEXT NOT NULL,size BIGINT NOT NULL,modified {real_type} NOT NULL,managed INTEGER NOT NULL,storage_key TEXT DEFAULT NULL);
        CREATE TABLE IF NOT EXISTS jobs (
          id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),tool TEXT NOT NULL,
          state TEXT NOT NULL,options TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '{{}}',
          created {real_type} NOT NULL,updated {real_type} NOT NULL,parent TEXT,cancel INTEGER NOT NULL DEFAULT 0,
          locked_at {real_type} DEFAULT NULL,locked_by TEXT DEFAULT NULL,attempts INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS job_assets (
          job TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
          asset TEXT NOT NULL REFERENCES assets(id),position INTEGER NOT NULL,
          PRIMARY KEY(job,asset));
        CREATE TABLE IF NOT EXISTS audit (
          id {id_type},actor TEXT,action TEXT NOT NULL,target TEXT,created {real_type} NOT NULL);
        """
        for stmt in tables.strip().split(";"):
            s = stmt.strip()
            if s:
                c.execute(s)

        if config.MODE == "local":
            c.execute(
                "INSERT OR IGNORE INTO users VALUES ('local','local@localhost','Local workspace','','admin',1,?,7,?)",
                (config.QUOTA_MB, time.time()),
            )


def audit(c, actor, action, target=""):
    c.execute(
        "INSERT INTO audit(actor,action,target,created) VALUES(?,?,?,?)",
        (actor, action, target, time.time()),
    )


def get_job(jobid, owner=None):
    with db() as c:
        row = c.execute(
            "SELECT * FROM jobs WHERE id=?" + (" AND owner=?" if owner else ""),
            (jobid, owner) if owner else (jobid,),
        ).fetchone()
    if not row:
        return None
    result = dict(row)
    result["options"] = json.loads(result["options"])
    result["detail"] = json.loads(result["detail"])
    return result


def job_assets(jobid):
    with db() as c:
        return [
            dict(r)
            for r in c.execute(
                "SELECT a.* FROM assets a JOIN job_assets j ON a.id=j.asset WHERE j.job=? ORDER BY j.position",
                (jobid,),
            )
        ]


def update(jobid, state=None, detail=None):
    with db() as c:
        if state:
            c.execute(
                "UPDATE jobs SET state=?,updated=? WHERE id=?",
                (state, time.time(), jobid),
            )
        if detail is not None:
            c.execute(
                "UPDATE jobs SET detail=?,updated=? WHERE id=?",
                (json.dumps(detail), time.time(), jobid),
            )
