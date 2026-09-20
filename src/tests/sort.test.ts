import { describe, it, expect } from "vitest";
import { sortImageItems } from "../lib/sort";
import { ImageItem } from "../types";

const makeItem = (id: string, name: string, modified: number): ImageItem => ({
  id,
  file: new File([], name),
  name,
  size: 1024,
  modified,
  objectUrl: `blob:${id}`,
  width: 100,
  height: 100,
  rotation: 0,
});

describe("Image Sorting Engine", () => {
  const sampleItems: ImageItem[] = [
    makeItem("3", "scan10.png", 3000),
    makeItem("1", "scan1.png", 1000),
    makeItem("2", "scan2.png", 2000),
    makeItem("4", "scan20.png", 4000),
  ];

  it("Natural ascending sorts numerical suffixes naturally (1, 2, 10, 20)", () => {
    const sorted = sortImageItems(sampleItems, "natural-asc");
    expect(sorted.map((it) => it.name)).toEqual([
      "scan1.png",
      "scan2.png",
      "scan10.png",
      "scan20.png",
    ]);
  });

  it("Natural descending sorts numerical suffixes in reverse natural order (20, 10, 2, 1)", () => {
    const sorted = sortImageItems(sampleItems, "natural-desc");
    expect(sorted.map((it) => it.name)).toEqual([
      "scan20.png",
      "scan10.png",
      "scan2.png",
      "scan1.png",
    ]);
  });

  it("Filename A-Z sorts strictly alphabetically (scan1, scan10, scan2, scan20)", () => {
    const sorted = sortImageItems(sampleItems, "name-asc");
    expect(sorted.map((it) => it.name)).toEqual([
      "scan1.png",
      "scan10.png",
      "scan2.png",
      "scan20.png",
    ]);
  });

  it("Filename Z-A sorts strictly reverse alphabetically", () => {
    const sorted = sortImageItems(sampleItems, "name-desc");
    expect(sorted.map((it) => it.name)).toEqual([
      "scan20.png",
      "scan2.png",
      "scan10.png",
      "scan1.png",
    ]);
  });

  it("Date oldest sorts by modified timestamp ascending", () => {
    const sorted = sortImageItems(sampleItems, "date-oldest");
    expect(sorted.map((it) => it.modified)).toEqual([1000, 2000, 3000, 4000]);
  });

  it("Date newest sorts by modified timestamp descending", () => {
    const sorted = sortImageItems(sampleItems, "date-newest");
    expect(sorted.map((it) => it.modified)).toEqual([4000, 3000, 2000, 1000]);
  });

  it("Manual arrangement sorts by explicit order array of IDs", () => {
    const customOrder = ["4", "1", "3", "2"];
    const sorted = sortImageItems(sampleItems, "manual", customOrder);
    expect(sorted.map((it) => it.id)).toEqual(["4", "1", "3", "2"]);
  });
});
