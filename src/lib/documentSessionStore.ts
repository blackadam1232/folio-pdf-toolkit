import { useSyncExternalStore } from "react";
import {
  ConversionResult,
  GenerationProgress,
  ImageItem,
  PdfOptions,
} from "../types";
import { generatePdf, inspectImageFile } from "./pdfEngine";
import { sortImageItems } from "./sort";

export const DEFAULT_PDF_OPTIONS: PdfOptions = {
  pageSize: "A4",
  orientation: "Portrait",
  fit: "Contain",
  profile: "Screen/Mobile",
  marginPreset: "Small",
  marginMm: 12,
  customMargins: [12, 12, 12, 12],
  filename: "My travel pages.pdf",
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
        sessions[toolId] = {
          ...this.getToolState(toolId),
          result: res,
          jobStatus: "completed",
          progress: null,
          isOutdated: false,
          errorMessage: "",
        };
        activeAbortController = null;
        emit();
        return res;
      }
      return null;
    } catch (err) {
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
