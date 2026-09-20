"""PDF operations. Called only inside bounded background processes."""

import io
import os
import re
import shutil
import time
from contextlib import ExitStack
from pathlib import Path
from natsort import natsorted
from PIL import Image, ImageOps
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen.canvas import Canvas
from . import config
from .engine import prepare, geometry
from .pdfwriter import PDFWriter as ImagePDFWriter


def ordered(items, options):
    mode = options["sort"]
    if mode == "Manual":
        positions = {key: i for i, key in enumerate(options["order"])}
        return sorted(items, key=lambda f: positions.get(f["id"], len(positions)))
    if mode.startswith("Natural"):
        return natsorted(
            items,
            key=lambda f: (f["name"].casefold(), f["id"]),
            reverse=mode == "Natural descending",
        )
    if mode.startswith("Filename"):
        return sorted(
            items,
            key=lambda f: (f["name"].casefold(), f["id"]),
            reverse=mode == "Filename Z-A",
        )
    return sorted(
        items,
        key=lambda f: (f["modified"], f["name"].casefold(), f["id"]),
        reverse=mode == "Newest first",
    )


def page_range(text, count):
    if not text.strip():
        return list(range(count))
    result = []
    for token in text.replace("–", "-").split(","):
        match = re.fullmatch(r"\s*(\d+)(?:\s*-\s*(\d+))?\s*", token)
        if not match:
            raise ValueError("Use page ranges such as 1-5, 8, 12-15")
        first = int(match[1])
        last = int(match[2] or first)
        if first < 1 or last < first or last > count:
            raise ValueError(f"Page range must be within 1-{count}")
        for number in range(first - 1, last):
            if number not in result:
                result.append(number)
    return result


def read_pdf(path, password, stack):
    if Path(path).stat().st_size > config.PDF_MB * 1048576:
        raise ValueError(
            f"PDF input exceeds the {config.PDF_MB} MB per-file processing limit"
        )
    reader = PdfReader(stack.enter_context(open(path, "rb")), strict=False)
    if reader.is_encrypted and not reader.decrypt(password):
        raise ValueError("This PDF requires the correct input password")
    if len(reader.pages) > config.MAX_PAGES:
        raise ValueError("PDF exceeds configured page-count limit")
    return reader


def overlay(page, tool, options, number, count):
    # Normalize existing rotation before placing visible overlays.
    page.transfer_rotation_to_content()
    width, height = float(page.mediabox.width), float(page.mediabox.height)
    buffer = io.BytesIO()
    canvas = Canvas(buffer, pagesize=(width, height))
    size = options["font_size"]
    canvas.setFont("Helvetica", size)
    color = options["color"].lstrip("#")
    canvas.setFillColorRGB(*(int(color[i : i + 2], 16) / 255 for i in (0, 2, 4)))
    canvas.setFillAlpha(options["opacity"] if tool == "watermark" else 1)
    position = options["position"]
    x = (
        24
        if position.endswith("left")
        else width - 24 if position.endswith("right") else width / 2
    )
    y = (
        height - size - 24
        if position.startswith("top")
        else 24 if position.startswith("bottom") else height / 2
    )
    text = (
        options["text"]
        if tool == "watermark"
        else (
            str(number)
            if options["numbering"] == "number"
            else f"Page {number} of {count}"
        )
    )
    canvas.translate(x, y)
    canvas.rotate(options["angle"] if tool == "watermark" else 0)
    if position.endswith("left"):
        canvas.drawString(0, 0, text)
    elif position.endswith("right"):
        canvas.drawRightString(0, 0, text)
    else:
        canvas.drawCentredString(0, 0, text)
    canvas.save()
    buffer.seek(0)
    page.merge_page(PdfReader(buffer).pages[0])


def verify_output(path, password="", expected=None, render=True):
    import pypdfium2 as pdfium

    with open(path, "rb") as stream:
        if stream.read(5) != b"%PDF-":
            raise ValueError("Invalid PDF header")
        stream.seek(max(0, Path(path).stat().st_size - 1024))
        if not stream.read().rstrip().endswith(b"%%EOF"):
            raise ValueError("Incomplete PDF trailer")
        stream.seek(0)
        reader = PdfReader(stream, strict=True)
        if reader.is_encrypted and not reader.decrypt(password):
            raise ValueError("Output encryption verification failed")
        count = len(reader.pages)
        if count < 1 or (expected is not None and count != expected):
            raise ValueError("Unexpected output page count")
    if render:
        with pdfium.PdfDocument(str(path), password=password or None) as doc:
            for index in sorted({0, len(doc) - 1}):
                page = doc[index]
                try:
                    width, height = page.get_size()
                    if width <= 0 or height <= 0:
                        raise ValueError("Invalid page dimensions")
                    bitmap = page.render(scale=min(0.25, 256 / max(width, height)))
                    bitmap.close()
                finally:
                    page.close()
    return count


def images_to_pdf(items, options, folder, progress):
    writer = ImagePDFWriter(folder / "document.pdf.partial", total_pages=len(items))
    errors = []
    try:
        items = ordered(items, options)
        for index, item in enumerate(items):
            progress(index, len(items), item["name"])
            settings = {**options, "rotation": options["rotations"].get(item["id"], 0)}
            scratch = folder / "image.bin"
            try:
                payload, w, h, space, encoding, dpi = prepare(
                    item["path"], scratch, settings
                )
                page, rect = geometry(w, h, dpi, settings)
                top, right, bottom, left = [
                    v * 72 / 25.4
                    for v in (options["margins"] or [options["margin"]] * 4)
                ]
                image_key = f"{item['path']}:{settings.get('rotation', 0)}:{settings.get('profile')}:{settings.get('quality')}"
                writer.add(
                    payload,
                    w,
                    h,
                    space,
                    encoding,
                    page,
                    rect,
                    clip=(left, bottom, page[0] - left - right, page[1] - top - bottom),
                    image_key=image_key,
                )
            except OSError as exc:
                if exc.errno in (28, 122):
                    raise
                errors.append(
                    {
                        "filename": item["name"],
                        "error": type(exc).__name__
                        + ": image unavailable or unreadable",
                    }
                )
            except ValueError as exc:
                # Invalid layout is a job error, not an image to silently skip.
                if "Margins" in str(exc):
                    raise
                errors.append({"filename": item["name"], "error": str(exc)})
            except Exception as exc:
                errors.append(
                    {
                        "filename": item["name"],
                        "error": type(exc).__name__ + ": image could not be decoded",
                    }
                )
            finally:
                scratch.unlink(missing_ok=True)
        if not writer.pages:
            raise ValueError("No readable images were found")
        count = len(writer.pages)
        writer.finish()
    finally:
        writer.close()
    progress(
        len(items), len(items), "Validating PDF", phase="validating", errors=errors
    )
    verify_output(folder / "document.pdf.partial", expected=count)
    os.replace(folder / "document.pdf.partial", folder / "document.pdf")
    return ["document.pdf"], {"pages": count, "skipped": len(errors), "errors": errors}


def pdf_operation(
    tool, items, options, folder, progress, input_password="", output_password=""
):
    outputs = []
    extra = {}
    with ExitStack() as stack:
        if len(items) > 200:
            raise ValueError(
                "Merge accepts up to 200 PDFs per job; merge larger collections in batches"
            )
        readers = [
            read_pdf(item["path"], input_password, stack)
            for item in ordered(items, options)
        ]
        if not readers:
            raise ValueError("Select a PDF")
        if tool != "merge" and len(readers) != 1:
            raise ValueError("This tool accepts one PDF at a time")
        reader = readers[0]
        indices = page_range(options["ranges"], len(reader.pages))
        if tool == "render":
            import pypdfium2 as pdfium

            with pdfium.PdfDocument(
                str(items[0]["path"]), password=input_password or None
            ) as document:
                for step, index in enumerate(indices):
                    progress(step, len(indices), f"Page {index+1}")
                    page = document[index]
                    try:
                        w, h = page.get_size()
                        scale = options["dpi"] / 72
                        if w * h * scale * scale > 40_000_000:
                            raise ValueError(
                                "Requested render exceeds 40 megapixels; reduce DPI"
                            )
                        bitmap = page.render(scale=scale)
                        try:
                            image = bitmap.to_pil().convert("RGB")
                            suffix = (
                                "png" if options["image_format"] == "PNG" else "jpg"
                            )
                            filename = f"page-{index+1:05d}.{suffix}"
                            image.save(folder / filename, quality=92)
                            image.close()
                            outputs.append(filename)
                        finally:
                            bitmap.close()
                    finally:
                        page.close()
            return outputs, {"pages": len(indices)}
        if tool == "split":
            groups = (
                [page_range(s, len(reader.pages)) for s in options["groups"].split(";")]
                if options["groups"].strip()
                else [[i] for i in indices]
            )
        else:
            groups = [indices]
        for group_index, group in enumerate(groups):
            writer = PdfWriter()
            try:
                if tool == "merge":
                    total = sum(len(r.pages) for r in readers)
                    if total > config.MAX_PAGES:
                        raise ValueError("Merged PDF exceeds page-count limit")
                    n = 0
                    for source in readers:
                        for page in source.pages:
                            progress(n, total, f"Page {n+1}")
                            writer.add_page(page)
                            n += 1
                elif tool == "organize":
                    sequence = options["pages"] or [
                        {"page": i + 1, "rotation": 0} for i in indices
                    ]
                    for n, entry in enumerate(sequence):
                        progress(n, len(sequence), f'Page {entry["page"]}')
                        if not 1 <= entry["page"] <= len(reader.pages):
                            raise ValueError("Page number is outside the document")
                        page = writer.add_page(reader.pages[entry["page"] - 1])
                        if entry["rotation"]:
                            page.rotate(entry["rotation"])
                else:
                    selection = (
                        group
                        if tool in ("extract", "split")
                        else list(range(len(reader.pages)))
                    )
                    for n, index in enumerate(selection):
                        progress(
                            group_index if tool == "split" else n,
                            len(groups) if tool == "split" else len(selection),
                            f"Page {index+1}",
                        )
                        page = writer.add_page(reader.pages[index])
                        if tool in ("numbers", "watermark") and index in indices:
                            overlay(
                                page,
                                tool,
                                options,
                                options["start_number"] + indices.index(index),
                                len(indices),
                            )
                        if tool == "compress":
                            page.compress_content_streams()
                            if options["compression"] == "lossy":
                                for embedded in page.images:
                                    if embedded.indirect_reference is None:
                                        continue
                                    obj = embedded.indirect_reference.get_object()
                                    if (
                                        "/SMask" in obj
                                        or "/Mask" in obj
                                        or embedded.image.mode not in ("RGB", "L")
                                    ):
                                        continue
                                    with embedded.image.copy() as image:
                                        image.thumbnail((2000, 2000))
                                        embedded.replace(image, quality=75)
                if tool == "protect":
                    if len(output_password) < 12:
                        raise ValueError(
                            "Output password must have at least 12 characters"
                        )
                    writer.encrypt(output_password, algorithm="AES-256")
                filename = (
                    f"part-{group_index+1:05d}.pdf"
                    if tool == "split"
                    else "document.pdf"
                )
                temp = folder / (filename + ".partial")
                with temp.open("wb") as out:
                    writer.write(out)
                verify_output(
                    temp,
                    password=output_password if tool == "protect" else "",
                    expected=len(writer.pages),
                )
                os.replace(temp, folder / filename)
                outputs.append(filename)
            finally:
                writer.close()
        if tool == "compress":
            before = Path(items[0]["path"]).stat().st_size
            after = (folder / outputs[0]).stat().st_size
            if after >= before:
                shutil.copyfile(items[0]["path"], folder / outputs[0])
                after = before
                extra["note"] = "Optimization did not reduce size; original preserved."
            extra.update(
                original_bytes=before, result_bytes=after, saved_bytes=before - after
            )
    return outputs, extra


def preview(asset, options, tool, page_index, password, folder):
    import pypdfium2 as pdfium

    if tool == "images":
        settings = {**options, "rotation": options["rotations"].get(asset["id"], 0)}
        payload, w, h, space, encoding, dpi = prepare(
            asset["path"], folder / "preview.bin", settings
        )
        size, rect = geometry(w, h, dpi, settings)
        top, right, bottom, left = [
            v * 72 / 25.4 for v in (options["margins"] or [options["margin"]] * 4)
        ]
        writer = ImagePDFWriter(folder / "preview.pdf", total_pages=1)
        try:
            writer.add(
                payload,
                w,
                h,
                space,
                encoding,
                size,
                rect,
                clip=(left, bottom, size[0] - left - right, size[1] - top - bottom),
            )
            writer.finish()
        finally:
            writer.close()
        source = folder / "preview.pdf"
        count = 1
    else:
        with ExitStack() as stack:
            reader = read_pdf(asset["path"], password, stack)
            count = len(reader.pages)
            if page_index < 0 or page_index >= count:
                raise ValueError("Page does not exist")
            writer = PdfWriter()
            page = writer.add_page(reader.pages[page_index])
            if tool in ("numbers", "watermark"):
                selected = page_range(options["ranges"], count)
                if page_index in selected:
                    overlay(
                        page,
                        tool,
                        options,
                        options["start_number"] + selected.index(page_index),
                        len(selected),
                    )
            with (folder / "preview.pdf").open("wb") as out:
                writer.write(out)
            writer.close()
        source = folder / "preview.pdf"
    with pdfium.PdfDocument(str(source)) as document:
        page = document[0]
        try:
            w, h = page.get_size()
            bitmap = page.render(scale=min(700 / max(w, h), 2))
            try:
                buffer = io.BytesIO()
                bitmap.to_pil().save(buffer, "PNG")
                return buffer.getvalue(), count
            finally:
                bitmap.close()
        finally:
            page.close()
