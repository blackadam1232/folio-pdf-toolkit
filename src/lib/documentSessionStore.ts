import { useSyncExternalStore } from "react";
import {
  ConversionResult,
  CropRect,
  GenerationProgress,
  ImageItem,
  PdfOptions,
  PerPageOptions,
} from "../types";
import { generatePdf, inspectImageFile, MAX_FILES_LIMIT, MAX_TOTAL_BYTES_LIMIT } from "./pdfEngine";
import { sortImageItems } from "./sort";

export const DEFAULT_PDF_OPTIONS: PdfOptions = {
  pageSize: "A4",
  orientation: "Portrait",
  fit: "Contain",
  profile: "Screen/Mobile",
  marginPreset: "Small",
  marginMm: 12,
  customMargins: [12, 12, 12, 12],
  filename: "Document.pdf",
  sort: "natural-asc",
  manualOrder: [],
};

export interface ToolSessionState {
  items: ImageItem[];
  selectedIds: string[];
  activeInspectId: string;
  viewMode: "overview" | "single";
  options: PdfOptions;
  jobStatus: "idle" | "processing" | "completed" | "failed" | "cancelled";
  progress: GenerationProgress | null;
  result: ConversionResult | null;
  isOutdated: boolean;
  errorMessage: string;
}

const defaultToolState: ToolSessionState = {
  items: [],
  selectedIds: [],
  activeInspectId: "",
  viewMode: "overview",
  options: { ...DEFAULT_PDF_OPTIONS },
  jobStatus: "idle",
  progress: null,
  result: null,
  isOutdated: false,
  errorMessage: "",
};

let sessions: Record<string, ToolSessionState> = {
  "images-to-pdf": { ...defaultToolState },
};

const listeners = new Set<() => void>();
let activeAbortController: AbortController | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function duplicatePages(toolId: string, state: ToolSessionState, singleId?: string): string[] {
  const targets = new Set(singleId === undefined ? state.selectedIds : [singleId]);
  const displayed = sortImageItems(state.items, state.options.sort, state.options.manualOrder);
  const sources = displayed.filter(item => targets.has(item.id));
  if (!sources.length || state.items.length + sources.length > MAX_FILES_LIMIT) return [];
  const bytes = state.items.reduce((sum, item) => sum + item.size, 0);
  if (bytes + sources.reduce((sum, item) => sum + item.size, 0) > MAX_TOTAL_BYTES_LIMIT) return [];

  const copies = new Map<string, ImageItem>();
  try {
    for (const source of sources) {
      const copy = {
        ...source,
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        name: source.name.includes(" (Copy)") ? source.name : source.name.replace(/(\.[^.]+)?$/, " (Copy)$1"),
        crop: source.crop && { ...source.crop },
        customOptions: source.customOptions && { ...source.customOptions },
        objectUrl: URL.createObjectURL(source.file),
      };
      if (copy.customOptions && source.customOptions?.customMargins) {
        copy.customOptions.customMargins = [...source.customOptions.customMargins];
      }
      copies.set(source.id, copy);
    }
  } catch (error) {
    for (const copy of copies.values()) URL.revokeObjectURL(copy.objectUrl);
    throw error;
  }

  const items = state.items.flatMap(item => {
    const copy = copies.get(item.id);
    return copy ? [item, copy] : [item];
  });
  const copyIds = Array.from(copies.values(), copy => copy.id);
  let options = state.options;
  if (singleId === undefined || options.sort === "manual") {
    // Retain removed pages' ranks so Undo can restore them in their former positions.
    const order = new Set(options.sort === "manual" ? options.manualOrder : []);
    for (const item of displayed) order.add(item.id);
    const manualOrder = Array.from(order).flatMap(id => {
      const copy = copies.get(id);
      return copy ? [id, copy.id] : [id];
    });
    options = { ...options, sort: "manual", manualOrder };
  }
  sessions[toolId] = {
    ...state,
    items,
    options,
    activeInspectId: copyIds[0],
    selectedIds: singleId === undefined ? copyIds : state.selectedIds,
    isOutdated: state.result !== null,
  };
  emit();
  return copyIds;
}

export const documentSessionStore = {
  getToolState(toolId: string): ToolSessionState {
    if (!sessions[toolId]) {
      sessions[toolId] = {
        ...defaultToolState,
        options: { ...DEFAULT_PDF_OPTIONS },
        items: [],
        selectedIds: [],
      };
    }
    return sessions[toolId];
  },

  setItems(toolId: string, items: ImageItem[]) {
    const cur = this.getToolState(toolId);
    sessions[toolId] = {
      ...cur,
      items,
      isOutdated: cur.result !== null,
      activeInspectId:
        items.length > 0
          ? items.some((i) => i.id === cur.activeInspectId)
            ? cur.activeInspectId
            : items[0].id
          : "",
    };
    emit();
  },

  async addFiles(toolId: string, files: FileList | File[]): Promise<number> {
    const cur = this.getToolState(toolId);
    const fileArray = Array.from(files);
    const validFiles: ImageItem[] = [];

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      try {
        const { width, height, objectUrl } = await inspectImageFile(file);
        validFiles.push({
          id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          file,
          name: file.name,
          size: file.size,
          modified: file.lastModified,
          objectUrl,
          width,
          height,
          rotation: 0,
        });
      } catch (err) {
        console.warn(`Could not inspect image ${file.name}:`, err);
      }
    }

    if (validFiles.length > 0) {
      const newItems = [...cur.items, ...validFiles];
      this.setItems(toolId, newItems);
    }
    return validFiles.length;
  },

  setSelectedIds(toolId: string, selectedIds: string[]) {
    const cur = this.getToolState(toolId);
    sessions[toolId] = { ...cur, selectedIds };
    emit();
  },

  toggleSelectId(toolId: string, id: string) {
    const cur = this.getToolState(toolId);
    const set = new Set(cur.selectedIds);
    if (set.has(id)) {
      set.delete(id);
    } else {
      set.add(id);
    }
    sessions[toolId] = { ...cur, selectedIds: Array.from(set) };
    emit();
  },

  selectAll(toolId: string) {
    const cur = this.getToolState(toolId);
    sessions[toolId] = {
      ...cur,
      selectedIds: cur.items.map((i) => i.id),
    };
    emit();
  },

  clearSelection(toolId: string) {
    const cur = this.getToolState(toolId);
    sessions[toolId] = { ...cur, selectedIds: [] };
    emit();
  },

  setActiveInspectId(toolId: string, id: string) {
    const cur = this.getToolState(toolId);
    sessions[toolId] = { ...cur, activeInspectId: id };
    emit();
  },

  setViewMode(toolId: string, viewMode: "overview" | "single") {
    const cur = this.getToolState(toolId);
    sessions[toolId] = { ...cur, viewMode };
    emit();
  },

  setOptions(toolId: string, newOptions: Partial<PdfOptions>) {
    const cur = this.getToolState(toolId);
    sessions[toolId] = {
      ...cur,
      options: { ...cur.options, ...newOptions },
      isOutdated: cur.result !== null,
    };
    emit();
  },

  rotateItem(toolId: string, id: string, delta: number = 90) {
    const cur = this.getToolState(toolId);
    const newItems = cur.items.map((it) => {
      if (it.id === id) {
        return { ...it, rotation: (((it.rotation + delta) % 360) + 360) % 360 };
      }
      return it;
    });
    this.setItems(toolId, newItems);
  },

  rotateSelected(toolId: string, delta: number = 90) {
    const cur = this.getToolState(toolId);
    const selSet = new Set(cur.selectedIds);
    const newItems = cur.items.map((it) => {
      if (selSet.has(it.id)) {
        return { ...it, rotation: (((it.rotation + delta) % 360) + 360) % 360 };
      }
      return it;
    });
    this.setItems(toolId, newItems);
  },

  updateItemEdits(
    toolId: string,
    id: string,
    edits: { rotation?: number; flipH?: boolean; flipV?: boolean; crop?: CropRect }
  ) {
    const cur = this.getToolState(toolId);
    const newItems = cur.items.map((it) => {
      if (it.id === id) {
        const updated = {
          ...it,
          rotation: edits.rotation !== undefined ? edits.rotation : it.rotation,
          flipH: edits.flipH !== undefined ? edits.flipH : it.flipH,
          flipV: edits.flipV !== undefined ? edits.flipV : it.flipV,
          crop: edits.crop !== undefined ? edits.crop : it.crop,
        };
        if (edits.crop === undefined && "crop" in edits) {
          delete updated.crop;
        }
        return updated;
      }
      return it;
    });
    this.setItems(toolId, newItems);
  },

  resetItemEdits(toolId: string, id: string) {
    const cur = this.getToolState(toolId);
    const newItems = cur.items.map((it) => {
      if (it.id === id) {
        const copy = { ...it, rotation: 0, flipH: false, flipV: false };
        delete copy.crop;
        return copy;
      }
      return it;
    });
    this.setItems(toolId, newItems);
  },

  updateItemCustomOption<K extends keyof PerPageOptions>(
    toolId: string,
    id: string,
    key: K,
    value: PerPageOptions[K],
    extraUpdates?: Partial<PerPageOptions>
  ) {
    const cur = this.getToolState(toolId);
    const newItems = cur.items.map((it) => {
      if (it.id === id) {
        return {
          ...it,
          customOptions: {
            ...(it.customOptions || {}),
            [key]: value,
            ...(extraUpdates || {}),
          },
        };
      }
      return it;
    });
    this.setItems(toolId, newItems);
  },

  resetItemCustomOptionProperty(toolId: string, id: string, key: keyof PerPageOptions) {
    const cur = this.getToolState(toolId);
    const newItems = cur.items.map((it) => {
      if (it.id === id && it.customOptions) {
        const updated = { ...it.customOptions };
        delete updated[key];
        if (key === "marginPreset") {
          delete updated.marginMm;
          delete updated.customMargins;
        }
        if (Object.keys(updated).length === 0) {
          const itemCopy = { ...it };
          delete itemCopy.customOptions;
          return itemCopy;
        }
        return { ...it, customOptions: updated };
      }
      return it;
    });
    this.setItems(toolId, newItems);
  },

  resetItemCustomOptions(toolId: string, id: string) {
    const cur = this.getToolState(toolId);
    const newItems = cur.items.map((it) => {
      if (it.id === id) {
        const itemCopy = { ...it };
        delete itemCopy.customOptions;
        return itemCopy;
      }
      return it;
    });
    this.setItems(toolId, newItems);
  },

  applyItemSettingsToAll(toolId: string, id: string) {
    const cur = this.getToolState(toolId);
    const targetItem = cur.items.find((it) => it.id === id);
    if (!targetItem) return;

    const effectiveSettings: Partial<PdfOptions> = {
      pageSize: targetItem.customOptions?.pageSize || cur.options.pageSize,
      orientation: targetItem.customOptions?.orientation || cur.options.orientation,
      fit: targetItem.customOptions?.fit || cur.options.fit,
      profile: targetItem.customOptions?.profile || cur.options.profile,
      marginPreset: targetItem.customOptions?.marginPreset || cur.options.marginPreset,
      marginMm:
        targetItem.customOptions?.marginMm !== undefined
          ? targetItem.customOptions.marginMm
          : cur.options.marginMm,
      customMargins: targetItem.customOptions?.customMargins
        ? [...targetItem.customOptions.customMargins]
        : [...cur.options.customMargins],
    };

    // Update shared options, and remove customOptions from all items
    const newItems = cur.items.map((it) => {
      const copy = { ...it };
      delete copy.customOptions;
      return copy;
    });

    sessions[toolId] = {
      ...cur,
      options: { ...cur.options, ...effectiveSettings },
      items: newItems,
      isOutdated: cur.result !== null,
    };
    emit();
  },

  duplicateItem(toolId: string, id: string): string {
    return duplicatePages(toolId, this.getToolState(toolId), id)[0] || "";
  },

  duplicateSelected(toolId: string): string[] {
    return duplicatePages(toolId, this.getToolState(toolId));
  },

  removeItem(toolId: string, id: string) {
    const cur = this.getToolState(toolId);
    const itemToRemove = cur.items.find((it) => it.id === id);
    if (itemToRemove?.objectUrl) {
      URL.revokeObjectURL(itemToRemove.objectUrl);
    }
    const newItems = cur.items.filter((it) => it.id !== id);
    const newSelected = cur.selectedIds.filter((selId) => selId !== id);
    sessions[toolId] = {
      ...cur,
      items: newItems,
      selectedIds: newSelected,
      isOutdated: cur.result !== null,
      activeInspectId:
        cur.activeInspectId === id
          ? newItems[0]?.id || ""
          : cur.activeInspectId,
    };
    emit();
  },

  removeSelected(toolId: string) {
    const cur = this.getToolState(toolId);
    const selSet = new Set(cur.selectedIds);
    cur.items.forEach((it) => {
      if (selSet.has(it.id) && it.objectUrl) {
        URL.revokeObjectURL(it.objectUrl);
      }
    });
    const newItems = cur.items.filter((it) => !selSet.has(it.id));
    sessions[toolId] = {
      ...cur,
      items: newItems,
      selectedIds: [],
      isOutdated: cur.result !== null,
      activeInspectId: newItems[0]?.id || "",
    };
    emit();
  },

  moveItem(toolId: string, fromIndex: number, toIndex: number) {
    const cur = this.getToolState(toolId);
    if (
      fromIndex < 0 ||
      fromIndex >= cur.items.length ||
      toIndex < 0 ||
      toIndex >= cur.items.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const newItems = [...cur.items];
    const [moved] = newItems.splice(fromIndex, 1);
    newItems.splice(toIndex, 0, moved);
    sessions[toolId] = {
      ...cur,
      items: newItems,
      options: { ...cur.options, sort: "manual", manualOrder: newItems.map((i) => i.id) },
      isOutdated: cur.result !== null,
    };
    emit();
  },

  async startGeneration(
    toolId: string,
    onProgress?: (progress: GenerationProgress) => void
  ): Promise<ConversionResult | null> {
    const cur = this.getToolState(toolId);
    if (cur.items.length === 0 || cur.jobStatus === "processing") {
      return null;
    }

    const controller = new AbortController();
    activeAbortController = controller;

    sessions[toolId] = {
      ...cur,
      jobStatus: "processing",
      progress: {
        current: 0,
        total: cur.items.length,
        currentFilename: "Preparing PDF...",
        phase: "preparing",
        percent: 0,
      },
      errorMessage: "",
    };
    emit();

    try {
      const sorted = sortImageItems(cur.items, cur.options.sort, cur.options.manualOrder);
      const res = await generatePdf(
        sorted,
        cur.options,
        (p) => {
          if (!controller.signal.aborted) {
            sessions[toolId] = { ...this.getToolState(toolId), progress: p };
            emit();
            onProgress?.(p);
          }
        },
        controller.signal
      );

      if (!controller.signal.aborted) {
        if (cur.result) URL.revokeObjectURL(cur.result.url);
        const latest = this.getToolState(toolId);
        sessions[toolId] = {
          ...this.getToolState(toolId),
          result: res,
          jobStatus: "completed",
          progress: null,
          isOutdated: latest.items !== cur.items || latest.options !== cur.options,
          errorMessage: "",
        };
        activeAbortController = null;
        emit();
        return res;
      }
      URL.revokeObjectURL(res.url);
      return null;
    } catch (err) {
      if (activeAbortController !== controller) return null;
      const isCancelled =
        controller.signal.aborted ||
        (err as Error).message?.includes("cancelled") ||
        (err as Error).message?.includes("aborted");

      sessions[toolId] = {
        ...this.getToolState(toolId),
        jobStatus: isCancelled ? "cancelled" : "failed",
        progress: null,
        errorMessage: isCancelled
          ? "PDF creation was cancelled."
          : (err as Error).message || "PDF generation failed.",
      };
      activeAbortController = null;
      emit();
      return null;
    }
  },

  cancelGeneration(toolId: string) {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    const cur = this.getToolState(toolId);
    sessions[toolId] = {
      ...cur,
      jobStatus: "cancelled",
      progress: null,
      errorMessage: "PDF creation was cancelled.",
    };
    emit();
  },

  reset(toolId: string) {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    const cur = this.getToolState(toolId);
    cur.items.forEach((it) => {
      if (it.objectUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
        URL.revokeObjectURL(it.objectUrl);
      }
    });
    if (cur.result?.url) {
      URL.revokeObjectURL(cur.result.url);
    }
    sessions[toolId] = {
      ...defaultToolState,
      options: { ...DEFAULT_PDF_OPTIONS },
      items: [],
      selectedIds: [],
    };
    emit();
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useDocumentSession(toolId: string): ToolSessionState {
  return useSyncExternalStore(
    documentSessionStore.subscribe,
    () => documentSessionStore.getToolState(toolId),
    () => documentSessionStore.getToolState(toolId)
  );
}
