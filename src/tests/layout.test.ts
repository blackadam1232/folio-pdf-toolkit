import { describe, it, expect } from "vitest";
import {
  calculateGeometry,
  mmToPt,
  ptToMm,
  PAGE_SIZES_PT,
} from "../lib/layout";
import { PdfOptions } from "../types";

const defaultOptions: PdfOptions = {
  pageSize: "A4",
  orientation: "Auto",
  fit: "Contain",
  profile: "Screen/Mobile",
  marginPreset: "Small",
  marginMm: 5,
  customMargins: [5, 5, 5, 5],
  filename: "test",
  sort: "natural-asc",
  manualOrder: [],
};

describe("Layout & Geometry Engine", () => {
  describe("Unit conversion (mm <-> pt)", () => {
    it("converts 25.4 mm to exactly 72 points", () => {
      expect(mmToPt(25.4)).toBeCloseTo(72.0, 5);
    });

    it("converts 72 points to exactly 25.4 mm", () => {
      expect(ptToMm(72.0)).toBeCloseTo(25.4, 5);
    });

    it("converts 0 mm to 0 points", () => {
      expect(mmToPt(0)).toBe(0);
      expect(ptToMm(0)).toBe(0);
    });
  });

  describe("Standard Page Sizes", () => {
    it("matches ISO A4 dimensions (595.276 x 841.89 pt)", () => {
      expect(PAGE_SIZES_PT.A4.width).toBeCloseTo(595.276, 3);
      expect(PAGE_SIZES_PT.A4.height).toBeCloseTo(841.89, 2);
    });

    it("matches US Letter dimensions (612.0 x 792.0 pt)", () => {
      expect(PAGE_SIZES_PT.Letter.width).toBeCloseTo(612.0, 1);
      expect(PAGE_SIZES_PT.Letter.height).toBeCloseTo(792.0, 1);
    });
  });

  describe("Orientation Logic", () => {
    it("uses portrait dimensions when orientation is Portrait", () => {
      const geo = calculateGeometry({
        imageWidth: 1000,
        imageHeight: 500, // landscape image
        options: { ...defaultOptions, pageSize: "A4", orientation: "Portrait" },
      });
      expect(geo.pageWidthPt).toBeLessThan(geo.pageHeightPt);
      expect(geo.pageWidthPt).toBeCloseTo(PAGE_SIZES_PT.A4.width, 1);
      expect(geo.pageHeightPt).toBeCloseTo(PAGE_SIZES_PT.A4.height, 1);
    });

    it("uses landscape dimensions when orientation is Landscape", () => {
      const geo = calculateGeometry({
        imageWidth: 500,
        imageHeight: 1000, // portrait image
        options: { ...defaultOptions, pageSize: "A4", orientation: "Landscape" },
      });
      expect(geo.pageWidthPt).toBeGreaterThan(geo.pageHeightPt);
      expect(geo.pageWidthPt).toBeCloseTo(PAGE_SIZES_PT.A4.height, 1);
      expect(geo.pageHeightPt).toBeCloseTo(PAGE_SIZES_PT.A4.width, 1);
    });

    it("automatically picks landscape for wide images when orientation is Auto", () => {
      const geo = calculateGeometry({
        imageWidth: 1200,
        imageHeight: 800,
        options: { ...defaultOptions, orientation: "Auto" },
      });
      expect(geo.pageWidthPt).toBeGreaterThan(geo.pageHeightPt);
    });

    it("automatically picks portrait for tall images when orientation is Auto", () => {
      const geo = calculateGeometry({
        imageWidth: 800,
        imageHeight: 1200,
        options: { ...defaultOptions, orientation: "Auto" },
      });
      expect(geo.pageWidthPt).toBeLessThan(geo.pageHeightPt);
    });
  });

  describe("Original Sizing Rule", () => {
    it("calculates page dimensions matching unscaled image point size at 96 DPI plus margins", () => {
      const marginMm = 10;
      const marginPt = mmToPt(marginMm);
      const geo = calculateGeometry({
        imageWidth: 960,
        imageHeight: 480,
        dpi: 96,
        options: {
          ...defaultOptions,
          pageSize: "Original",
          marginPreset: "None",
          marginMm: 0,
        },
      });
      // 960 * 72 / 96 = 720 pt width
      // 480 * 72 / 96 = 360 pt height
      expect(geo.pageWidthPt).toBeCloseTo(720, 1);
      expect(geo.pageHeightPt).toBeCloseTo(360, 1);
    });
  });

  describe("Rotation Handling", () => {
    it("swaps effective dimensions on 90 and 270 degree rotations", () => {
      const portraitImage = { width: 600, height: 1200 };
      // Normal: height > width -> Auto picks portrait
      const normalGeo = calculateGeometry({
        imageWidth: portraitImage.width,
        imageHeight: portraitImage.height,
        rotation: 0,
        options: defaultOptions,
      });
      expect(normalGeo.pageWidthPt).toBeLessThan(normalGeo.pageHeightPt);

      // 90 deg rotation: effective dimensions become width: 1200, height: 600 -> Auto picks landscape
      const rotatedGeo = calculateGeometry({
        imageWidth: portraitImage.width,
        imageHeight: portraitImage.height,
        rotation: 90,
        options: defaultOptions,
      });
      expect(rotatedGeo.pageWidthPt).toBeGreaterThan(rotatedGeo.pageHeightPt);
    });
  });

  describe("Margins & Bounds Validation", () => {
    it("correctly computes custom margins in mm", () => {
      const customMargins: [number, number, number, number] = [10, 15, 20, 25]; // top, right, bottom, left
      const geo = calculateGeometry({
        imageWidth: 800,
        imageHeight: 800,
        options: {
          ...defaultOptions,
          pageSize: "A4",
          orientation: "Portrait",
          marginPreset: "Custom",
          customMargins,
        },
      });

      expect(geo.marginsPt.top).toBeCloseTo(mmToPt(10), 2);
      expect(geo.marginsPt.right).toBeCloseTo(mmToPt(15), 2);
      expect(geo.marginsPt.bottom).toBeCloseTo(mmToPt(20), 2);
      expect(geo.marginsPt.left).toBeCloseTo(mmToPt(25), 2);

      const expectedPrintableW = PAGE_SIZES_PT.A4.width - mmToPt(15 + 25);
      const expectedPrintableH = PAGE_SIZES_PT.A4.height - mmToPt(10 + 20);
      expect(geo.printableWidthPt).toBeCloseTo(expectedPrintableW, 2);
      expect(geo.printableHeightPt).toBeCloseTo(expectedPrintableH, 2);
    });

    it("throws an informative error when margins exceed page size", () => {
      const impossibleMargins: [number, number, number, number] = [150, 150, 150, 150]; // 300mm total H & V
      expect(() => {
        calculateGeometry({
          imageWidth: 800,
          imageHeight: 800,
          options: {
            ...defaultOptions,
            pageSize: "A4",
            orientation: "Portrait",
            marginPreset: "Custom",
            customMargins: impossibleMargins,
          },
        });
      }).toThrowError(/exceed page size/i);
    });
  });

  describe("Fitting Modes (Contain, Cover, Original)", () => {
    it("Contain: fits completely inside printable bounds without exceeding them", () => {
      const geo = calculateGeometry({
        imageWidth: 1000,
        imageHeight: 500,
        options: { ...defaultOptions, fit: "Contain" },
      });
      expect(geo.imageRect.width).toBeLessThanOrEqual(geo.printableWidthPt + 0.001);
      expect(geo.imageRect.height).toBeLessThanOrEqual(geo.printableHeightPt + 0.001);
      // Aspect ratio 2:1 preserved
      expect(geo.imageRect.width / geo.imageRect.height).toBeCloseTo(2.0, 2);
    });

    it("Cover: fills entire printable area and computes cropRect", () => {
      const geo = calculateGeometry({
        imageWidth: 1000,
        imageHeight: 500,
        options: { ...defaultOptions, fit: "Cover" },
      });
      expect(geo.imageRect.width).toBeCloseTo(geo.printableWidthPt, 1);
      expect(geo.imageRect.height).toBeCloseTo(geo.printableHeightPt, 1);
      expect(geo.cropRect).toBeDefined();
      expect(geo.cropRect!.sWidth).toBeGreaterThan(0);
      expect(geo.cropRect!.sHeight).toBeGreaterThan(0);
    });
  });
});
