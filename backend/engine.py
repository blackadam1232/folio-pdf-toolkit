import json
import os
import time
import zlib
from pathlib import Path
from PIL import Image, ImageOps
from .pdfwriter import PDFWriter

Image.MAX_IMAGE_PIXELS = 40_000_000


def atomic_json(path, value):
    """Publish JSON atomically, tolerating transient Windows sharing locks."""
    import tempfile

    path = Path(path)
    temp = None
    try:
        # Unique per writer: cancellation and worker updates cannot share a .new file.
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=path.name + ".",
            suffix=".new",
            delete=False,
        ) as handle:
            temp = Path(handle.name)
            json.dump(value, handle)
            handle.flush()
        deadline = time.monotonic() + 5.0
        delay = 0.01
        while True:
            try:
                os.replace(temp, path)
                return
            except OSError as exc:
                transient = isinstance(exc, PermissionError) or getattr(
                    exc, "winerror", None
                ) in (5, 32, 33)
                if not transient or time.monotonic() >= deadline:
                    raise
                time.sleep(delay)
                delay = min(delay * 2, 0.2)
    finally:
        if temp is not None:
            try:
                temp.unlink(missing_ok=True)
            except OSError:
                pass


def geometry(width, height, dpi, options):
    top, right, bottom, left = [
        v * 72 / 25.4 for v in (options.get("margins") or [options["margin"]] * 4)
    ]
    original = (width * 72 / dpi, height * 72 / dpi)
    size = options["page_size"]
    pw, ph = (
        original
        if size == "Original"
        else ((595.276, 841.89) if size == "A4" else (612, 792))
    )
    orientation = options["orientation"]
    landscape = orientation == "Landscape" or (orientation == "Auto" and width > height)
    if orientation != "Auto" or size != "Original":
        pw, ph = (max(pw, ph), min(pw, ph)) if landscape else (min(pw, ph), max(pw, ph))
    aw, ah = pw - left - right, ph - top - bottom
    if aw <= 0 or ah <= 0:
        raise ValueError("Margins exceed the page size")
    fit = options["fit"]
    if fit == "Original":
        w, h = original
    else:
        scale = (max if fit == "Cover" else min)(aw / width, ah / height)
        w, h = width * scale, height * scale
    return (pw, ph), (left + (aw - w) / 2, bottom + (ah - h) / 2, w, h)


def prepare(path, target, options):
    with Image.open(path) as source:
        if source.width * source.height > 40_000_000:
            raise ValueError("Image exceeds the 40 megapixel safety limit")
        # One selected file produces one page; multi-frame inputs use frame zero.
        source.seek(0)
        exif_rotation = source.getexif().get(274, 1)
        dpi_raw = source.info.get("dpi", (96, 96))
        try:
            dpi = float(dpi_raw[0])
            if not 10 <= dpi <= 2400:
                dpi = 96
        except (ValueError, TypeError, IndexError):
            dpi = 96
        profile = options.get("profile")
        quality = options.get("quality", "High")
        is_original = (profile == "Original") or (not profile and quality == "Original")
        if (
            source.format == "JPEG"
            and source.mode in ("RGB", "L")
            and exif_rotation == 1
            and is_original
            and not options.get("rotation")
        ):
            # Validate JPEG decoding before embedding, so truncated files are skipped.
            source.load()
            return (
                path,
                source.width,
                source.height,
                ("DeviceGray" if source.mode == "L" else "DeviceRGB"),
                "DCTDecode",
                dpi,
            )
        source.load()
        with ImageOps.exif_transpose(source) as oriented:
            if (
                oriented.mode == "RGBA"
                or "transparency" in oriented.info
                or oriented.mode == "LA"
            ):
                rgba = oriented.convert("RGBA")
                image = Image.new("RGB", rgba.size, "white")
                image.paste(rgba, mask=rgba.getchannel("A"))
                rgba.close()
            else:
                image = oriented.convert("RGB")
            try:
                if options.get("rotation"):
                    turned = image.rotate(-options["rotation"], expand=True)
                    image.close()
                    image = turned
                physical_width = image.width
                if not is_original:
                    if profile == "Screen/Mobile":
                        bound, jpeg_quality, subsampling = 1654, 82, 2
                    elif profile == "Print":
                        bound, jpeg_quality, subsampling = 3508, 92, 1
                    else:
                        bound, jpeg_quality = {
                            "Maximum": (None, 98),
                            "High": (3508, 90),
                            "Medium": (2480, 80),
                            "Small File": (1654, 65),
                        }.get(quality, (2480, 80))
                        subsampling = 0 if quality == "Maximum" else 2

                    if bound and (image.width > bound or image.height > bound):
                        image.thumbnail((bound, bound), Image.Resampling.LANCZOS)
                    image.save(
                        target,
                        "JPEG",
                        quality=jpeg_quality,
                        subsampling=subsampling,
                    )
                    encoding = "DCTDecode"
                else:
                    # Lossless RGB strips; no giant image.tobytes() allocation.
                    compressor = zlib.compressobj(6)
                    with open(target, "wb") as out:
                        for top in range(0, image.height, 64):
                            with image.crop(
                                (0, top, image.width, min(top + 64, image.height))
                            ) as strip:
                                out.write(compressor.compress(strip.tobytes()))
                        out.write(compressor.flush())
                    encoding = "FlateDecode"
                return (
                    target,
                    image.width,
                    image.height,
                    "DeviceRGB",
                    encoding,
                    dpi * image.width / physical_width,
                )
            finally:
                image.close()


def run_job(directory):
    folder = Path(directory)
    manifest = json.loads((folder / "manifest.json").read_text())
    options = manifest["options"]
    status = dict(
        state="running",
        total=len(manifest["files"]),
        processed=0,
        successful=0,
        skipped=0,
        current="",
        elapsed=0,
        eta=None,
        output_bytes=0,
    )
    errors = []
    import logging

    logger = logging.getLogger("folio." + folder.name)
    handler = logging.FileHandler(folder / "job.log", encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.info("Job started: %s images", status["total"])
    start = time.monotonic()
    last_update = 0
    writer = None
    partial = folder / "images.pdf.partial"
    scratch = folder / "image.bin"
    try:
        writer = PDFWriter(partial, total_pages=len(manifest["files"]))
        for item in manifest["files"]:
            if (folder / "cancel").exists():
                status["state"] = "cancelled"
                break
            status["current"] = item["name"]
            try:
                payload, w, h, space, encoding, dpi = prepare(
                    item["path"], scratch, options
                )
                page, rect = geometry(w, h, dpi, options)
                image_key = f"{item['path']}:{options.get('rotation', 0)}:{options.get('profile')}:{options.get('quality')}"
                writer.add(
                    payload,
                    w,
                    h,
                    space,
                    encoding,
                    page,
                    rect,
                    margin=options["margin"] * 72 / 25.4,
                    image_key=image_key,
                )
                status["successful"] += 1
            except OSError as exc:
                if getattr(exc, "errno", None) in (28, 122):
                    raise
                errors.append({"filename": item["name"], "error": str(exc)})
                status["skipped"] += 1
            except Exception as exc:
                errors.append({"filename": item["name"], "error": str(exc)})
                status["skipped"] += 1
            finally:
                scratch.unlink(missing_ok=True)
            status["processed"] += 1
            now = time.monotonic()
            status["elapsed"] = round(now - start, 2)
            status["eta"] = round(
                (now - start)
                / status["processed"]
                * (status["total"] - status["processed"]),
                1,
            )
            status["output_bytes"] = partial.stat().st_size
            if now - last_update >= 0.25:
                atomic_json(folder / "status.json", status)
                last_update = now
        if status["state"] != "cancelled":
            if not writer.pages:
                raise ValueError("No readable images. See the error report.")
            status["state"] = "finalizing"
            atomic_json(folder / "status.json", status)
            writer.finish()
            writer.close()
            writer = None
            from .validation import validate_pdf

            validate_pdf(partial, expected_pages=status["successful"])
            if (folder / "cancel").exists():
                status["state"] = "cancelled"
            else:
                os.replace(partial, folder / "images.pdf")
                status["state"] = "complete"
                status["output_bytes"] = (folder / "images.pdf").stat().st_size
    except Exception as exc:
        status["state"] = "failed"
        status["message"] = str(exc)
    finally:
        if writer:
            writer.close()
        partial.unlink(missing_ok=True)
        scratch.unlink(missing_ok=True)
        import shutil

        if status["state"] != "complete":
            shutil.rmtree(folder / "uploads", ignore_errors=True)
        status["elapsed"] = round(time.monotonic() - start, 2)
        logger.info(
            "Job %s: %s pages, %s skipped, %.2f seconds",
            status["state"],
            status["successful"],
            status["skipped"],
            status["elapsed"],
        )
        for error in errors:
            logger.warning("Skipped %s: %s", error["filename"], error["error"])
        logger.removeHandler(handler)
        handler.close()
        atomic_json(folder / "errors.json", errors)
        atomic_json(folder / "status.json", status)
