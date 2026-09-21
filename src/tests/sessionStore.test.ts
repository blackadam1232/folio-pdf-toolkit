import { describe, it, expect, beforeEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import { compressionSessionStore } from "../lib/compressionSessionStore";

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

async function createTestPdf(): Promise<File> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  page.drawText("Test PDF Document");
  const img = await doc.embedJpg(SAMPLE_JPEG);
  page.drawImage(img, { x: 20, y: 20, width: 50, height: 50 });
  const bytes = await doc.save();
  return new File([bytes.buffer as ArrayBuffer], "test_doc.pdf", {
    type: "application/pdf",
  });
}

describe("Compression Session Store", () => {
  beforeEach(() => {
    compressionSessionStore.reset();
  });

  it("stores and inspects selected PDF file without losing metadata", async () => {
    const file = await createTestPdf();
    const success = await compressionSessionStore.setFile(file);

    expect(success).toBe(true);
    const state = compressionSessionStore.getState();
    expect(state.file).toBe(file);
    expect(state.fileInfo?.name).toBe("test_doc.pdf");
    expect(state.fileInfo?.pageCount).toBe(1);
    expect(state.jobStatus).toBe("idle");
    expect(state.isOutdated).toBe(false);
  });

  it("updates settings and marks existing result as outdated", async () => {
    const file = await createTestPdf();
    await compressionSessionStore.setFile(file);

    // Initial settings
    compressionSessionStore.setSettings(50, "balanced");
    expect(compressionSessionStore.getState().strength).toBe(50);
    expect(compressionSessionStore.getState().preset).toBe("balanced");

    // Start compression and get result
    const result = await compressionSessionStore.startCompression();
    expect(result).not.toBeNull();
    expect(compressionSessionStore.getState().result).not.toBeNull();
    expect(compressionSessionStore.getState().isOutdated).toBe(false);

    // Change settings -> should mark result as outdated
    compressionSessionStore.setSettings(85, "smallest");
    expect(compressionSessionStore.getState().strength).toBe(85);
    expect(compressionSessionStore.getState().isOutdated).toBe(true);
  });

  it("supports explicit cancellation and preserves original file/settings for retry", async () => {
    const file = await createTestPdf();
    await compressionSessionStore.setFile(file);
    compressionSessionStore.setSettings(85, "smallest");

    // Start compression and immediately cancel
    const compressPromise = compressionSessionStore.startCompression();
    compressionSessionStore.cancelCompression();

    await compressPromise;

    const state = compressionSessionStore.getState();
    expect(state.jobStatus).toBe("cancelled");
    expect(state.file).toBe(file);
    expect(state.strength).toBe(85);
    expect(state.preset).toBe("smallest");
  });
});
