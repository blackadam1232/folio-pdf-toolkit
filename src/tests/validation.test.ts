import { describe, it, expect } from "vitest";
import {
  validateImageFile,
  validatePdfBytes,
  MAX_FILES_LIMIT,
  MAX_TOTAL_BYTES_LIMIT,
  MAX_PIXELS_LIMIT,
} from "../lib/pdfEngine";

describe("Validation & Safety Limits", () => {
  describe("Image file validation", () => {
    it("accepts supported JPEG files", () => {
      const file = new File([new Uint8Array([1, 2, 3])], "photo.jpg", { type: "image/jpeg" });
      expect(validateImageFile(file).valid).toBe(true);
    });

    it("accepts supported PNG files", () => {
      const file = new File([new Uint8Array([1, 2, 3])], "screenshot.png", { type: "image/png" });
      expect(validateImageFile(file).valid).toBe(true);
    });

    it("accepts supported WebP files", () => {
      const file = new File([new Uint8Array([1, 2, 3])], "graphic.webp", { type: "image/webp" });
      expect(validateImageFile(file).valid).toBe(true);
    });

    it("rejects unsupported image extensions (.bmp, .tiff, .gif, .svg)", () => {
      const bmp = new File([new Uint8Array([1, 2])], "old.bmp", { type: "image/bmp" });
      const resBmp = validateImageFile(bmp);
      expect(resBmp.valid).toBe(false);
      expect(resBmp.error).toMatch(/not a supported image format/i);

      const tiff = new File([new Uint8Array([1, 2])], "photo.tiff", { type: "image/tiff" });
      expect(validateImageFile(tiff).valid).toBe(false);

      const gif = new File([new Uint8Array([1, 2])], "anim.gif", { type: "image/gif" });
      expect(validateImageFile(gif).valid).toBe(false);
    });

    it("rejects empty files (0 bytes)", () => {
      const empty = new File([], "empty.jpg", { type: "image/jpeg" });
      const res = validateImageFile(empty);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/empty \(0 bytes\)/i);
    });
  });

  describe("Safety Thresholds", () => {
    it("enforces documented limits", () => {
      expect(MAX_FILES_LIMIT).toBe(150);
      expect(MAX_TOTAL_BYTES_LIMIT).toBe(300 * 1024 * 1024);
      expect(MAX_PIXELS_LIMIT).toBe(40_000_000);
    });
  });

  describe("Generated PDF Byte Validation", () => {
    it("validates a buffer starting with %PDF- and containing %%EOF", () => {
      const validPdf = new TextEncoder().encode(
        "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF"
      );
      expect(validatePdfBytes(validPdf).valid).toBe(true);
    });

    it("fails validation when %PDF- header is missing", () => {
      const invalidHeader = new TextEncoder().encode(
        "NOT_A_PDF\n% padded comment to exceed thirty-two bytes\n%%EOF"
      );
      const res = validatePdfBytes(invalidHeader);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/Invalid PDF header/i);
    });

    it("fails validation when %%EOF trailer is missing", () => {
      const missingEof = new TextEncoder().encode(
        "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n"
      );
      const res = validatePdfBytes(missingEof);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/missing %%EOF/i);
    });

    it("fails validation for truncated/empty buffers", () => {
      expect(validatePdfBytes(new Uint8Array([])).valid).toBe(false);
      expect(validatePdfBytes(new Uint8Array([1, 2, 3])).valid).toBe(false);
    });
  });
});
