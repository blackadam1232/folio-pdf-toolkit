import { useSyncExternalStore } from "react";
import JSZip from "jszip";
import { CompressionPreset, CompressionResult } from "../types";
import { inspectPdfFile } from "./pdfEngine";
import {
  compressPdf,
  generateCompressionPreview,
  getPresetForStrength,
} from "./compressEngine";

export interface CompressionItem {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount: number;
  status: "idle" | "processing" | "completed" | "failed" | "cancelled";
  result?: CompressionResult;
  errorMessage?: string;
}

export interface CompressionSessionState {
  items: CompressionItem[];
  activeItemId: string | null;

  // Single-file compatibility getters/properties
  file: File | null;
  fileInfo: {
    name: string;
    size: number;
    pageCount: number;
  } | null;

  preset: CompressionPreset;
  strength: number; // 1-100%
  previewPage: number;
  previewViewMode: "split" | "original" | "compressed";
  previewImages: { originalUrl: string; compressedUrl: string } | null;
  isPreviewLoading: boolean;

  jobStatus: "idle" | "processing" | "completed" | "failed" | "cancelled";
  progress: { percent: number; status: string } | null;
  batchProgress: {
    current: number;
    total: number;
    currentFilename: string;
    percent: number;
    status: string;
  } | null;

  result: CompressionResult | null;
  results: Record<string, CompressionResult>;
  zipBlob: Blob | null;
  zipUrl: string | null;

  isOutdated: boolean;
  errorMessage: string;
  activeJobId: number;
}

const initialState: CompressionSessionState = {
  items: [],
  activeItemId: null,
  file: null,
  fileInfo: null,
  preset: "balanced",
  strength: 50,
  previewPage: 1,
  previewViewMode: "split",
  previewImages: null,
  isPreviewLoading: false,
  jobStatus: "idle",
  progress: null,
  batchProgress: null,
  result: null,
  results: {},
  zipBlob: null,
  zipUrl: null,
  isOutdated: false,
  errorMessage: "",
  activeJobId: 0,
};

let state: CompressionSessionState = { ...initialState };
const listeners = new Set<() => void>();

let activeAbortController: AbortController | null = null;
let previewDebounceTimer: any = null;
let currentPreviewJobId = 0;

function emit() {
  listeners.forEach((listener) => listener());
}

export const compressionSessionStore = {
  getState(): CompressionSessionState {
    return state;
  },

  async setFile(newFile: File): Promise<boolean> {
    return this.addFiles([newFile], true);
  },

  async addFiles(newFiles: FileList | File[], replace = false): Promise<boolean> {
    const filesArray = Array.from(newFiles);
    if (!filesArray.length) return false;

    const validFiles: File[] = [];
    for (const f of filesArray) {
      if (f.name.toLowerCase().endsWith(".pdf")) {
        validFiles.push(f);
      }
    }

    if (!validFiles.length) {
      state = { ...state, errorMessage: "Please select valid .pdf file(s)." };
      emit();
      return false;
    }

    state = { ...state, errorMessage: "" };
    emit();

    const inspectedItems: CompressionItem[] = [];
    for (const f of validFiles) {
      try {
        const info = await inspectPdfFile(f);
        inspectedItems.push({
          id: `cpdf_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          file: f,
          name: f.name,
          size: f.size,
          pageCount: info.pageCount,
          status: "idle",
        });
      } catch (err) {
        console.warn("Could not inspect PDF file:", f.name, err);
      }
    }

    if (!inspectedItems.length) {
      state = {
        ...state,
        errorMessage: "Could not read the selected PDF file(s).",
      };
      emit();
      return false;
    }

    if (replace) {
      if (state.zipUrl) URL.revokeObjectURL(state.zipUrl);
      Object.values(state.results).forEach((r) => {
        if (r?.url) URL.revokeObjectURL(r.url);
      });
      if (state.result?.url) URL.revokeObjectURL(state.result.url);
    }

    const updatedItems = replace ? inspectedItems : [...state.items, ...inspectedItems];
    const activeItem =
      state.activeItemId && !replace
        ? updatedItems.find((it) => it.id === state.activeItemId) || updatedItems[0]
        : updatedItems[0];

    state = {
      ...state,
      items: updatedItems,
      activeItemId: activeItem.id,
      file: activeItem.file,
      fileInfo: {
        name: activeItem.name,
        size: activeItem.size,
        pageCount: activeItem.pageCount,
      },
      previewPage: 1,
      result: replace ? null : state.result,
      results: replace ? {} : state.results,
      zipBlob: replace ? null : state.zipBlob,
      zipUrl: replace ? null : state.zipUrl,
      isOutdated: false,
      errorMessage: "",
      previewImages: null,
      jobStatus: "idle",
      progress: null,
      batchProgress: null,
    };
    emit();

    this.requestPreview();
    return true;
  },

  removeFile(id: string) {
    const itemToRemove = state.items.find((it) => it.id === id);
    if (!itemToRemove) return;

    if (itemToRemove.result?.url) {
      URL.revokeObjectURL(itemToRemove.result.url);
    }

    const updatedItems = state.items.filter((it) => it.id !== id);
    const updatedResults = { ...state.results };
    delete updatedResults[id];

    if (state.zipUrl) {
      URL.revokeObjectURL(state.zipUrl);
    }

    if (!updatedItems.length) {
      state = {
        ...initialState,
        items: [],
        activeItemId: null,
        results: {},
        activeJobId: state.activeJobId + 1,
      };
      emit();
      return;
    }

    let nextActiveItem = updatedItems.find((it) => it.id === state.activeItemId);
    if (!nextActiveItem) {
      nextActiveItem = updatedItems[0];
    }

    state = {
      ...state,
      items: updatedItems,
      activeItemId: nextActiveItem.id,
      file: nextActiveItem.file,
      fileInfo: {
        name: nextActiveItem.name,
        size: nextActiveItem.size,
        pageCount: nextActiveItem.pageCount,
      },
      previewPage: 1,
      result: updatedResults[nextActiveItem.id] || null,
      results: updatedResults,
      zipBlob: null,
      zipUrl: null,
      previewImages: null,
    };
    emit();

    this.requestPreview();
  },

  setActiveFile(id: string) {
    const target = state.items.find((it) => it.id === id);
    if (!target || target.id === state.activeItemId) return;

    state = {
      ...state,
      activeItemId: target.id,
      file: target.file,
      fileInfo: {
        name: target.name,
        size: target.size,
        pageCount: target.pageCount,
      },
      previewPage: 1,
      result: state.results[target.id] || target.result || null,
      previewImages: null,
    };
    emit();

    this.requestPreview();
  },

  setSettings(newStrength: number, newPreset?: CompressionPreset) {
    const clamped = Math.max(1, Math.min(100, Math.round(newStrength)));
    const preset = newPreset || getPresetForStrength(clamped);

    const hasAnyResults = state.result !== null || Object.keys(state.results).length > 0;

    state = {
      ...state,
      strength: clamped,
      preset,
      isOutdated: hasAnyResults,
    };
    emit();

    this.requestPreview();
  },

  setPreviewPage(page: number) {
    if (!state.fileInfo) return;
    const clamped = Math.max(1, Math.min(state.fileInfo.pageCount, page));
    if (clamped === state.previewPage) return;

    state = { ...state, previewPage: clamped };
    emit();

    this.requestPreview();
  },

  setPreviewViewMode(mode: "split" | "original" | "compressed") {
    state = { ...state, previewViewMode: mode };
    emit();
  },

  requestPreview() {
    if (!state.file) return;

    if (previewDebounceTimer) {
      clearTimeout(previewDebounceTimer);
    }

    currentPreviewJobId++;
    const jobId = currentPreviewJobId;
    const file = state.file;
    const page = state.previewPage;
    const strength = state.strength;

    state = { ...state, isPreviewLoading: true };
    emit();

    previewDebounceTimer = setTimeout(async () => {
      try {
        const preview = await generateCompressionPreview(file, page, strength);
        if (currentPreviewJobId === jobId) {
          state = {
            ...state,
            previewImages: preview,
            isPreviewLoading: false,
          };
          emit();
        }
      } catch (err) {
        if (currentPreviewJobId === jobId) {
          console.warn("Sample preview generation error:", err);
          state = { ...state, isPreviewLoading: false };
          emit();
        }
      }
    }, 250);
  },

  async startCompression(
    onProgress?: (progress: { percent: number; status: string }) => void,
    onComplete?: (result: CompressionResult) => void
  ): Promise<CompressionResult | null> {
    const itemsToCompress = [...state.items];
    if (!itemsToCompress.length || state.jobStatus === "processing") {
      return null;
    }

    const newJobId = state.activeJobId + 1;
    const controller = new AbortController();
    activeAbortController = controller;

    state = {
      ...state,
      activeJobId: newJobId,
      jobStatus: "processing",
      progress: { percent: 0, status: "Preparing compression…" },
      batchProgress: {
        current: 1,
        total: itemsToCompress.length,
        currentFilename: itemsToCompress[0].name,
        percent: 0,
        status: `Starting compression (1 of ${itemsToCompress.length})…`,
      },
      errorMessage: "",
    };
    emit();

    const results: Record<string, CompressionResult> = {};

    try {
      for (let i = 0; i < itemsToCompress.length; i++) {
        if (controller.signal.aborted) {
          throw new Error("Compression cancelled by user.");
        }

        const item = itemsToCompress[i];
        item.status = "processing";

        const fileWeight = 1 / itemsToCompress.length;
        const basePercent = Math.round((i / itemsToCompress.length) * 100);

        state = {
          ...state,
          batchProgress: {
            current: i + 1,
            total: itemsToCompress.length,
            currentFilename: item.name,
            percent: basePercent,
            status: `Compressing ${item.name} (${i + 1} of ${itemsToCompress.length})…`,
          },
          progress: {
            percent: basePercent,
            status: `Compressing ${item.name} (${i + 1} of ${itemsToCompress.length})…`,
          },
        };
        emit();

        try {
          const res = await compressPdf(
            item.file,
            state.strength,
            (fileProg) => {
              if (state.activeJobId === newJobId && !controller.signal.aborted) {
                const overallPercent = Math.min(
                  98,
                  Math.round(basePercent + fileProg.percent * fileWeight)
                );
                const combinedProg = {
                  percent: overallPercent,
                  status:
                    itemsToCompress.length > 1
                      ? `[${i + 1}/${itemsToCompress.length}] ${fileProg.status}`
                      : fileProg.status,
                };
                state = {
                  ...state,
                  progress: combinedProg,
                  batchProgress: {
                    current: i + 1,
                    total: itemsToCompress.length,
                    currentFilename: item.name,
                    percent: overallPercent,
                    status: combinedProg.status,
                  },
                };
                emit();
                onProgress?.(combinedProg);
              }
            },
            controller.signal
          );

          item.result = res;
          item.status = "completed";
          results[item.id] = res;
        } catch (err) {
          if (controller.signal.aborted) {
            throw err;
          }
          console.warn(`Compression failed for ${item.name}:`, err);
          item.status = "failed";
          item.errorMessage = (err as Error).message || "Compression failed.";
        }
      }

      if (state.activeJobId === newJobId) {
        // Build ZIP if multiple files
        let zipBlob: Blob | null = null;
        let zipUrl: string | null = null;

        const completedResults = Object.values(results);
        if (completedResults.length > 1) {
          state = {
            ...state,
            progress: { percent: 98, status: "Packaging ZIP archive…" },
          };
          emit();

          const zip = new JSZip();
          for (const it of itemsToCompress) {
            if (it.result) {
              const arrayBuf = await it.result.blob.arrayBuffer();
              const filename = it.result.isReduced ? it.result.filename : it.name;
              zip.file(filename, arrayBuf);
            }
          }
          zipBlob = await zip.generateAsync({ type: "blob" });
          zipUrl = URL.createObjectURL(zipBlob);
        }

        if (state.zipUrl && state.zipUrl !== zipUrl) {
          URL.revokeObjectURL(state.zipUrl);
        }

        const activeResult =
          (state.activeItemId && results[state.activeItemId]) ||
          completedResults[0] ||
          null;

        state = {
          ...state,
          items: itemsToCompress,
          results,
          result: activeResult,
          zipBlob,
          zipUrl,
          jobStatus: "completed",
          progress: null,
          batchProgress: null,
          isOutdated: false,
          errorMessage: "",
        };
        activeAbortController = null;
        emit();
        if (activeResult) {
          onComplete?.(activeResult);
        }
        return activeResult;
      }
      return null;
    } catch (err) {
      if (state.activeJobId === newJobId) {
        const isCancelled =
          controller.signal.aborted ||
          (err as Error).message?.includes("cancelled");

        state = {
          ...state,
          jobStatus: isCancelled ? "cancelled" : "failed",
          progress: null,
          batchProgress: null,
          errorMessage: isCancelled
            ? "Compression was cancelled."
            : (err as Error).message || "Compression failed.",
        };
        activeAbortController = null;
        emit();
      }
      return null;
    }
  },

  cancelCompression() {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    state = {
      ...state,
      jobStatus: "cancelled",
      progress: null,
      batchProgress: null,
      errorMessage: "Compression was cancelled.",
    };
    emit();
  },

  clearError() {
    state = { ...state, errorMessage: "" };
    emit();
  },

  reset() {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    if (previewDebounceTimer) {
      clearTimeout(previewDebounceTimer);
    }
    if (state.zipUrl) {
      URL.revokeObjectURL(state.zipUrl);
    }
    Object.values(state.results).forEach((r) => {
      if (r?.url) URL.revokeObjectURL(r.url);
    });
    if (state.result?.url) {
      URL.revokeObjectURL(state.result.url);
    }
    state = { ...initialState, activeJobId: state.activeJobId + 1 };
    emit();
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useCompressionSession(): CompressionSessionState {
  return useSyncExternalStore(
    compressionSessionStore.subscribe,
    compressionSessionStore.getState,
    compressionSessionStore.getState
  );
}
