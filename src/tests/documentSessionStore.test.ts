import { describe, it, expect, beforeEach } from "vitest";
import { documentSessionStore } from "../lib/documentSessionStore";
import { ImageItem } from "../types";

function createDummyItem(id: string, name: string): ImageItem {
  return {
    id,
    file: new File(["dummy"], name, { type: "image/jpeg" }),
    name,
    size: 1024,
    modified: Date.now(),
    width: 800,
    height: 1200,
    objectUrl: `blob:dummy_${id}`,
    rotation: 0,
  };
}

describe("Document Session Store", () => {
  const TOOL = "images-to-pdf";

  beforeEach(() => {
    documentSessionStore.reset(TOOL);
  });

  it("stores items and preserves active inspect id", () => {
    const item1 = createDummyItem("1", "doc1.jpg");
    const item2 = createDummyItem("2", "doc2.jpg");

    documentSessionStore.setItems(TOOL, [item1, item2]);
    const state = documentSessionStore.getToolState(TOOL);

    expect(state.items).toHaveLength(2);
    expect(state.activeInspectId).toBe("1");
    expect(state.items[0].name).toBe("doc1.jpg");
  });

  it("handles selection and toggle correctly", () => {
    const item1 = createDummyItem("1", "doc1.jpg");
    const item2 = createDummyItem("2", "doc2.jpg");
    documentSessionStore.setItems(TOOL, [item1, item2]);

    documentSessionStore.toggleSelectId(TOOL, "1");
    expect(documentSessionStore.getToolState(TOOL).selectedIds).toEqual(["1"]);

    documentSessionStore.toggleSelectId(TOOL, "2");
    expect(documentSessionStore.getToolState(TOOL).selectedIds).toEqual(["1", "2"]);

    documentSessionStore.clearSelection(TOOL);
    expect(documentSessionStore.getToolState(TOOL).selectedIds).toEqual([]);

    documentSessionStore.selectAll(TOOL);
    expect(documentSessionStore.getToolState(TOOL).selectedIds).toEqual(["1", "2"]);
  });

  it("rotates selected items and individual items", () => {
    const item1 = createDummyItem("1", "doc1.jpg");
    const item2 = createDummyItem("2", "doc2.jpg");
    documentSessionStore.setItems(TOOL, [item1, item2]);

    documentSessionStore.rotateItem(TOOL, "1", 90);
    expect(documentSessionStore.getToolState(TOOL).items[0].rotation).toBe(90);

    documentSessionStore.setSelectedIds(TOOL, ["2"]);
    documentSessionStore.rotateSelected(TOOL, 180);
    expect(documentSessionStore.getToolState(TOOL).items[1].rotation).toBe(180);
  });

  it("reorders items and sets manual sort mode", () => {
    const item1 = createDummyItem("1", "doc1.jpg");
    const item2 = createDummyItem("2", "doc2.jpg");
    documentSessionStore.setItems(TOOL, [item1, item2]);

    documentSessionStore.moveItem(TOOL, 0, 1);
    const state = documentSessionStore.getToolState(TOOL);
    expect(state.items[0].id).toBe("2");
    expect(state.items[1].id).toBe("1");
    expect(state.options.sort).toBe("manual");
  });

  it("updates options and marks result outdated if result exists", () => {
    documentSessionStore.setOptions(TOOL, { pageSize: "Letter", fit: "Cover" });
    const state = documentSessionStore.getToolState(TOOL);
    expect(state.options.pageSize).toBe("Letter");
    expect(state.options.fit).toBe("Cover");
  });

  it("supports explicit cancellation and preserves files", () => {
    const item1 = createDummyItem("1", "doc1.jpg");
    documentSessionStore.setItems(TOOL, [item1]);

    documentSessionStore.cancelGeneration(TOOL);
    const state = documentSessionStore.getToolState(TOOL);
    expect(state.jobStatus).toBe("cancelled");
    expect(state.items).toHaveLength(1);
  });
});
