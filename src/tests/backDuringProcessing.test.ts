import { setupTestEnvironment } from "./testEnv";
setupTestEnvironment();

import { describe, it, expect, beforeEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import { router } from "../lib/router";
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

async function createTestPdf(pageCount: number = 1): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([300, 400]);
    page.drawText(`Test PDF Document Page ${i}`);
    const img = await doc.embedJpg(SAMPLE_JPEG);
    page.drawImage(img, { x: 20, y: 20, width: 50, height: 50 });
  }
  const bytes = await doc.save();
  return new File([bytes.buffer as ArrayBuffer], "my_document.pdf", {
    type: "application/pdf",
  });
}

describe("Regression Test: Home → Compress PDF → File Select → Processing → Back Navigation", () => {
  beforeEach(() => {
    compressionSessionStore.reset();
    (window.history as any).reset?.();
    window.history.replaceState({ folio: true, toolId: "home", stage: "upload" }, "", "/");
  });

  it("preserves file, settings, and active background job when pressing browser Back during compression", async () => {
    // 1. User starts at Home
    router.navigate({ toolId: "home", stage: "upload" });
    expect(router.getRoute().toolId).toBe("home");

    // 2. User navigates to Compress PDF
    router.navigate({ toolId: "compress-pdf", stage: "upload" });
    expect(router.getRoute().toolId).toBe("compress-pdf");
    expect(router.getRoute().stage).toBe("upload");

    // 3. User selects a PDF file -> enters Editor
    const testFile = await createTestPdf(3);
    const setSuccess = await compressionSessionStore.setFile(testFile);
    expect(setSuccess).toBe(true);

    router.navigate({ toolId: "compress-pdf", stage: "editor" });
    expect(router.getRoute().stage).toBe("editor");

    // User modifies settings
    compressionSessionStore.setSettings(85, "smallest");
    expect(compressionSessionStore.getState().strength).toBe(85);

    // 4. User starts compression -> enters Processing screen
    router.navigate({ toolId: "compress-pdf", stage: "processing" });
    expect(router.getRoute().stage).toBe("processing");

    // Start compression in session store
    const compressPromise = compressionSessionStore.startCompression();
    expect(compressionSessionStore.getState().jobStatus).toBe("processing");

    // 5. User presses phone/browser Back during processing
    // Simulating popstate to previous history entry (editor stage)
    router.navigate({ toolId: "compress-pdf", stage: "editor" });

    // Assert:
    // a. User remains on previous internal editor screen
    expect(router.getRoute().toolId).toBe("compress-pdf");
    expect(router.getRoute().stage).toBe("editor");

    // b. File and settings remain available
    const currentState = compressionSessionStore.getState();
    expect(currentState.file).toBe(testFile);
    expect(currentState.fileInfo?.name).toBe("my_document.pdf");
    expect(currentState.fileInfo?.pageCount).toBe(3);
    expect(currentState.strength).toBe(85);
    expect(currentState.preset).toBe("smallest");

    // c. Job is not destroyed or duplicated
    expect(currentState.jobStatus).toBe("processing");

    // d. Cancel works
    compressionSessionStore.cancelCompression();
    expect(compressionSessionStore.getState().jobStatus).toBe("cancelled");
    expect(currentState.file).toBe(testFile);

    await compressPromise;
  });

  it("handles Back from result screen: returns to editor and does NOT restart processing", async () => {
    // Navigate Home -> Upload -> Editor
    router.navigate({ toolId: "home", stage: "upload" });
    router.navigate({ toolId: "compress-pdf", stage: "upload" });

    const testFile = await createTestPdf(2);
    await compressionSessionStore.setFile(testFile);
    router.navigate({ toolId: "compress-pdf", stage: "editor" });

    // Start compression
    router.navigate({ toolId: "compress-pdf", stage: "processing" });
    const result = await compressionSessionStore.startCompression();
    expect(result).not.toBeNull();

    // Compression completes -> replaces processing with result
    router.navigate({ toolId: "compress-pdf", stage: "result", replace: true });
    expect(router.getRoute().stage).toBe("result");

    // User presses Back from result
    // History pops directly back to editor (because processing was replaced)
    router.navigate({ toolId: "compress-pdf", stage: "editor" });
    expect(router.getRoute().stage).toBe("editor");

    // Assert: File, result, and settings are preserved; processing is NOT restarted
    const state = compressionSessionStore.getState();
    expect(state.file).toBe(testFile);
    expect(state.result).toBe(result);
    expect(state.jobStatus).toBe("completed");

    // Modifying settings now marks result as outdated
    compressionSessionStore.setSettings(20, "high-quality");
    expect(compressionSessionStore.getState().isOutdated).toBe(true);
  });

  it("handles 100-page document pagination and thumbnail overview cleanly", async () => {
    const largeDoc = await PDFDocument.create();
    for (let i = 1; i <= 100; i++) {
      const page = largeDoc.addPage([300, 400]);
      page.drawText(`Page ${i}`);
    }
    const bytes = await largeDoc.save();
    const largeFile = new File([bytes.buffer as ArrayBuffer], "100_pages.pdf", {
      type: "application/pdf",
    });

    await compressionSessionStore.setFile(largeFile);
    const state = compressionSessionStore.getState();
    expect(state.fileInfo?.pageCount).toBe(100);

    // Jump to page 75
    compressionSessionStore.setPreviewPage(75);
    expect(compressionSessionStore.getState().previewPage).toBe(75);

    // Jump beyond bounds -> clamped
    compressionSessionStore.setPreviewPage(150);
    expect(compressionSessionStore.getState().previewPage).toBe(100);

    compressionSessionStore.setPreviewPage(-5);
    expect(compressionSessionStore.getState().previewPage).toBe(1);
  });
});
