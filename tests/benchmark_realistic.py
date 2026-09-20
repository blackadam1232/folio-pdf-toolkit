"""Realistic photographic and document benchmark comparing Screen/Mobile, Print, and Original profiles."""

import io
import json
import platform
import sys
import tempfile
import time
from pathlib import Path
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.models import Options
from backend.operations import images_to_pdf
import pypdfium2 as pdfium

def create_synthetic_photo(width=2400, height=1800, seed=0):
    img = Image.new("RGB", (width, height), (30 + seed * 20 % 200, 70 + seed * 15 % 180, 110 + seed * 30 % 140))
    draw = ImageDraw.Draw(img)
    # Add text and geometric patterns to simulate real document/photo details
    for i in range(0, width, 120):
        draw.line([(i, 0), (width - i, height)], fill=(200, 200, 200), width=3)
    for j in range(0, height, 80):
        draw.rectangle([j, j, j + 60, j + 60], outline=(255, 220, 50), width=2)
    draw.text((100, 100), f"Folio Benchmark Page {seed + 1} High Resolution Sample", fill=(255, 255, 255))
    return img

def benchmark_profile(profile_name, items, scratch_dir):
    out_folder = scratch_dir / profile_name.replace("/", "_")
    out_folder.mkdir(exist_ok=True)
    
    t0 = time.perf_counter()
    outputs, detail = images_to_pdf(
        items,
        Options(profile=profile_name).model_dump(),
        out_folder,
        lambda *a, **k: None,
    )
    process_seconds = round(time.perf_counter() - t0, 3)
    pdf_path = out_folder / outputs[0]
    file_bytes = pdf_path.stat().st_size
    
    # Measure PDF opening time and scrolling through all pages
    t_open_start = time.perf_counter()
    with pdfium.PdfDocument(str(pdf_path)) as doc:
        time_to_first_page = round(time.perf_counter() - t_open_start, 4)
        
        # Scroll simulation: render every page
        t_scroll_start = time.perf_counter()
        for i in range(len(doc)):
            page = doc[i]
            bmp = page.render(scale=1.0)
            bmp.close()
            page.close()
        scroll_seconds = round(time.perf_counter() - t_scroll_start, 4)
    
    return {
        "profile": profile_name,
        "pages": len(items),
        "file_bytes": file_bytes,
        "file_size_mb": round(file_bytes / (1024 * 1024), 2),
        "conversion_seconds": process_seconds,
        "time_to_first_page_sec": time_to_first_page,
        "total_render_scroll_sec": scroll_seconds,
        "avg_page_render_ms": round((scroll_seconds / len(items)) * 1000, 2),
    }

if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="folio-bench-real-") as tmp:
        tmp_path = Path(tmp)
        # Create 10 distinct high-resolution photos (2400x1800, simulating smartphone photos)
        print("Generating 10 realistic 2400x1800 test photos...")
        items = []
        for i in range(10):
            img_path = tmp_path / f"photo_{i:02d}.jpg"
            img = create_synthetic_photo(2400, 1800, seed=i)
            img.save(img_path, "JPEG", quality=95)
            items.append({
                "id": str(i),
                "name": f"photo_{i:02d}.jpg",
                "path": str(img_path),
                "modified": time.time(),
            })
        
        results = {}
        for prof in ["Screen/Mobile", "Print", "Original"]:
            print(f"Benchmarking profile: {prof}...")
            results[prof] = benchmark_profile(prof, items, tmp_path)
            print(f"  Result: {results[prof]['file_size_mb']} MB, scroll: {results[prof]['total_render_scroll_sec']}s ({results[prof]['avg_page_render_ms']} ms/page)")
        
        report_file = Path("BENCHMARK_PROFILES.json")
        report_file.write_text(json.dumps(results, indent=2))
        print(f"\nWrote full benchmark report to {report_file.resolve()}")
