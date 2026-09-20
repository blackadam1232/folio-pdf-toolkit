"""Start one local server and open the bundled interface."""

import multiprocessing
import os
import secrets
import threading
import time
import webbrowser
import socket

if __name__ == "__main__":
    multiprocessing.freeze_support()
    os.environ["FOLIO_MODE"] = "local"
    from pathlib import Path

    data = Path(os.environ.get("FOLIO_DATA", Path.home() / ".folio-toolkit"))
    data.mkdir(parents=True, exist_ok=True)
    instance = open(data / "app.lock", "a+b")
    instance.seek(0)
    instance.write(b"0")
    instance.flush()
    instance.seek(0)
    try:
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(instance.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(instance.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        raise SystemExit(
            "Folio is already running. Close its existing terminal window first."
        )
    token = secrets.token_urlsafe(32)
    os.environ["IMAGEPDF_TOKEN"] = token
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    url = f"http://127.0.0.1:{port}/#token={token}"

    def launch():
        for _ in range(100):
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                    webbrowser.open(url)
                    return
            except OSError:
                time.sleep(0.1)

    threading.Thread(target=launch, daemon=True).start()
    print(
        "\nFOLIO PDF TOOLKIT — keep this window open. Ctrl+C stops the app.\n"
        + url
        + "\n",
        flush=True,
    )
    import uvicorn

    uvicorn.run("backend.app:app", host="127.0.0.1", port=port, access_log=False)
