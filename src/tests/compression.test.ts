import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  mapStrengthToSettings,
  getPresetForStrength,
  compressPdf,
} from "../lib/compressEngine";

// Minimal 1x1 white JPEG binary
const SAMPLE_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
  0x00, 0x60, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x30, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0x7f, 0x00, 0xff, 0xd9,
]);

describe("Compress Engine & Mapping Verification", () => {
  it("maps slider strength to monotonic settings at 1%, 20%, 50%, 85%, and 100%", () => {
    const s1 = mapStrengthToSettings(1);
    const s20 = mapStrengthToSettings(20);
    const s50 = mapStrengthToSettings(50);
    const s85 = mapStrengthToSettings(85);
    const s100 = mapStrengthToSettings(100);

    // 1% should be gentlest supported optimization
    expect(s1.quality).toBeCloseTo(0.95, 2);
    expect(s1.maxDimension).toBe(2600);

    // 100% should be strongest safe supported settings
    expect(s100.quality).toBeCloseTo(0.28, 2);
    expect(s100.maxDimension).toBe(1000);

    // Monotonicity checks: quality must strictly decrease
    expect(s1.quality).toBeGreaterThan(s20.quality);
    expect(s20.quality).toBeGreaterThan(s50.quality);
    expect(s50.quality).toBeGreaterThan(s85.quality);
    expect(s85.quality).toBeGreaterThan(s100.quality);

    // Monotonicity checks: maxDimension must strictly decrease
    expect(s1.maxDimension).toBeGreaterThan(s20.maxDimension);
    expect(s20.maxDimension).toBeGreaterThan(s50.maxDimension);
    expect(s50.maxDimension).toBeGreaterThan(s85.maxDimension);
    expect(s85.maxDimension).toBeGreaterThan(s100.maxDimension);
  });

  it("correctly identifies standard presets and custom values", () => {
    expect(getPresetForStrength(20)).toBe("high-quality");
    expect(getPresetForStrength(50)).toBe("balanced");
    expect(getPresetForStrength(85)).toBe("smallest");
    expect(getPresetForStrength(37)).toBe("custom");
    expect(getPresetForStrength(1)).toBe("custom");
    expect(getPresetForStrength(100)).toBe("custom");
  });

  it("compresses and verifies output PDF preserves page count and loads cleanly", async () => {
    // Generate a test PDF with text and an embedded image
    const doc = await PDFDocument.create();
    const page1 = doc.addPage([300, 400]);
    page1.drawText("Preserved Document Text Page 1");
    const embeddedImg = await doc.embedJpg(SAMPLE_JPEG);
    page1.drawImage(embeddedImg, { x: 50, y: 50, width: 100, height: 100 });

    const page2 = doc.addPage([300, 400]);
    page2.drawText("Preserved Document Text Page 2");

    const pdfBytes = await doc.save();
    const testFile = new File([pdfBytes.buffer as ArrayBuffer], "sample.pdf", {
      type: "application/pdf",
    });

    const result = await compressPdf(testFile, 50);

    expect(result.pageCount).toBe(2);
    expect(result.originalBytes).toBe(pdfBytes.length);
    expect(result.outputBytes).toBeGreaterThan(100);

    // Verify output re-loads and preserves pages
    const reloaded = await PDFDocument.load(await result.blob.arrayBuffer());
    expect(reloaded.getPageCount()).toBe(2);
  });
});
