import { describe, it, expect } from "vitest";
import { calculateGeometry, PAGE_SIZES_PT } from "../lib/layout";
import { ConcurrencyLimiter } from "../lib/pdfRenderer";
import { PdfOptions } from "../types";

const defaultTestOptions: PdfOptions = {
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

describe("ConcurrencyLimiter", () => {
  it("should enforce maximum concurrent executions", async () => {
    const limiter = new ConcurrencyLimiter(2);
    let running = 0;
    let maxRunning = 0;

    const task = async () => {
      return limiter.run(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((resolve) => setTimeout(resolve, 20));
        running--;
        return true;
      });
    };

    await Promise.all([task(), task(), task(), task(), task()]);
    expect(maxRunning).toBeLessThanOrEqual(2);
    expect(running).toBe(0);
  });

  it("should handle task errors without locking the queue", async () => {
    const limiter = new ConcurrencyLimiter(1);
    await expect(
      limiter.run(async () => {
        throw new Error("Task failed");
      })
    ).rejects.toThrow("Task failed");

    // Next task should still execute normally
    const result = await limiter.run(async () => "recovered");
    expect(result).toBe("recovered");
  });
});

describe("Paper Dimensions & Layout Calculation", () => {
  it("has correct standard dimensions for A4 and Letter", () => {
    expect(PAGE_SIZES_PT.A4.width).toBeCloseTo(595.28, 1);
    expect(PAGE_SIZES_PT.A4.height).toBeCloseTo(841.89, 1);

    expect(PAGE_SIZES_PT.Letter.width).toBe(612);
    expect(PAGE_SIZES_PT.Letter.height).toBe(792);
  });

  it("fits tall images inside printable area without exceeding paper boundaries under fit-contain", () => {
    // Tall 9:16 mobile photo
    const imageWidth = 1080;
    const imageHeight = 1920;

    const geometry = calculateGeometry({
      imageWidth,
      imageHeight,
      options: {
        ...defaultTestOptions,
        pageSize: "A4",
        orientation: "Portrait",
        marginMm: 10,
        marginPreset: "Small",
        fit: "Contain",
      },
    });

    // Check bounds: image must fit inside printable area
    expect(geometry.imageRect.width).toBeLessThanOrEqual(geometry.printableWidthPt + 0.1);
    expect(geometry.imageRect.height).toBeLessThanOrEqual(geometry.printableHeightPt + 0.1);
    expect(geometry.imageRect.x).toBeGreaterThanOrEqual(geometry.marginsPt.left - 0.1);
    expect(geometry.imageRect.y).toBeGreaterThanOrEqual(geometry.marginsPt.bottom - 0.1);
  });

  it("calculates zero margin correctly when margin is set to none", () => {
    const imageWidth = 800;
    const imageHeight = 600;

    const geometry = calculateGeometry({
      imageWidth,
      imageHeight,
      options: {
        ...defaultTestOptions,
        pageSize: "A4",
        orientation: "Portrait",
        marginMm: 0,
        marginPreset: "None",
        fit: "Cover",
      },
    });

    expect(geometry.printableWidthPt).toBeCloseTo(geometry.pageWidthPt, 1);
    expect(geometry.printableHeightPt).toBeCloseTo(geometry.pageHeightPt, 1);
  });
});
