"""Synthetic sequential conversion benchmark; run from the project root."""

import json
import platform
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from PIL import Image
from backend.models import Options
from backend.operations import images_to_pdf

if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="folio-benchmark-") as scratch:
        folder = Path(scratch)
        source = folder / "sample.jpg"
        Image.new("RGB", (256, 192), (63, 123, 105)).save(source, quality=90)
        items = [
            {"id": str(i), "name": f"image-{i}.jpg", "path": str(source), "modified": i}
            for i in range(5000)
        ]
        started = time.perf_counter()
        outputs, detail = images_to_pdf(
            items,
            Options(quality="Original").model_dump(),
            folder,
            lambda *a, **k: None,
        )
        result = {
            "platform": platform.platform(),
            "python": platform.python_version(),
            "count": 5000,
            "fixture": "Repeated 256x192 solid-color JPEG; no uploads or UI measured",
            "seconds": round(time.perf_counter() - started, 3),
            "output_bytes": (folder / outputs[0]).stat().st_size,
            "pages": detail["pages"],
            "validation": "strict page count plus PDFium first/last rendering",
        }
        if sys.platform == "linux":
            import resource

            result["peak_process_rss_mib"] = round(
                resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 2
            )
        print(json.dumps(result, indent=2))
