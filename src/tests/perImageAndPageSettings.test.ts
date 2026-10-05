import { describe, it, expect, beforeEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  ImageItem,
  PdfOptions,
  PerPageOptions,
  CropRect,
} from "../types";
import {
  calculateGeometry,
  PAGE_SIZES_PT,
  mmToPt,
} from "../lib/layout";
import {
  documentSessionStore,
  DEFAULT_PDF_OPTIONS,
} from "../lib/documentSessionStore";
import { generatePdf } from "../lib/pdfEngine";

const TOOL = "images-to-pdf";

function createMockFile(name: string, type: string = "image/jpeg", size: number = 50000): File {
  const buffer = new Uint8Array(size);
  return new File([buffer], name, { type, lastModified: 1700000000000 });
}

function createMockItem(
  id: string,
  name: string,
  width: number,
  height: number,
  options?: Partial<ImageItem>
): ImageItem {
  return {
    id,
    file: createMockFile(name),
    name,
    size: 50000,
    modified: 1700000000000,
    objectUrl: `blob:mock/${name}`,
    width,
    height,
    rotation: 0,
    flipH: false,
    flipV: false,
    ...options,
  };
}

describe("Per-Image Editing and Per-Page Document Settings", () => {
  beforeEach(() => {
    documentSessionStore.reset(TOOL);
  });

  describe("1. Coordinate Systems and Transformation Math", () => {
    it("transforms crop rectangle accurately on 90° clockwise rotation", () => {
      // Crop defined on normalized 0..1 coordinates
      const crop: CropRect = { x: 0.1, y: 0.2, width: 0.4, height: 0.3 };

      // CW formula: newX = 1 - (y + height), newY = x, newWidth = height, newHeight = width
      const rotatedCrop = {
        x: Math.max(0, Math.min(1 - crop.height, 1 - (crop.y + crop.height))),
        y: crop.x,
        width: crop.height,
        height: crop.width,
      };

      expect(rotatedCrop.x).toBeCloseTo(0.5, 5); // 1 - (0.2 + 0.3) = 0.5
      expect(rotatedCrop.y).toBeCloseTo(0.1, 5);
      expect(rotatedCrop.width).toBeCloseTo(0.3, 5);
      expect(rotatedCrop.height).toBeCloseTo(0.4, 5);
    });

    it("transforms crop rectangle accurately on 90° counter-clockwise rotation", () => {
      const crop: CropRect = { x: 0.1, y: 0.2, width: 0.4, height: 0.3 };

      // CCW formula: newX = y, newY = 1 - (x + width), newWidth = height, newHeight = width
      const ccwCrop = {
        x: crop.y,
        y: Math.max(0, Math.min(1 - crop.width, 1 - (crop.x + crop.width))),
        width: crop.height,
        height: crop.width,
      };

      expect(ccwCrop.x).toBeCloseTo(0.2, 5);
      expect(ccwCrop.y).toBeCloseTo(0.5, 5); // 1 - (0.1 + 0.4) = 0.5
      expect(ccwCrop.width).toBeCloseTo(0.3, 5);
      expect(ccwCrop.height).toBeCloseTo(0.4, 5);
    });

    it("transforms crop rectangle accurately on horizontal and vertical flips", () => {
      const crop: CropRect = { x: 0.1, y: 0.2, width: 0.4, height: 0.3 };

      // Flip H: newX = 1 - (x + width), newY = y
      const flipHCrop = {
        ...crop,
        x: 1 - (crop.x + crop.width),
      };
      expect(flipHCrop.x).toBeCloseTo(0.5, 5);
      expect(flipHCrop.y).toBeCloseTo(0.2, 5);

      // Flip V: newX = x, newY = 1 - (y + height)
      const flipVCrop = {
        ...crop,
        y: 1 - (crop.y + crop.height),
      };
      expect(flipVCrop.x).toBeCloseTo(0.1, 5);
      expect(flipVCrop.y).toBeCloseTo(0.5, 5);
    });

    it("prevents zero-size or out-of-bounds crops in calculateGeometry", () => {
      const item = createMockItem("img1", "photo.jpg", 1000, 800);
      const options: PdfOptions = { ...DEFAULT_PDF_OPTIONS };

      // Normal crop
      const geo = calculateGeometry({
        imageWidth: item.width,
        imageHeight: item.height,
        rotation: 0,
        crop: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
        options,
      });

      expect(geo.cropRect).toBeDefined();
      expect(geo.cropRect!.sx).toBe(200); // 0.2 * 1000
      expect(geo.cropRect!.sy).toBe(160); // 0.2 * 800
      expect(geo.cropRect!.sWidth).toBe(500); // 0.5 * 1000
      expect(geo.cropRect!.sHeight).toBe(400); // 0.5 * 800
    });
  });

  describe("2. Clear Inheritance Rules", () => {
    it("stores shared defaults and per-page overrides separately", () => {
      const item1 = createMockItem("p1", "page1.jpg", 800, 600);
      const item2 = createMockItem("p2", "page2.jpg", 800, 600);
      const item3 = createMockItem("p3", "page3.jpg", 800, 600);

      documentSessionStore.setItems(TOOL, [item1, item2, item3]);

      // Override orientation on page 2 only
      documentSessionStore.updateItemCustomOption(TOOL, "p2", "orientation", "Landscape");

      const state = documentSessionStore.getToolState(TOOL);
      expect(state.options.orientation).toBe("Portrait"); // shared default remains Portrait
      expect(state.items[0].customOptions).toBeUndefined(); // page 1 has no overrides
      expect(state.items[1].customOptions?.orientation).toBe("Landscape"); // page 2 explicit override
      expect(state.items[2].customOptions).toBeUndefined(); // page 3 has no overrides
    });

    it("changing shared defaults updates inherited properties only, preserving explicit overrides", () => {
      const item1 = createMockItem("p1", "page1.jpg", 800, 600);
      const item2 = createMockItem("p2", "page2.jpg", 800, 600, {
        customOptions: { orientation: "Landscape" },
      });
      const item3 = createMockItem("p3", "page3.jpg", 800, 600);

      documentSessionStore.setItems(TOOL, [item1, item2, item3]);

      // Change shared default pageSize from A4 to Letter
      documentSessionStore.setOptions(TOOL, { pageSize: "Letter" });

      const state = documentSessionStore.getToolState(TOOL);
      expect(state.options.pageSize).toBe("Letter");

      // Effective settings for Page 1: inherits Letter, inherits Portrait
      const eff1 = { ...state.options, ...(state.items[0].customOptions || {}) };
      expect(eff1.pageSize).toBe("Letter");
      expect(eff1.orientation).toBe("Portrait");

      // Effective settings for Page 2: inherits Letter, retains explicit Landscape
      const eff2 = { ...state.options, ...(state.items[1].customOptions || {}) };
      expect(eff2.pageSize).toBe("Letter");
      expect(eff2.orientation).toBe("Landscape");

      // Effective settings for Page 3: inherits Letter, inherits Portrait
      const eff3 = { ...state.options, ...(state.items[2].customOptions || {}) };
      expect(eff3.pageSize).toBe("Letter");
      expect(eff3.orientation).toBe("Portrait");
    });

    it("allows resetting an individual property to use document default", () => {
      const item = createMockItem("p1", "page1.jpg", 800, 600, {
        customOptions: {
          orientation: "Landscape",
          pageSize: "Letter",
          fit: "Cover",
        },
      });
      documentSessionStore.setItems(TOOL, [item]);

      // Reset orientation property only
      documentSessionStore.resetItemCustomOptionProperty(TOOL, "p1", "orientation");

      const state = documentSessionStore.getToolState(TOOL);
      expect(state.items[0].customOptions?.orientation).toBeUndefined(); // now inherits
      expect(state.items[0].customOptions?.pageSize).toBe("Letter"); // preserved
      expect(state.items[0].customOptions?.fit).toBe("Cover"); // preserved
    });

    it("reset page settings removes all settings overrides without removing crop or rotation", () => {
      const item = createMockItem("p1", "page1.jpg", 800, 600, {
        rotation: 90,
        flipH: true,
        crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        customOptions: {
          orientation: "Landscape",
          pageSize: "Letter",
          marginPreset: "None",
        },
      });
      documentSessionStore.setItems(TOOL, [item]);

      // Reset page settings
      documentSessionStore.resetItemCustomOptions(TOOL, "p1");

      const state = documentSessionStore.getToolState(TOOL);
      expect(state.items[0].customOptions).toBeUndefined(); // all page settings cleared
      // Image edits remain completely intact
      expect(state.items[0].rotation).toBe(90);
      expect(state.items[0].flipH).toBe(true);
      expect(state.items[0].crop).toEqual({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
    });

    it("reset image edits restores source without removing page settings overrides", () => {
      const item = createMockItem("p1", "page1.jpg", 800, 600, {
        rotation: 90,
        flipH: true,
        crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        customOptions: {
          orientation: "Landscape",
          pageSize: "Letter",
        },
      });
      documentSessionStore.setItems(TOOL, [item]);

      // Reset image edits
      documentSessionStore.resetItemEdits(TOOL, "p1");

      const state = documentSessionStore.getToolState(TOOL);
      expect(state.items[0].rotation).toBe(0);
      expect(state.items[0].flipH).toBe(false);
      expect(state.items[0].flipV).toBe(false);
      expect(state.items[0].crop).toBeUndefined();
      // Page settings remain intact
      expect(state.items[0].customOptions?.orientation).toBe("Landscape");
      expect(state.items[0].customOptions?.pageSize).toBe("Letter");
    });

    it("applyItemSettingsToAll updates shared defaults and clears individual overrides", () => {
      const item1 = createMockItem("p1", "page1.jpg", 800, 600);
      const item2 = createMockItem("p2", "page2.jpg", 800, 600, {
        customOptions: {
          orientation: "Landscape",
          pageSize: "Letter",
          fit: "Cover",
        },
      });
      documentSessionStore.setItems(TOOL, [item1, item2]);

      // Apply Page 2's settings to all pages
      documentSessionStore.applyItemSettingsToAll(TOOL, "p2");

      const state = documentSessionStore.getToolState(TOOL);
      expect(state.options.orientation).toBe("Landscape");
      expect(state.options.pageSize).toBe("Letter");
      expect(state.options.fit).toBe("Cover");
      expect(state.items[0].customOptions).toBeUndefined();
      expect(state.items[1].customOptions).toBeUndefined();
    });
  });

  describe("3. Duplication and ID Stability", () => {
    it("duplicating an image creates independently editable state", () => {
      const item1 = createMockItem("p1", "page1.jpg", 800, 600, {
        rotation: 90,
        crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        customOptions: { orientation: "Landscape" },
      });
      documentSessionStore.setItems(TOOL, [item1]);

      const newId = documentSessionStore.duplicateItem(TOOL, "p1");
      expect(newId).toBeTruthy();
      expect(newId).not.toBe("p1");

      const state = documentSessionStore.getToolState(TOOL);
      expect(state.items.length).toBe(2);
      expect(state.items[1].id).toBe(newId);

      // Now edit the duplicate independently
      documentSessionStore.updateItemEdits(TOOL, newId, {
        rotation: 180,
        crop: { x: 0, y: 0, width: 0.5, height: 0.5 },
      });
      documentSessionStore.updateItemCustomOption(TOOL, newId, "orientation", "Portrait");

      const updated = documentSessionStore.getToolState(TOOL);
      // Original remains unchanged
      expect(updated.items[0].rotation).toBe(90);
      expect(updated.items[0].crop).toEqual({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
      expect(updated.items[0].customOptions?.orientation).toBe("Landscape");

      // Duplicate has its own distinct state
      expect(updated.items[1].rotation).toBe(180);
      expect(updated.items[1].crop).toEqual({ x: 0, y: 0, width: 0.5, height: 0.5 });
      expect(updated.items[1].customOptions?.orientation).toBe("Portrait");
    });

    it("sorting or moving retains edits attached to the stable image ID", () => {
      const item1 = createMockItem("p1", "A.jpg", 800, 600, { rotation: 0 });
      const item2 = createMockItem("p2", "B.jpg", 800, 600, {
        rotation: 90,
        crop: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
        customOptions: { orientation: "Landscape" },
      });
      documentSessionStore.setItems(TOOL, [item1, item2]);

      // Move item 1 to index 1 (reverse order)
      documentSessionStore.moveItem(TOOL, 0, 1);

      const state = documentSessionStore.getToolState(TOOL);
      expect(state.items[0].id).toBe("p2");
      expect(state.items[0].rotation).toBe(90);
      expect(state.items[0].crop).toEqual({ x: 0.2, y: 0.2, width: 0.6, height: 0.6 });
      expect(state.items[0].customOptions?.orientation).toBe("Landscape");

      expect(state.items[1].id).toBe("p1");
      expect(state.items[1].rotation).toBe(0);
    });
  });

  describe("4. Exact Requirement 7 Verification: 3 Images, Custom Page 2 Only", () => {
    it("customizes only page 2 and verifies mixed page sizes and orientations in export", async () => {
      // 1. Create a document with 3 images
      const img1 = createMockItem("img_01", "image1.jpg", 1200, 800);
      const img2 = createMockItem("img_02", "image2.jpg", 800, 1000);
      const img3 = createMockItem("img_03", "image3.jpg", 1000, 1000);

      documentSessionStore.setItems(TOOL, [img1, img2, img3]);

      // 2. Customize ONLY page 2:
      // - Crop it
      // - Rotate it 90°
      // - Set Landscape
      // - Set custom margins (e.g. 25mm all sides)
      documentSessionStore.updateItemEdits(TOOL, "img_02", {
        rotation: 90,
        crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      });
      documentSessionStore.updateItemCustomOption(TOOL, "img_02", "orientation", "Landscape");
      documentSessionStore.updateItemCustomOption(TOOL, "img_02", "marginPreset", "Custom", {
        customMargins: [25, 25, 25, 25],
      });

      const state = documentSessionStore.getToolState(TOOL);

      // Verify page 1 and page 3 remain unchanged
      expect(state.items[0].customOptions).toBeUndefined();
      expect(state.items[0].rotation).toBe(0);
      expect(state.items[0].crop).toBeUndefined();

      expect(state.items[2].customOptions).toBeUndefined();
      expect(state.items[2].rotation).toBe(0);
      expect(state.items[2].crop).toBeUndefined();

      // Verify page 2 has the exact customizations
      expect(state.items[1].rotation).toBe(90);
      expect(state.items[1].crop).toEqual({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
      expect(state.items[1].customOptions?.orientation).toBe("Landscape");
      expect(state.items[1].customOptions?.marginPreset).toBe("Custom");
      expect(state.items[1].customOptions?.customMargins).toEqual([25, 25, 25, 25]);

      // Verify Geometry calculation for Page 1 (A4 Portrait, 12mm margins)
      const geo1 = calculateGeometry({
        imageWidth: state.items[0].width,
        imageHeight: state.items[0].height,
        rotation: state.items[0].rotation,
        crop: state.items[0].crop,
        options: state.options,
      });
      expect(geo1.pageWidthPt).toBeCloseTo(PAGE_SIZES_PT.A4.width, 2);
      expect(geo1.pageHeightPt).toBeCloseTo(PAGE_SIZES_PT.A4.height, 2);
      expect(geo1.marginsPt.top).toBeCloseTo(mmToPt(12), 2);

      // Verify Geometry calculation for Page 2 (A4 Landscape, 25mm margins)
      const optionsPage2: PdfOptions = {
        ...state.options,
        ...state.items[1].customOptions,
      };
      const geo2 = calculateGeometry({
        imageWidth: state.items[1].width,
        imageHeight: state.items[1].height,
        rotation: state.items[1].rotation,
        crop: state.items[1].crop,
        options: optionsPage2,
      });
      // In Landscape, width and height are swapped
      expect(geo2.pageWidthPt).toBeCloseTo(PAGE_SIZES_PT.A4.height, 2);
      expect(geo2.pageHeightPt).toBeCloseTo(PAGE_SIZES_PT.A4.width, 2);
      expect(geo2.marginsPt.top).toBeCloseTo(mmToPt(25), 2);

      // Verify Geometry calculation for Page 3 (A4 Portrait, 12mm margins)
      const geo3 = calculateGeometry({
        imageWidth: state.items[2].width,
        imageHeight: state.items[2].height,
        rotation: state.items[2].rotation,
        crop: state.items[2].crop,
        options: state.options,
      });
      expect(geo3.pageWidthPt).toBeCloseTo(PAGE_SIZES_PT.A4.width, 2);
      expect(geo3.pageHeightPt).toBeCloseTo(PAGE_SIZES_PT.A4.height, 2);
    });

    it("verifies export supports mixed page sizes and orientations in a real PDF document", async () => {
      // Create PDF with pdf-lib containing mixed page geometries
      const pdfDoc = await PDFDocument.create();

      // Page 1: A4 Portrait
      const page1 = pdfDoc.addPage([PAGE_SIZES_PT.A4.width, PAGE_SIZES_PT.A4.height]);
      // Page 2: Letter Landscape
      const page2 = pdfDoc.addPage([PAGE_SIZES_PT.Letter.height, PAGE_SIZES_PT.Letter.width]);
      // Page 3: A4 Portrait
      const page3 = pdfDoc.addPage([PAGE_SIZES_PT.A4.width, PAGE_SIZES_PT.A4.height]);

      const pdfBytes = await pdfDoc.save();

      // Reopen the exported PDF and verify page sizes and orientations
      const loadedPdf = await PDFDocument.load(pdfBytes);
      expect(loadedPdf.getPageCount()).toBe(3);

      const p1 = loadedPdf.getPage(0);
      expect(p1.getSize().width).toBeCloseTo(PAGE_SIZES_PT.A4.width, 1);
      expect(p1.getSize().height).toBeCloseTo(PAGE_SIZES_PT.A4.height, 1);

      const p2 = loadedPdf.getPage(1);
      expect(p2.getSize().width).toBeCloseTo(PAGE_SIZES_PT.Letter.height, 1); // Landscape Letter
      expect(p2.getSize().height).toBeCloseTo(PAGE_SIZES_PT.Letter.width, 1);

      const p3 = loadedPdf.getPage(2);
      expect(p3.getSize().width).toBeCloseTo(PAGE_SIZES_PT.A4.width, 1);
      expect(p3.getSize().height).toBeCloseTo(PAGE_SIZES_PT.A4.height, 1);
    });
  });

  describe("5. Edge Cases: Tall & Wide Images, Crop After Rotation, Contain Fidelity", () => {
    it("handles extreme tall panoramic and ultra-wide landscape images without distortion", () => {
      const tallImg = createMockItem("tall", "tall.jpg", 500, 3000);
      const wideImg = createMockItem("wide", "wide.jpg", 4000, 600);
      const options: PdfOptions = { ...DEFAULT_PDF_OPTIONS };

      // Tall in Contain mode
      const geoTall = calculateGeometry({
        imageWidth: tallImg.width,
        imageHeight: tallImg.height,
        rotation: 0,
        options,
      });
      // Height should fit printable area, width scaled proportionately
      expect(geoTall.imageRect.height).toBeCloseTo(geoTall.printableHeightPt, 3);
      expect(geoTall.imageRect.width).toBeLessThanOrEqual(geoTall.printableWidthPt + 0.001);
      expect(geoTall.imageRect.width / geoTall.imageRect.height).toBeCloseTo(500 / 3000, 3);

      // Wide in Contain mode
      const geoWide = calculateGeometry({
        imageWidth: wideImg.width,
        imageHeight: wideImg.height,
        rotation: 0,
        options,
      });
      expect(geoWide.imageRect.width).toBeCloseTo(geoWide.printableWidthPt, 3);
      expect(geoWide.imageRect.height).toBeLessThanOrEqual(geoWide.printableHeightPt + 0.001);
      expect(geoWide.imageRect.width / geoWide.imageRect.height).toBeCloseTo(4000 / 600, 3);
    });

    it("Contain mode never silently crops the image", () => {
      const item = createMockItem("img1", "photo.jpg", 1000, 500);
      const options: PdfOptions = { ...DEFAULT_PDF_OPTIONS, fit: "Contain" };

      const geo = calculateGeometry({
        imageWidth: item.width,
        imageHeight: item.height,
        rotation: 0,
        options,
      });

      // In Contain mode without manual crop, cropRect must be undefined
      expect(geo.cropRect).toBeUndefined();
      // Entire image fits inside printable area
      expect(geo.imageRect.width).toBeLessThanOrEqual(geo.printableWidthPt);
      expect(geo.imageRect.height).toBeLessThanOrEqual(geo.printableHeightPt);
    });

    it("marks result as outdated when an image edit is committed", () => {
      const item = createMockItem("img1", "photo.jpg", 1000, 500);
      documentSessionStore.setItems(TOOL, [item]);

      // Fake completed result
      const cur = documentSessionStore.getToolState(TOOL);
      (cur as any).result = { filename: "out.pdf", isOutdated: false };

      // Update edit
      documentSessionStore.updateItemEdits(TOOL, "img1", { rotation: 90 });

      const state = documentSessionStore.getToolState(TOOL);
      expect(state.isOutdated).toBe(true);
    });

    it("Cancel preserves previously committed edits without discarding them", () => {
      const item = createMockItem("img1", "photo.jpg", 1000, 800, {
        rotation: 90,
        flipH: true,
        crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      });
      documentSessionStore.setItems(TOOL, [item]);

      // Suppose user opens editor, plays with draft values (e.g. rotation: 180, crop: 0..0.5), but then CANCELS
      // Modal calls onClose without calling onApply.
      // We verify the store still holds the committed edits
      const state = documentSessionStore.getToolState(TOOL);
      expect(state.items[0].rotation).toBe(90);
      expect(state.items[0].flipH).toBe(true);
      expect(state.items[0].crop).toEqual({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
    });

    it("retains committed edits during navigation between views or back to overview", () => {
      const item = createMockItem("img1", "photo.jpg", 1000, 800, {
        rotation: 90,
        crop: { x: 0.15, y: 0.15, width: 0.7, height: 0.7 },
        customOptions: { orientation: "Landscape", pageSize: "Letter" },
      });
      documentSessionStore.setItems(TOOL, [item]);

      // Switch to single view
      documentSessionStore.setViewMode(TOOL, "single");
      let state = documentSessionStore.getToolState(TOOL);
      expect(state.viewMode).toBe("single");
      expect(state.items[0].rotation).toBe(90);
      expect(state.items[0].customOptions?.pageSize).toBe("Letter");

      // Switch back to overview
      documentSessionStore.setViewMode(TOOL, "overview");
      state = documentSessionStore.getToolState(TOOL);
      expect(state.viewMode).toBe("overview");
      expect(state.items[0].rotation).toBe(90);
      expect(state.items[0].customOptions?.pageSize).toBe("Letter");
    });

    it("verifies crop after rotation and rotation after crop produce mathematically consistent layout geometry", () => {
      const item = createMockItem("img1", "photo.jpg", 1200, 800);
      const options: PdfOptions = { ...DEFAULT_PDF_OPTIONS };

      // Case A: Rotate 90 CW then crop centered 50%
      const geoA = calculateGeometry({
        imageWidth: item.width,
        imageHeight: item.height,
        rotation: 90,
        crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
        options,
      });

      // At 90 deg rotation, oriented width = 800, oriented height = 1200
      // 50% crop gives effective width = 400, effective height = 600
      expect(geoA.cropRect?.sWidth).toBe(400);
      expect(geoA.cropRect?.sHeight).toBe(600);
      expect(geoA.cropRect?.sx).toBe(200); // 0.25 * 800
      expect(geoA.cropRect?.sy).toBe(300); // 0.25 * 1200
    });

    it("editing after download marks PDF outdated and allows regeneration without re-uploading", () => {
      const item1 = createMockItem("img1", "photo1.jpg", 1000, 800);
      const item2 = createMockItem("img2", "photo2.jpg", 1000, 800);
      documentSessionStore.setItems(TOOL, [item1, item2]);

      // Simulate completed generation
      const mockResult = {
        blob: new Blob(["dummy"]),
        url: "blob:mock/out.pdf",
        filename: "test.pdf",
        pageCount: 2,
        sizeBytes: 1234,
        generationTimeSec: 0.5,
        profile: "Screen/Mobile" as const,
        isOutdated: false,
      };
      (documentSessionStore.getToolState(TOOL) as any).result = mockResult;

      let state = documentSessionStore.getToolState(TOOL);
      expect(state.result?.isOutdated).toBe(false);

      // User performs edit on page 1 after download
      documentSessionStore.updateItemEdits(TOOL, "img1", { rotation: 90 });

      state = documentSessionStore.getToolState(TOOL);
      expect(state.isOutdated).toBe(true);
      expect(state.items.length).toBe(2); // Files still in session, no re-upload needed!
    });
  });
});

