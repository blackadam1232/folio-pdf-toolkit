import json
import io
import os
from pathlib import Path
import pytest
from PIL import Image
from pypdf import PdfReader
from backend.engine import run_job, atomic_json
from backend.pdfwriter import PDFWriter

OPTIONS = dict(
    page_size="A4",
    orientation="Auto",
    fit="Contain",
    margin=0,
    quality="Original",
    sort="Natural filename",
)


def setup_job(tmp_path, files, **options):
    job = tmp_path / "job"
    job.mkdir()
    atomic_json(
        job / "manifest.json",
        {
            "files": [{"path": str(p), "name": p.name} for p in files],
            "options": {**OPTIONS, **options},
        },
    )
    return job


def test_formats_corruption_rotation_transparency(tmp_path):
    paths = []
    for ext in ["jpg", "png", "webp", "bmp", "tiff"]:
        p = tmp_path / f"image.{ext}"
        Image.new("RGB", (80, 120), (200, 30, 40)).save(p)
        paths.append(p)
    transparent = tmp_path / "transparent.png"
    Image.new("RGBA", (80, 120), (0, 0, 255, 0)).save(transparent)
    paths.append(transparent)
    rotated = tmp_path / "rotated.jpg"
    exif = Image.Exif()
    exif[274] = 6
    Image.new("RGB", (80, 120), "green").save(rotated, exif=exif)
    paths.append(rotated)
    bad = tmp_path / "broken.jpg"
    bad.write_bytes(b"not an image")
    paths.append(bad)
    job = setup_job(tmp_path, paths)
    run_job(job)
    status = json.loads((job / "status.json").read_text())
    assert (
        status["state"] == "complete"
        and status["successful"] == 7
        and status["skipped"] == 1
    )
    reader = PdfReader(job / "images.pdf", strict=True)
    assert len(reader.pages) == 7
    assert reader.pages[-1].mediabox.width > reader.pages[-1].mediabox.height
    assert reader.pages[5].images[0].image.getpixel((0, 0)) == (255, 255, 255)
    assert not (job / "image.bin").exists()


@pytest.mark.parametrize(
    "quality", ["Original", "Maximum", "High", "Medium", "Small File"]
)
@pytest.mark.parametrize("fit", ["Contain", "Cover", "Original"])
def test_options(tmp_path, quality, fit):
    p = tmp_path / "test.png"
    Image.new("RGB", (180, 90), "blue").save(p)
    job = setup_job(
        tmp_path,
        [p],
        quality=quality,
        fit=fit,
        margin=20,
        orientation="Portrait",
        page_size="Letter",
    )
    run_job(job)
    page = PdfReader(job / "images.pdf").pages[0]
    assert float(page.mediabox.width) == 612
    assert len(page.images) == 1


def test_cancel(tmp_path):
    p = tmp_path / "test.jpg"
    Image.new("RGB", (10, 10)).save(p)
    job = setup_job(tmp_path, [p])
    (job / "cancel").touch()
    run_job(job)
    assert json.loads((job / "status.json").read_text())["state"] == "cancelled"
    assert (
        not (job / "images.pdf").exists() and not (job / "images.pdf.partial").exists()
    )


def test_64bit_xref(tmp_path):
    p = tmp_path / "test.jpg"
    Image.new("RGB", (10, 10)).save(p)
    out = tmp_path / "large-offset.pdf"
    writer = PDFWriter(out)
    # Sparse gap tests offsets beyond 4 GiB without allocating a 4 GiB RAM buffer.
    writer.file.seek(2**32 + 100)
    writer.add(p, 10, 10, "DeviceRGB", "DCTDecode", (100, 100), (0, 0, 100, 100))
    writer.finish()
    writer.close()
    with out.open("rb") as stream:
        reader = PdfReader(stream, strict=True)
        assert len(reader.pages) == 1 and reader.pages[0].images[0].image.size == (
            10,
            10,
        )
    out.unlink()


def test_disk_full_cleanup(tmp_path, monkeypatch):
    p = tmp_path / "test.jpg"
    Image.new("RGB", (30, 30)).save(p)
    job = setup_job(tmp_path, [p])

    def disk_full(*args, **kwargs):
        raise OSError(28, "No space left on device")

    monkeypatch.setattr(PDFWriter, "add", disk_full)
    run_job(job)
    assert json.loads((job / "status.json").read_text())["state"] == "failed"
    assert not (job / "images.pdf.partial").exists()


def test_margins_clip_cover(tmp_path):
    p = tmp_path / "wide.jpg"
    Image.new("RGB", (200, 50)).save(p)
    job = setup_job(tmp_path, [p], fit="Cover", margin=20)
    run_job(job)
    commands = PdfReader(job / "images.pdf").pages[0].get_contents().get_data()
    assert b"q 56.69291 56.69291" in commands


def test_atomic_json_retries_windows_lock(tmp_path, monkeypatch):
    from backend import engine

    target = tmp_path / "status.json"
    target.write_text('{"state":"running"}')
    replace = engine.os.replace
    attempts = []

    def locked_then_released(source, destination):
        attempts.append(str(source))
        if len(attempts) <= 3:
            error = PermissionError("Windows sharing lock")
            error.winerror = 5
            raise error
        return replace(source, destination)

    monkeypatch.setattr(engine.os, "replace", locked_then_released)
    engine.atomic_json(target, {"state": "complete"})
    assert json.loads(target.read_text()) == {"state": "complete"}
    assert len(attempts) == 4
    assert list(tmp_path.glob("*.new")) == []


def test_atomic_json_disk_error_preserves_old_status(tmp_path, monkeypatch):
    from backend import engine

    target = tmp_path / "status.json"
    target.write_text('{"state":"running"}')

    def fail(source, destination):
        raise OSError(28, "Disk full")

    monkeypatch.setattr(engine.os, "replace", fail)
    with pytest.raises(OSError):
        engine.atomic_json(target, {"state": "complete"})
    assert json.loads(target.read_text()) == {"state": "running"}
    assert list(tmp_path.glob("*.new")) == []


def test_validation_rejects_truncated_pdf(tmp_path):
    from backend.validation import validate_pdf

    p = tmp_path / "test.jpg"
    Image.new("RGB", (30, 30)).save(p)
    job = setup_job(tmp_path, [p])
    run_job(job)
    output = job / "images.pdf"
    assert validate_pdf(output)["pages"] == 1
    with output.open("r+b") as stream:
        stream.truncate(output.stat().st_size - 25)
    with pytest.raises(ValueError, match="incomplete"):
        validate_pdf(output)
