import { setupTestEnvironment } from "./testEnv";
setupTestEnvironment();

import { describe, it, expect, beforeEach } from "vitest";
import { router } from "../lib/router";
import { documentSessionStore, DEFAULT_PDF_OPTIONS } from "../lib/documentSessionStore";
import { calculateGeometry } from "../lib/layout";
import { TOOL_REGISTRY } from "../lib/toolRegistry";
import { ImageItem } from "../types";

function createMockImage(id: string, name: string, w = 1080, h = 1920): ImageItem {
  return {
    id,
    file: new File(["mock"], name, { type: "image/jpeg" }),
    name,
    size: 2048,
    modified: Date.now(),
    width: w,
    height: h,
    objectUrl: `blob:mock_${id}`,
    rotation: 0,
  };
}

describe("Mobile Workflow, Navigation State, and Layout Fidelity", () => {
  const TOOL = "images-to-pdf";

  beforeEach(() => {
    documentSessionStore.reset(TOOL);
    if (typeof window !== "undefined" && (window.history as any).reset) {
      (window.history as any).reset();
    }
  });

  it("verifies all 9 tools exist and have valid metadata", () => {
    expect(TOOL_REGISTRY).toHaveLength(9);
    const toolIds = TOOL_REGISTRY.map((t) => t.id);
    expect(toolIds).toContain("images-to-pdf");
    expect(toolIds).toContain("merge-pdf");
    expect(toolIds).toContain("split-pdf");
    expect(toolIds).toContain("rotate-pdf");
    expect(toolIds).toContain("pdf-to-images");
    expect(toolIds).toContain("organize-pdf");
    expect(toolIds).toContain("page-numbers");
    expect(toolIds).toContain("watermark");
    expect(toolIds).toContain("compress-pdf");
  });

  it("calculates accurate Contain geometry for tall/portrait source images without cropping", () => {
    // 9:16 tall smartphone photo or receipt: 1080 x 1920
    const geometry = calculateGeometry({
      imageWidth: 1080,
      imageHeight: 1920,
      options: {
        ...DEFAULT_PDF_OPTIONS,
        pageSize: "A4",
        orientation: "Portrait",
        fit: "Contain",
        marginMm: 12,
      },
    });

    // Image must fit completely within printable area without cropping
    expect(geometry.imageRect.width).toBeLessThanOrEqual(geometry.printableWidthPt);
    expect(geometry.imageRect.height).toBeLessThanOrEqual(geometry.printableHeightPt);
    expect(geometry.cropRect).toBeUndefined(); // No cropping in Contain mode

    // Aspect ratio of the calculated image rect matches original 1080/1920
    const calculatedAspect = geometry.imageRect.width / geometry.imageRect.height;
    const originalAspect = 1080 / 1920;
    expect(Math.abs(calculatedAspect - originalAspect)).toBeLessThan(0.01);
  });

  it("preserves files and settings across simulated navigation", () => {
    // 1. User selects 3 images in Images-to-PDF
    const img1 = createMockImage("img1", "receipt.jpg", 800, 1600);
    const img2 = createMockImage("img2", "photo.png", 1200, 800);
    const img3 = createMockImage("img3", "portrait.jpg", 1080, 1920);

    documentSessionStore.setItems(TOOL, [img1, img2, img3]);
    documentSessionStore.setOptions(TOOL, { pageSize: "Letter", fit: "Contain" });

    // 2. User navigates away to home
    router.navigate({ toolId: "home", stage: "upload" });
    expect(router.getRoute().toolId).toBe("home");

    // 3. User navigates back to images-to-pdf
    router.navigate({ toolId: "images-to-pdf", stage: "editor" });
    expect(router.getRoute().toolId).toBe("images-to-pdf");

    // 4. Session state must be fully preserved
    const state = documentSessionStore.getToolState(TOOL);
    expect(state.items).toHaveLength(3);
    expect(state.items[0].name).toBe("receipt.jpg");
    expect(state.options.pageSize).toBe("Letter");
    expect(state.options.fit).toBe("Contain");
  });

  it("handles batch selection, move earlier/later, and removal cleanly", () => {
    const img1 = createMockImage("1", "first.jpg");
    const img2 = createMockImage("2", "second.jpg");
    const img3 = createMockImage("3", "third.jpg");
    documentSessionStore.setItems(TOOL, [img1, img2, img3]);

    // Select second item
    documentSessionStore.setSelectedIds(TOOL, ["2"]);
    expect(documentSessionStore.getToolState(TOOL).selectedIds).toEqual(["2"]);

    // Move item 1 (second.jpg) to position 0 (earlier)
    documentSessionStore.moveItem(TOOL, 1, 0);
    const reordered = documentSessionStore.getToolState(TOOL).items;
    expect(reordered[0].id).toBe("2");
    expect(reordered[1].id).toBe("1");
    expect(reordered[2].id).toBe("3");

    // Remove selected item ("2")
    documentSessionStore.removeSelected(TOOL);
    const afterRemoval = documentSessionStore.getToolState(TOOL).items;
    expect(afterRemoval).toHaveLength(2);
    expect(afterRemoval.find((i) => i.id === "2")).toBeUndefined();
    expect(documentSessionStore.getToolState(TOOL).selectedIds).toHaveLength(0);
  });
});
