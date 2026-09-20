# Development

Python 3.11+ and Node 22+ are required for rebuilding. The archive includes `frontend/dist`.

```sh
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements-dev.txt
cd frontend
npm ci
npm run build
cd ..
python -m pytest tests -q
python run.py
```

On Windows use `py -3` if `python` is unavailable. Runtime direct Python requirements are pinned; `requirements-lock.txt` records the full tested Python dependency set. Install it instead for a more reproducible environment. The frontend lockfile records its dependency tree. Rebuild and commit `frontend/dist` whenever frontend source changes.

`backend/app.py` owns authenticated routes and asset references; `auth.py` and `admin.py` own accounts; `store.py` owns SQLite transactions; `worker.py` owns process limits, queueing and cancellation; `operations.py` owns PDF transformations. `engine.py` and `pdfwriter.py` implement sequential image conversion. React components separate accounts, administration, document settings and editing.

No user documents, account database, passwords, virtual environment or node_modules belong in source control. Tests create temporary fixtures and isolated data directories. Run `python tests/benchmark_current.py` for a synthetic 5,000-image conversion; its measurements are not predictions for large photographic inputs.

Use a new draft or revision for changed input/options. Completed output is immutable through the API. Shared source references prevent deleting an input still needed by another revision. PDF page edits preserve document content where the underlying library supports it, but are not a full PDF editor.
