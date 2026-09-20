"""Vercel Serverless Function entrypoint for Folio PDF Toolkit API."""

import os
import sys
from pathlib import Path

# Ensure project root is in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

os.environ.setdefault("FOLIO_MODE", "web")
os.environ.setdefault("VERCEL", "1")

from backend.app import app

# Vercel ASGI handler
