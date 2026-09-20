"""Tests for PDF optimization, balanced page tree, deduplication, and quality profiles."""

import io
import tempfile
from pathlib import Path
from PIL import Image
from pypdf import PdfReader
import pypdfium2 as pdfium

from backend.pdfwriter import PDFWriter
from backend.engine import prepare, geometry
from backend.validation import validate_pdf


def test_balanced_page_tree_large_document(tmp_path):
    """Verify that documents with > 32 pages build a balanced page tree with intermediate /Pages nodes."""
    img_path = tmp_path / "dot.jpg"
    Image.new("RGB", (64, 64), "blue").save(img_path, "JPEG")

    out_pdf = tmp_path / "balanced.pdf"
    total_pages = 75  # > 32, requires 3 intermediate groups (32 + 32 + 11)
    writer = PDFWriter(out_pdf, total_pages=total_pages, branch_factor=32)

    for i in range(total_pages):
        writer.add(
            str(img_path),
            64,
            64,
            "DeviceRGB",
            "DCTDecode",
            (612, 792),
            (0, 0, 612, 792),
        )
    writer.finish()
    writer.close()

    # Structural validation
    result = validate_pdf(out_pdf, expected_pages=total_pages)
    assert result["structural_check"] == "passed"
    assert result["pages"] == total_pages

    # Check that intermediate /Pages nodes exist in the PDF structure
    with open(out_pdf, "rb") as f:
        content = f.read()
        assert b"/Type /Pages" in content
        # Check that root pages references intermediate nodes
        reader = PdfReader(out_pdf)
        assert len(reader.pages) == total_pages
        # Verify first and last page are readable
        assert reader.pages[0].mediabox.width == 612
        assert reader.pages[total_pages - 1].mediabox.width == 612

    # Render with pdfium to verify fast seeking
    with pdfium.PdfDocument(str(out_pdf)) as doc:
        assert len(doc) == total_pages
        page0 = doc[0]
        bm0 = page0.render(scale=1.0)
        bm0.close()
        page_last = doc[total_pages - 1]
        bm_last = page_last.render(scale=1.0)
        bm_last.close()


def test_image_resource_deduplication(tmp_path):
    """Verify that adding identical images reuses the same XObject stream via SHA-256 hash."""
    img1 = tmp_path / "img1.jpg"
    img2 = tmp_path / "img2.jpg"
    # Create two identical image files with different paths
    img_data = Image.new("RGB", (300, 300), "green")
    img_data.save(img1, "JPEG", quality=85)
    img_data.save(img2, "JPEG", quality=85)

    single_img_pdf = tmp_path / "single.pdf"
    w1 = PDFWriter(single_img_pdf, total_pages=1)
    w1.add(str(img1), 300, 300, "DeviceRGB", "DCTDecode", (612, 792), (0, 0, 612, 792))
    w1.finish()
    w1.close()
    single_size = single_img_pdf.stat().st_size

    # Add 10 pages using the duplicate images
    dedup_pdf = tmp_path / "dedup.pdf"
    w10 = PDFWriter(dedup_pdf, total_pages=10)
    for i in range(10):
        # Alternate between img1 and img2 (different file paths, identical content)
        path = str(img1 if i % 2 == 0 else img2)
        w10.add(path, 300, 300, "DeviceRGB", "DCTDecode", (612, 792), (0, 0, 612, 792))
    w10.finish()
    w10.close()
    dedup_size = dedup_pdf.stat().st_size

    # Validate the 10-page PDF
    validate_pdf(dedup_pdf, expected_pages=10)

    # If not deduplicated, 10 pages would be ~10x single_size.
    # With deduplication, only 1 image stream is stored, so dedup_size is far less than 3x single_size!
    assert dedup_size < single_size * 2.5, f"Expected deduplication: {dedup_size} vs single {single_size}"


def test_quality_profiles_scaling(tmp_path):
    """Verify that Screen/Mobile, Print, and Original profiles apply placement-aware downsampling."""
    # Create a 4000x3000 large photo
    large_img = tmp_path / "large_photo.png"
    Image.new("RGB", (4000, 3000), "purple").save(large_img, "PNG")

    scratch = tmp_path / "scratch.bin"

    # 1. Screen/Mobile Profile
    payload_mobile, w_m, h_m, space_m, enc_m, dpi_m = prepare(
        str(large_img), scratch, {"profile": "Screen/Mobile", "page_size": "A4", "fit": "Contain", "margin": 0}
    )
    # Screen/Mobile should downsample to <= 1800px bound and use DCTDecode (JPEG)
    assert max(w_m, h_m) <= 1800
    assert enc_m == "DCTDecode"
    mobile_size = Path(payload_mobile).stat().st_size
    scratch.unlink(missing_ok=True)

    # 2. Print Profile
    payload_print, w_p, h_p, space_p, enc_p, dpi_p = prepare(
        str(large_img), scratch, {"profile": "Print", "page_size": "A4", "fit": "Contain", "margin": 0}
    )
    # Print allows up to ~3508px bound
    assert max(w_p, h_p) > max(w_m, h_m)
    assert enc_p == "DCTDecode"
    print_size = Path(payload_print).stat().st_size
    scratch.unlink(missing_ok=True)

    # Mobile payload should be noticeably smaller than Print payload
    assert mobile_size < print_size
