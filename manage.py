"""Offline administrative bootstrap. No default passwords or public bootstrap endpoint."""

import argparse
import getpass
import time
import uuid
from backend import store, config
from backend.auth import passwords, email

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["create-admin"])
    parser.add_argument("--email", required=True)
    args = parser.parse_args()
    store.init()
    password = getpass.getpass("New admin password (12+ characters): ")
    if len(password) < 12 or password != getpass.getpass("Repeat password: "):
        raise SystemExit("Passwords must match and contain at least 12 characters")
    with store.db() as c:
        c.execute(
            "INSERT INTO users(id,email,name,password,role,quota_mb,created) VALUES(?,?,?,?,?,?,?)",
            (
                str(uuid.uuid4()),
                email(args.email),
                "Administrator",
                passwords.hash(password),
                "admin",
                config.QUOTA_MB,
                time.time(),
            ),
        )
    print("Administrator created. Start the server and sign in.")
