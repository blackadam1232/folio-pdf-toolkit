import { useSyncExternalStore } from "react";
import { CompressionPreset, CompressionResult } from "../types";
import { inspectPdfFile } from "./pdfEngine";
import {
  compressPdf,
  generateCompressionPreview,
  getPresetForStrength,
} from "./compressEngine";

export interface CompressionSessionState {
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
  result: CompressionResult | null;
  isOutdated: boolean;
  errorMessage: string;
  activeJobId: number;
}

const initialState: CompressionSessionState = {
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
  result: null,
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
    if (!newFile.name.toLowerCase().endsWith(".pdf")) {
      state = { ...state, errorMessage: "Please select a valid .pdf file." };
      emit();
      return false;
    }

    state = { ...state, errorMessage: "" };
    emit();

    try {
      const info = await inspectPdfFile(newFile);
      if (state.result?.url) {
        URL.revokeObjectURL(state.result.url);
      }

      state = {
        ...state,
        file: newFile,
        fileInfo: {
          name: newFile.name,
          size: newFile.size,
          pageCount: info.pageCount,
        },
        previewPage: 1,
        result: null,
        isOutdated: false,
        errorMessage: "",
        previewImages: null,
        jobStatus: "idle",
        progress: null,
      };
      emit();

      this.requestPreview();
      return true;
    } catch (err) {
      state = {
        ...state,
        errorMessage: (err as Error).message || "Could not read PDF file.",
      };
      emit();
      return false;
    }
  },

  setSettings(newStrength: number, newPreset?: CompressionPreset) {
    const clamped = Math.max(1, Math.min(100, Math.round(newStrength)));
    const preset = newPreset || getPresetForStrength(clamped);

    state = {
      ...state,
      strength: clamped,
      preset,
      isOutdated: state.result !== null,
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
    const fileToCompress = state.file;
    if (!fileToCompress || state.jobStatus === "processing") {
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
      errorMessage: "",
    };
    emit();

    try {
      const res = await compressPdf(
        fileToCompress,
        state.strength,
        (p) => {
          if (state.activeJobId === newJobId && !controller.signal.aborted) {
            state = { ...state, progress: p };
            emit();
            onProgress?.(p);
          }
        },
        controller.signal
      );

      if (state.activeJobId === newJobId) {
        if (state.result?.url && state.result.url !== res.url) {
          URL.revokeObjectURL(state.result.url);
        }

        state = {
          ...state,
          result: res,
          jobStatus: "completed",
          progress: null,
          isOutdated: false,
          errorMessage: "",
        };
        activeAbortController = null;
        emit();
        onComplete?.(res);
        return res;
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
