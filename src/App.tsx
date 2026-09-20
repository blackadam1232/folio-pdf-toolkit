import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ConversionResult,
  GenerationProgress,
  ImageItem,
  PdfOptions,
  SortMode,
} from "./types";
import {
  generatePdf,
  inspectImageFile,
  validateImageFile,
  MAX_FILES_LIMIT,
  MAX_TOTAL_BYTES_LIMIT,
} from "./lib/pdfEngine";
import { sortImageItems } from "./lib/sort";
import { calculateGeometry } from "./lib/layout";
import { ImageList, formatBytes } from "./components/ImageList";
import { SettingsPanel } from "./components/SettingsPanel";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { ConversionBar } from "./components/ConversionBar";
import "./style.css";

const DEFAULT_OPTIONS: PdfOptions = {
  pageSize: "A4",
  orientation: "Auto",
  fit: "Contain",
  profile: "Screen/Mobile",
  marginPreset: "Small",
  marginMm: 5,
  customMargins: [5, 5, 5, 5],
  filename: "folio-document",
  sort: "natural-asc",
  manualOrder: [],
};

export default function App() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [options, setOptions] = useState<PdfOptions>(DEFAULT_OPTIONS);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const abortControllerRef = useRef<AbortController | null>(null);

  // Sorted items based on active sort options
  const sortedItems = useMemo(() => {
    return sortImageItems(items, options.sort, options.manualOrder);
  }, [items, options.sort, options.manualOrder]);

  // Active item for preview
  const activePreviewItem = useMemo(() => {
    if (!sortedItems.length) return null;
    return sortedItems.find((it) => it.id === selectedId) || sortedItems[0];
  }, [sortedItems, selectedId]);

  const activePreviewIndex = useMemo(() => {
    if (!activePreviewItem) return 0;
    return Math.max(0, sortedItems.findIndex((it) => it.id === activePreviewItem.id));
  }, [sortedItems, activePreviewItem]);

  // Check if current options have layout validation errors
  const hasValidationError = useMemo(() => {
    if (!activePreviewItem) return false;
    try {
      calculateGeometry({
        imageWidth: activePreviewItem.width,
        imageHeight: activePreviewItem.height,
        rotation: activePreviewItem.rotation,
        options,
      });
      return false;
    } catch {
      return true;
    }
  }, [activePreviewItem, options]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      items.forEach((it) => URL.revokeObjectURL(it.objectUrl));
      if (result) URL.revokeObjectURL(result.url);
    };
  }, []);

  // When files or options change, mark previous result as outdated
  const markOutdated = () => {
    if (result && !result.isOutdated) {
      setResult((prev) => (prev ? { ...prev, isOutdated: true } : null));
    }
  };

  // Add files handler
  const handleAddFiles = async (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    if (!incoming.length) return;

    setErrorMessage("");
    const newItems: ImageItem[] = [];
    const errors: string[] = [];

    // Check batch limit
    if (items.length + incoming.length > MAX_FILES_LIMIT) {
      setErrorMessage(
        `Batch limit exceeded: You can select up to ${MAX_FILES_LIMIT} images (current: ${items.length}, incoming: ${incoming.length}).`
      );
      return;
    }

    // Check total bytes limit
    const currentBytes = items.reduce((sum, it) => sum + it.size, 0);
    const incomingBytes = incoming.reduce((sum, f) => sum + f.size, 0);
    if (currentBytes + incomingBytes > MAX_TOTAL_BYTES_LIMIT) {
      setErrorMessage(
        `Total batch size exceeds ${formatBytes(MAX_TOTAL_BYTES_LIMIT)}. Please choose a smaller batch.`
      );
      return;
    }

    for (const file of incoming) {
      const validation = validateImageFile(file);
      if (!validation.valid) {
        errors.push(validation.error || `Skipped ${file.name}`);
        continue;
      }

      try {
        const { width, height, objectUrl } = await inspectImageFile(file);
        const item: ImageItem = {
          id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          file,
          name: file.name,
          size: file.size,
          modified: file.lastModified,
          objectUrl,
          width,
          height,
          rotation: 0,
        };
        newItems.push(item);
      } catch (err) {
        errors.push((err as Error).message);
      }
    }

    if (errors.length > 0) {
      setErrorMessage(errors.join(" · "));
    }

    if (newItems.length > 0) {
      setItems((prev) => {
        const updated = [...prev, ...newItems];
        return updated;
      });

      if (!selectedId && newItems.length > 0) {
        setSelectedId(newItems[0].id);
      }

      markOutdated();
    }
  };

  // Remove individual image
  const handleRemove = (id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target) URL.revokeObjectURL(target.objectUrl);
      const remaining = prev.filter((it) => it.id !== id);
      if (selectedId === id) {
        setSelectedId(remaining.length ? remaining[0].id : "");
      }
      return remaining;
    });

    setOptions((prev) => ({
      ...prev,
      manualOrder: prev.manualOrder.filter((itemKey) => itemKey !== id),
    }));

    markOutdated();
  };

  // Clear all images
  const handleClearAll = () => {
    items.forEach((it) => URL.revokeObjectURL(it.objectUrl));
    if (result) URL.revokeObjectURL(result.url);
    setItems([]);
    setSelectedId("");
    setResult(null);
    setErrorMessage("");
    setOptions((prev) => ({ ...prev, manualOrder: [] }));
  };

  // Rotate image by 90 degrees
  const handleRotate = (id: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, rotation: (it.rotation + 90) % 360 } : it
      )
    );
    markOutdated();
  };

  // Reorder images
  const handleMove = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= sortedItems.length || fromIndex === toIndex) return;

    const currentOrder = sortedItems.map((it) => it.id);
    const [movedId] = currentOrder.splice(fromIndex, 1);
    currentOrder.splice(toIndex, 0, movedId);

    setOptions((prev) => ({
      ...prev,
      sort: "manual",
      manualOrder: currentOrder,
    }));

    markOutdated();
  };

  // Handle Sort Change
  const handleSortChange = (mode: SortMode) => {
    setOptions((prev) => ({
      ...prev,
      sort: mode,
    }));
    markOutdated();
  };

  // Handle Settings Change
  const handleOptionsChange = (newOptions: PdfOptions) => {
    setOptions(newOptions);
    markOutdated();
  };

  // Generate PDF
  const handleGenerate = async () => {
    if (!items.length) {
      setErrorMessage("Please select at least one image first.");
      return;
    }

    setErrorMessage("");
    setIsProcessing(true);
    setProgress({
      current: 0,
      total: sortedItems.length,
      currentFilename: "Initializing PDF creation…",
      phase: "preparing",
      percent: 0,
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await generatePdf(
        items,
        options,
        (p) => setProgress(p),
        controller.signal
      );

      // Clean up previous blob URL if exists
      if (result) URL.revokeObjectURL(result.url);

      setResult(res);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("cancelled")) {
        setErrorMessage("Conversion was cancelled.");
      } else {
        setErrorMessage(msg || "Failed to generate PDF. Please try again.");
      }
    } finally {
      setIsProcessing(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  };

  // Cancel PDF generation
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Download PDF
  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="folio-app">
      {/* App Header */}
      <header className="app-header">
        <div className="header-inner">
          <div className="brand-group">
            <span className="brandmark">F</span>
            <span className="brand-title">
              folio<span className="brand-dot">.</span>
            </span>
            <span className="brand-badge">Browser PDF Toolkit</span>
          </div>

          <div className="header-privacy-badge">
            <span className="privacy-dot" />
            <span>100% Client-Side · Zero Upload</span>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="workspace-container">
        {/* Error Notification */}
        {errorMessage && (
          <div className="app-error-banner" role="alert">
            <span className="error-icon">⚠</span>
            <span className="error-text">{errorMessage}</span>
            <button
              type="button"
              className="error-dismiss-btn"
              onClick={() => setErrorMessage("")}
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        {/* 3-Column Responsive Grid */}
        <div className="workspace-grid">
          {/* Column 1: Image Collection & Reordering */}
          <ImageList
            items={sortedItems}
            selectedId={selectedId || (sortedItems[0]?.id ?? "")}
            onSelect={(id) => setSelectedId(id)}
            onAddFiles={handleAddFiles}
            onRemove={handleRemove}
            onClearAll={handleClearAll}
            onRotate={handleRotate}
            onMove={handleMove}
            sortMode={options.sort}
            onSortChange={handleSortChange}
            isProcessing={isProcessing}
          />

          {/* Column 2: Live Layout Preview */}
          <section className="panel preview-panel">
            <div className="section-head">
              <div>
                <h2>Layout Preview</h2>
                <p className="panel-subtitle">Shared pixel-accurate PDF geometry</p>
              </div>
              <span className="step-badge">Preview</span>
            </div>

            <PreviewCanvas
              item={activePreviewItem}
              options={options}
              pageIndex={activePreviewIndex}
              totalPages={sortedItems.length}
              onPageChange={(idx) => {
                if (sortedItems[idx]) {
                  setSelectedId(sortedItems[idx].id);
                }
              }}
            />
          </section>

          {/* Column 3: Settings Panel */}
          <SettingsPanel
            options={options}
            onChange={handleOptionsChange}
            disabled={isProcessing}
          />
        </div>

        {/* Sticky Conversion Bar */}
        <ConversionBar
          isProcessing={isProcessing}
          progress={progress}
          result={result}
          hasImages={items.length > 0}
          hasValidationError={hasValidationError}
          onGenerate={handleGenerate}
          onCancel={handleCancel}
          onDownload={handleDownload}
        />
      </main>
    </div>
  );
}
