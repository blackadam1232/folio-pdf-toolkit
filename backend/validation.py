"""Structural checks with a separate PDF parser; does not guarantee every viewer."""

from pathlib import Path
from pypdf import PdfReader


def validate_pdf(path, expected_pages=None):
    path = Path(path)
    size = path.stat().st_size
    with path.open("rb") as stream:
        if stream.read(5) != b"%PDF-":
            raise ValueError("File does not start with a PDF header")
        stream.seek(max(0, size - 1024))
        if not stream.read().rstrip().endswith(b"%%EOF"):
            raise ValueError("PDF is incomplete: final EOF marker is missing")
        stream.seek(0)
        reader = PdfReader(stream, strict=True)
        count = len(reader.pages)
        if count == 0 or (expected_pages is not None and count != expected_pages):
            raise ValueError(
                f"PDF page count mismatch: {count}, expected {expected_pages}"
            )
        for index in sorted({0, count - 1}):
            page = reader.pages[index]
            if float(page.mediabox.width) <= 0 or float(page.mediabox.height) <= 0:
                raise ValueError("Invalid PDF page dimensions")
            if not page.get_contents().get_data():
                raise ValueError("Page drawing instructions missing")
            resources = page.get("/Resources", {})
            if not resources.get("/XObject"):
                raise ValueError("Page image resource missing")
    return {"bytes": size, "pages": count, "structural_check": "passed"}
