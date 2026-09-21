import { describe, it, expect } from "vitest";
import { parsePageRange } from "../lib/pdfEngine";
import { TOOL_REGISTRY, getToolById, getToolsByCategory } from "../lib/toolRegistry";

describe("Tool Registry", () => {
  it("includes all required Paper Studio tools", () => {
    const ids = TOOL_REGISTRY.map((t) => t.id);
    expect(ids).toContain("images-to-pdf");
    expect(ids).toContain("merge-pdf");
    expect(ids).toContain("split-pdf");
    expect(ids).toContain("rotate-pdf");
    expect(ids).toContain("pdf-to-images");
    expect(ids).toContain("organize-pdf");
    expect(ids).toContain("page-numbers");
    expect(ids).toContain("watermark");
  });

  it("filters tools accurately by category", () => {
    const createTools = getToolsByCategory("create");
    expect(createTools.map((t) => t.id)).toContain("images-to-pdf");

    const organizeTools = getToolsByCategory("organize");
    expect(organizeTools.map((t) => t.id)).toContain("merge-pdf");
    expect(organizeTools.map((t) => t.id)).toContain("split-pdf");
    expect(organizeTools.map((t) => t.id)).toContain("rotate-pdf");

    const exportTools = getToolsByCategory("export");
    expect(exportTools.map((t) => t.id)).toContain("pdf-to-images");
  });

  it("retrieves individual tools by ID", () => {
    const tool = getToolById("images-to-pdf");
    expect(tool).toBeDefined();
    expect(tool?.title).toBe("Images to PDF");
    expect(tool?.isFeatured).toBe(true);
  });
});

describe("Page Range Parser (Split & Tool Operations)", () => {
  it("parses single pages and distinct comma-separated lists", () => {
    const result = parsePageRange("1, 3, 5", 10);
    expect(result).toEqual([0, 2, 4]); // 0-based indices
  });

  it("parses contiguous ranges correctly", () => {
    const result = parsePageRange("2-4", 10);
    expect(result).toEqual([1, 2, 3]);
  });

  it("parses mixed ranges and individual pages", () => {
    const result = parsePageRange("1-3, 5, 8-10", 10);
    expect(result).toEqual([0, 1, 2, 4, 7, 8, 9]);
  });

  it("handles duplicate page inputs gracefully and returns unique sorted indices", () => {
    const result = parsePageRange("3, 1-3, 2", 10);
    expect(result).toEqual([0, 1, 2]);
  });

  it("throws for reversed range bounds", () => {
    expect(() => parsePageRange("5-2", 10)).toThrow(/start \(5\) cannot be greater than end \(2\)/);
  });

  it("throws for out of bounds pages", () => {
    expect(() => parsePageRange("1-15", 10)).toThrow(/exceeds total document pages \(10\)/);
    expect(() => parsePageRange("12", 10)).toThrow(/out of bounds/);
  });

  it("throws for non-numeric or malformed expressions", () => {
    expect(() => parsePageRange("abc", 10)).toThrow(/Invalid page specification/);
    expect(() => parsePageRange("1-2-3", 10)).toThrow(/Invalid range segment/);
    expect(() => parsePageRange("", 10)).toThrow(/cannot be empty/);
  });
});
