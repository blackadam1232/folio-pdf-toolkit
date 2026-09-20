import io
from pathlib import Path
import pytest
from reportlab.pdfgen.canvas import Canvas
from pypdf import PdfReader
from backend.models import Options
from backend.operations import pdf_operation, page_range, ordered, verify_output


def source(root, name="source.pdf"):
    p = root / name
    canvas = Canvas(str(p), pagesize=(300, 400))
    for index in range(3):
        canvas.drawString(30, 200, f"Original page {index+1}")
        canvas.showPage()
    canvas.save()
    return {
        "id": name,
        "name": name,
        "path": str(p),
        "modified": 0,
        "size": p.stat().st_size,
    }


def progress(*args, **kwargs):
    pass


@pytest.mark.parametrize(
    "tool",
    [
        "merge",
        "extract",
        "split",
        "organize",
        "render",
        "compress",
        "numbers",
        "watermark",
        "protect",
        "unlock",
    ],
)
def test_pdf_tools(tmp_path, tool):
    asset = source(tmp_path)
    items = [asset]
    output = tmp_path / "out"
    output.mkdir()
    options = Options().model_dump()
    if tool == "merge":
        items.append(source(tmp_path, "second.pdf"))
    if tool == "extract":
        options["ranges"] = "3,1"
    if tool == "split":
        options["groups"] = "1-2;3"
    if tool == "organize":
        options["pages"] = [
            {"page": 3, "rotation": 90},
            {"page": 1, "rotation": 0},
            {"page": 1, "rotation": 0},
        ]
    outputs, extra = pdf_operation(
        tool, items, options, output, progress, output_password="Output-password-123"
    )
    assert outputs
    if tool == "render":
        from PIL import Image

        assert len(outputs) == 3
        with Image.open(output / outputs[0]) as image:
            assert image.width > 100
        return
    for name in outputs:
        verify_output(
            output / name, password="Output-password-123" if tool == "protect" else ""
        )
    reader = PdfReader(output / outputs[0])
    if tool == "protect":
        assert reader.is_encrypted
        assert reader.decrypt("Output-password-123")
        encrypted = {**asset, "path": str(output / outputs[0])}
        unlock = tmp_path / "unlock"
        unlock.mkdir()
        pdf_operation(
            "unlock",
            [encrypted],
            options,
            unlock,
            progress,
            input_password="Output-password-123",
        )
        assert not PdfReader(unlock / "document.pdf").is_encrypted
    if tool == "merge":
        assert len(reader.pages) == 6
    if tool == "extract":
        assert "Original page 3" in reader.pages[0].extract_text()
    if tool == "organize":
        assert reader.pages[0].rotation == 90 and len(reader.pages) == 3
    if tool == "numbers":
        assert "Page 1 of 3" in reader.pages[0].extract_text()
    if tool == "watermark":
        assert "CONFIDENTIAL" in reader.pages[0].extract_text()
    if tool == "compress":
        assert extra["result_bytes"] <= extra["original_bytes"]


def test_sort_and_ranges():
    files = [{"id": str(i), "name": f"{i}.jpg", "modified": i} for i in [10, 2, 1]]
    assert [f["name"] for f in ordered(files, Options().model_dump())] == [
        "1.jpg",
        "2.jpg",
        "10.jpg",
    ]
    for mode, expected in [
        ("Filename A-Z", ["1.jpg", "10.jpg", "2.jpg"]),
        ("Filename Z-A", ["2.jpg", "10.jpg", "1.jpg"]),
        ("Natural descending", ["10.jpg", "2.jpg", "1.jpg"]),
    ]:
        assert [
            f["name"] for f in ordered(files, {**Options().model_dump(), "sort": mode})
        ] == expected
    with pytest.raises(ValueError):
        page_range("1-99", 3)
    assert page_range("3,1-2", 3) == [2, 0, 1]
