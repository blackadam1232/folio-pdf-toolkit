"""Small image-only PDF 1.7 writer. Payloads go to disk, never a document buffer."""

import hashlib
import io
import os
import shutil
import struct
from pathlib import Path


class PDFWriter:
    def __init__(self, path, total_pages=None, branch_factor=32):
        self.file = open(path, "w+b")
        self.file.write(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
        self.offsets = [0, 0, 0]
        self.pages = []
        self.image_cache = {}
        self.branch_factor = max(4, branch_factor)
        self.total_pages = total_pages
        if total_pages is not None and total_pages > self.branch_factor:
            num_groups = (total_pages + self.branch_factor - 1) // self.branch_factor
            self.group_nodes = [self.reserve() for _ in range(num_groups)]
        else:
            self.group_nodes = []

    def reserve(self):
        self.offsets.append(0)
        return len(self.offsets) - 1

    def obj(self, number, body):
        self.offsets[number] = self.file.tell()
        self.file.write(f"{number} 0 obj\n".encode() + body + b"\nendobj\n")

    def stream(self, number, dictionary, source, length):
        self.offsets[number] = self.file.tell()
        self.file.write(
            f"{number} 0 obj\n<< {dictionary} /Length {length} >>\nstream\n".encode()
        )
        shutil.copyfileobj(source, self.file, 1024 * 1024)
        self.file.write(b"\nendstream\nendobj\n")

    def add(
        self,
        payload,
        width,
        height,
        colorspace,
        filter_name,
        page_size,
        rect,
        decode="",
        margin=0,
        clip=None,
        image_key=None,
    ):
        start = self.file.tell()
        # Automatic payload hash deduplication if no key provided
        if not image_key and payload:
            hasher = hashlib.sha256()
            with open(payload, "rb") as f:
                while chunk := f.read(65536):
                    hasher.update(chunk)
            image_key = f"sha256:{hasher.hexdigest()}"

        reused = image_key and image_key in self.image_cache
        if reused:
            image = self.image_cache[image_key]
            page, content = self.reserve(), self.reserve()
            reserved_count = 2
        else:
            page, image, content = self.reserve(), self.reserve(), self.reserve()
            reserved_count = 3
        pw, ph = page_size
        x, y, w, h = rect
        try:
            if not reused:
                with open(payload, "rb") as src:
                    self.stream(
                        image,
                        f"/Type /XObject /Subtype /Image /Width {width} /Height {height} /ColorSpace /{colorspace} /BitsPerComponent 8 /Filter /{filter_name} {decode}",
                        src,
                        Path(payload).stat().st_size,
                    )
                if image_key:
                    self.image_cache[image_key] = image
            cx, cy, cw, ch = clip or (margin, margin, pw - 2 * margin, ph - 2 * margin)
            commands = f"q {cx:.5f} {cy:.5f} {cw:.5f} {ch:.5f} re W n {w:.5f} 0 0 {h:.5f} {x:.5f} {y:.5f} cm /Im0 Do Q".encode()

            self.stream(content, "", io.BytesIO(commands), len(commands))

            # Determine parent object in page tree
            if self.group_nodes:
                group_idx = min(len(self.pages) // self.branch_factor, len(self.group_nodes) - 1)
                parent_obj = self.group_nodes[group_idx]
            else:
                parent_obj = 2

            self.obj(
                page,
                f"<< /Type /Page /Parent {parent_obj} 0 R /MediaBox [0 0 {pw:.5f} {ph:.5f}] /Resources << /XObject << /Im0 {image} 0 R >> >> /Contents {content} 0 R >>".encode(),
            )
            self.pages.append(page)
        except Exception:
            self.file.seek(start)
            self.file.truncate()
            del self.offsets[-reserved_count:]
            raise

    def finish(self):
        self.obj(1, b"<< /Type /Catalog /Pages 2 0 R >>")
        if self.group_nodes:
            # Build intermediate /Pages tree nodes
            chunks = []
            for i in range(0, len(self.pages), self.branch_factor):
                chunks.append(self.pages[i : i + self.branch_factor])
            for idx, chunk_pages in enumerate(chunks):
                gid = self.group_nodes[idx]
                kids = " ".join(f"{n} 0 R" for n in chunk_pages)
                self.obj(
                    gid,
                    f"<< /Type /Pages /Parent 2 0 R /Count {len(chunk_pages)} /Kids [{kids}] >>".encode(),
                )
            active_kids = " ".join(f"{self.group_nodes[i]} 0 R" for i in range(len(chunks)))
            self.obj(
                2,
                f"<< /Type /Pages /Count {len(self.pages)} /Kids [{active_kids}] >>".encode(),
            )
        else:
            kids = " ".join(f"{n} 0 R" for n in self.pages)
            self.obj(
                2, f"<< /Type /Pages /Count {len(self.pages)} /Kids [{kids}] >>".encode()
            )
        xref = self.reserve()
        position = self.file.tell()
        self.offsets[xref] = position
        # Cross-reference stream uses 64-bit offsets (no classic 10-digit limit).
        entries = io.BytesIO()
        entries.write(struct.pack(">BQH", 0, 0, 65535))
        for offset in self.offsets[1:]:
            entries.write(struct.pack(">BQH", 1, offset, 0))
        length = entries.tell()
        entries.seek(0)
        self.stream(
            xref,
            f"/Type /XRef /Size {len(self.offsets)} /W [1 8 2] /Root 1 0 R",
            entries,
            length,
        )
        self.file.write(f"startxref\n{position}\n%%EOF\n".encode())
        self.file.flush()
        os.fsync(self.file.fileno())

    def close(self):
        self.file.close()

