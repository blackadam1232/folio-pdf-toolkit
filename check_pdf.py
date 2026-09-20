"""Usage: .venv\Scripts\python.exe check_pdf.py "C:\path\images.pdf" """

import json
import sys
from pathlib import Path
from backend.validation import validate_pdf

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python check_pdf.py "path/to/images.pdf"')
    path = Path(sys.argv[1])
    print("PDF check:", path.name)
    try:
        result = validate_pdf(path)
        print(json.dumps(result, indent=2))
        print(
            "Structure passed. This does not prove every page renders in every viewer."
        )
        print(
            "If Chrome remains blank, share this result and the app job.log/status.json."
        )
    except Exception as exc:
        print("FAILED:", type(exc).__name__, str(exc))
        if path.exists():
            print("File bytes:", path.stat().st_size)
        sys.exit(1)
