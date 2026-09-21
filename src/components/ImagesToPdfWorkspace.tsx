import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  ConversionResult,
  GenerationProgress,
  ImageItem,
  PdfOptions,
  PerPageOptions,
  SortMode,
} from "../types";
import {
  generatePdf,
  inspectImageFile,
  validateImageFile,
  MAX_FILES_LIMIT,
  MAX_TOTAL_BYTES_LIMIT,
} from "../lib/pdfEngine";
import { sortImageItems } from "../lib/sort";
import { calculateGeometry } from "../lib/layout";
import { loadSampleSet } from "../lib/sampleImages";
import {
  FolioLogoIcon,
  LockIcon,
  RotateIcon,
  TrashIcon,
  CheckIcon,
  PdfDocIcon,
  SettingsIcon,
  PlusIcon,
} from "./Icons";

interface ImagesToPdfWorkspaceProps {
  onBackToHome: () => void;
}

const DEFAULT_OPTIONS: PdfOptions = {
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

export function ImagesToPdfWorkspace({ onBackToHome }: ImagesToPdfWorkspaceProps) {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeInspectId, setActiveInspectId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"overview" | "single">("overview");
  const [scopeMode, setScopeMode] = useState<"all" | "custom">("all");
  const [options, setOptions] = useState<PdfOptions>(DEFAULT_OPTIONS);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState<boolean>(false);
  const [isLoadingSamples, setIsLoadingSamples] = useState<boolean>(false);
  const [singleZoom, setSingleZoom] = useState<number>(1);
  const [jumpPageInput, setJumpPageInput] = useState<string>("1");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Clean empty initial state - no default images auto-loaded

  // Sorted items based on active sort options
  const sortedItems = useMemo(() => {
    return sortImageItems(items, options.sort, options.manualOrder);
  }, [items, options.sort, options.manualOrder]);

  // Active inspect item for single page mode
  const activeInspectItem = useMemo(() => {
    if (!sortedItems.length) return null;
    return sortedItems.find((it) => it.id === activeInspectId) || sortedItems[0];
  }, [sortedItems, activeInspectId]);

  const activeInspectIndex = useMemo(() => {
    if (!activeInspectItem) return 0;
    return Math.max(0, sortedItems.findIndex((it) => it.id === activeInspectItem.id));
  }, [sortedItems, activeInspectItem]);

  // Mark result outdated when options or items change
  const markOutdated = () => {
    if (result && !result.isOutdated) {
      setResult((prev) => (prev ? { ...prev, isOutdated: true } : null));
    }
  };

  // Active target item when configuring scope (custom per page vs all)
  const activeTargetItem = useMemo(() => {
    if (selectedIds.size === 1) {
      const id = Array.from(selectedIds)[0];
      return items.find((it) => it.id === id) || activeInspectItem;
    }
    return activeInspectItem;
  }, [selectedIds, items, activeInspectItem]);

  // Target item IDs for per-page updates
  const targetIds = useMemo(() => {
    if (selectedIds.size > 1) {
      return Array.from(selectedIds);
    }
    if (selectedIds.size === 1) {
      return Array.from(selectedIds);
    }
    return activeTargetItem ? [activeTargetItem.id] : [];
  }, [selectedIds, activeTargetItem]);

  // Effective options for the currently active item
  const activeItemOptions = useMemo((): PdfOptions => {
    if (!activeInspectItem) return options;
    return {
      ...options,
      ...(activeInspectItem.customOptions || {}),
    };
  }, [activeInspectItem, options]);

  // Options displayed in the settings controls
  const currentDisplayOptions: PdfOptions = useMemo(() => {
    if (scopeMode === "custom" && activeTargetItem) {
      return {
        ...options,
        ...(activeTargetItem.customOptions || {}),
      };
    }
    return options;
  }, [scopeMode, activeTargetItem, options]);

  // Handler for setting changes: updates custom per-page options when in "custom" mode,
  // or updates global options when in "all" mode.
  const handleOptionChange = <K extends keyof PerPageOptions>(
    key: K,
    value: PerPageOptions[K],
    extraUpdates?: Partial<PerPageOptions>
  ) => {
    if (scopeMode === "custom") {
      if (targetIds.length === 0) return;
      setItems((prevItems) =>
        prevItems.map((it) => {
          if (targetIds.includes(it.id)) {
            const currentCustom = it.customOptions || {};
            return {
              ...it,
              customOptions: {
                ...currentCustom,
                [key]: value,
                ...(extraUpdates || {}),
              },
            };
          }
          return it;
        })
      );
      markOutdated();
    } else {
      setOptions((prev) => ({
        ...prev,
        [key]: value,
        ...(extraUpdates || {}),
      }));
      markOutdated();
    }
  };

  // Reset custom per-page options back to document defaults
  const handleResetCustomOptions = (idsToReset: string[]) => {
    setItems((prevItems) =>
      prevItems.map((it) => {
        if (idsToReset.includes(it.id)) {
          const updated = { ...it };
          delete updated.customOptions;
          return updated;
        }
        return it;
      })
    );
    markOutdated();
  };

  // Aspect ratio for preview canvas / simulated sheet
  const previewAspectRatio = useMemo(() => {
    if (!activeInspectItem) return "210 / 297";
    const eff = {
      ...options,
      ...(activeInspectItem.customOptions || {}),
    };
    const isQuarter = activeInspectItem.rotation % 180 !== 0;
    const effW = isQuarter ? activeInspectItem.height : activeInspectItem.width;
    const effH = isQuarter ? activeInspectItem.width : activeInspectItem.height;

    if (eff.pageSize === "Original") {
      return `${effW} / ${effH}`;
    }
    let landscape = false;
    if (eff.orientation === "Landscape") {
      landscape = true;
    } else if (eff.orientation === "Auto") {
      landscape = effW > effH;
    }
    if (eff.pageSize === "Letter") {
      return landscape ? "11 / 8.5" : "8.5 / 11";
    }
    return landscape ? "297 / 210" : "210 / 297";
  }, [activeInspectItem, options]);

  // Add files
  const handleAddFiles = async (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    if (!incoming.length) return;

    setErrorMessage("");
    const newItems: ImageItem[] = [];
    const errors: string[] = [];

    if (items.length + incoming.length > MAX_FILES_LIMIT) {
      setErrorMessage(`Limit of ${MAX_FILES_LIMIT} images exceeded.`);
      return;
    }

    const currentBytes = items.reduce((sum, it) => sum + it.size, 0);
    const incomingBytes = incoming.reduce((sum, f) => sum + f.size, 0);
    if (currentBytes + incomingBytes > MAX_TOTAL_BYTES_LIMIT) {
      setErrorMessage("Total batch size exceeds 300MB limit.");
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
        newItems.push({
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
        errors.push((err as Error).message);
      }
    }

    if (errors.length > 0) {
      setErrorMessage(errors.join(" · "));
    }

    if (newItems.length > 0) {
      setItems((prev) => [...prev, ...newItems]);
      if (!activeInspectId && newItems[0]) {
        setActiveInspectId(newItems[0].id);
      }
      markOutdated();
    }
  };

  // Selection toggle
  const toggleSelection = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Select all or clear selection
  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((it) => it.id)));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Batch rotate selected
  const handleRotateSelected = () => {
    if (!selectedIds.size) return;
    setItems((prev) =>
      prev.map((it) =>
        selectedIds.has(it.id)
          ? { ...it, rotation: (it.rotation + 90) % 360 }
          : it
      )
    );
    markOutdated();
  };

  // Batch remove selected
  const handleRemoveSelected = () => {
    if (!selectedIds.size) return;
    setItems((prev) => {
      const remaining = prev.filter((it) => {
        if (selectedIds.has(it.id)) {
          URL.revokeObjectURL(it.objectUrl);
          return false;
        }
        return true;
      });
      if (selectedIds.has(activeInspectId)) {
        setActiveInspectId(remaining[0]?.id || "");
      }
      return remaining;
    });
    setSelectedIds(new Set());
    markOutdated();
  };

  // Remove single item
  const handleRemoveSingle = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target) URL.revokeObjectURL(target.objectUrl);
      const remaining = prev.filter((it) => it.id !== id);
      if (activeInspectId === id) {
        setActiveInspectId(remaining[0]?.id || "");
      }
      return remaining;
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    markOutdated();
  };

  // Handle Sort
  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as SortMode;
    setOptions((prev) => ({ ...prev, sort: val }));
    markOutdated();
  };

  // Jump to page
  const handleJumpPage = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(jumpPageInput, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= sortedItems.length) {
      const target = sortedItems[pageNum - 1];
      if (target) {
        setActiveInspectId(target.id);
        const cardEl = document.getElementById(`page-card-${target.id}`);
        cardEl?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  // Generate PDF
  const handleGeneratePdf = async () => {
    if (!items.length) {
      setErrorMessage("Please add at least one image first.");
      return;
    }

    setErrorMessage("");
    setIsProcessing(true);
    setProgress({
      current: 0,
      total: sortedItems.length,
      currentFilename: "Preparing PDF…",
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

      if (result) URL.revokeObjectURL(result.url);
      setResult(res);
      setMobileSettingsOpen(false);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("cancelled")) {
        setErrorMessage("Generation was cancelled.");
      } else {
        setErrorMessage(msg || "Failed to generate PDF.");
      }
    } finally {
      setIsProcessing(false);
      setProgress(null);
      abortControllerRef.current = null;
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

  // Shared geometry for preview canvas
  const inspectGeometry = useMemo(() => {
    if (!activeInspectItem) return null;
    try {
      return calculateGeometry({
        imageWidth: activeInspectItem.width,
        imageHeight: activeInspectItem.height,
        rotation: activeInspectItem.rotation,
        options: activeItemOptions,
      });
    } catch (err) {
      return null;
    }
  }, [activeInspectItem, activeItemOptions]);

  return (
    <div className="folio-workspace images-workspace">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files) handleAddFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Main Workspace Layout */}
      <div className="workspace-layout">
        {/* Main Content Area (~75-80% desktop) */}
        <div className="workspace-main-col">
          {/* Main Title Area */}
          <div className="workspace-title-bar">
            <div className="title-left-group">
              <button
                type="button"
                className="btn-inapp-back"
                onClick={onBackToHome}
                aria-label="Back to all tools"
              >
                ← All tools
              </button>
              <h1 className="document-title">Your document</h1>
              <span className="document-page-badge">
                {sortedItems.length} {sortedItems.length === 1 ? "page" : "pages"}
              </span>
            </div>

            <div className="title-controls-group">
              {/* View Switcher: [ Overview ] [ Single page ] */}
              <div className="view-mode-toggle" role="tablist" aria-label="View Mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "overview"}
                  className={`btn-toggle-tab ${viewMode === "overview" ? "active" : ""}`}
                  onClick={() => setViewMode("overview")}
                >
                  Overview
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "single"}
                  className={`btn-toggle-tab ${viewMode === "single" ? "active" : ""}`}
                  onClick={() => setViewMode("single")}
                >
                  Single page
                </button>
              </div>

              {/* Add Images Button */}
              <button
                type="button"
                className="btn-add-images desktop-only"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
              >
                + Add images
              </button>

              {/* Sort Dropdown */}
              <div className="sort-dropdown-wrap desktop-only">
                <span className="sort-label">Sort:</span>
                <select
                  value={options.sort}
                  onChange={handleSortChange}
                  className="select-sort"
                  aria-label="Sort Order"
                >
                  <option value="natural-asc">Natural order</option>
                  <option value="natural-desc">Natural descending</option>
                  <option value="name-asc">Name (A → Z)</option>
                  <option value="name-desc">Name (Z → A)</option>
                  <option value="date-newest">Date newest</option>
                  <option value="date-oldest">Date oldest</option>
                </select>
              </div>

              {/* Jump to page */}
              {sortedItems.length > 0 && (
                <form onSubmit={handleJumpPage} className="jump-page-form desktop-only">
                  <span className="jump-label">Jump to page:</span>
                  <input
                    type="text"
                    value={jumpPageInput}
                    onChange={(e) => setJumpPageInput(e.target.value)}
                    className="jump-input"
                    aria-label="Jump to page number"
                  />
                  <span className="jump-total">of {sortedItems.length}</span>
                </form>
              )}
            </div>
          </div>

          {/* Mobile Secondary Action Row */}
          <div className="mobile-action-bar mobile-only">
            <button
              type="button"
              className="btn-mobile-add"
              onClick={() => fileInputRef.current?.click()}
            >
              + Add
            </button>
            <div className="mobile-sort-wrap">
              <select
                value={options.sort}
                onChange={handleSortChange}
                className="select-mobile-sort"
                aria-label="Sort Order"
              >
                <option value="natural-asc">Sort: Natural ▼</option>
                <option value="name-asc">Sort: Name (A-Z) ▼</option>
                <option value="date-newest">Sort: Date newest ▼</option>
              </select>
            </div>
          </div>

          {/* Mobile Quick Download Banner */}
          {result && (
            <div className={`mobile-result-banner mobile-only ${result.isOutdated ? "outdated" : ""}`}>
              <div className="mobile-result-info">
                <span className="result-check">✓</span>
                <div>
                  <strong>{result.isOutdated ? "PDF outdated" : "PDF Ready!"}</strong>
                  <p>{result.filename} ({(result.sizeBytes / (1024 * 1024)).toFixed(2)} MB)</p>
                </div>
              </div>
              <button
                type="button"
                className="btn-mobile-download-action"
                onClick={handleDownload}
              >
                Download
              </button>
            </div>
          )}

          {/* Selection Action Bar (when pages selected) */}
          {selectedIds.size > 0 && (
            <div className="selection-action-bar" role="region" aria-label="Selection Actions">
              <div className="selection-count">
                <strong>{selectedIds.size}</strong> selected
              </div>
              <div className="selection-buttons">
                <button
                  type="button"
                  className="btn-action-inline"
                  onClick={handleRotateSelected}
                >
                  <RotateIcon className="btn-action-icon" />
                  <span>Rotate</span>
                </button>
                <button
                  type="button"
                  className="btn-action-inline"
                  onClick={handleRemoveSelected}
                >
                  <TrashIcon className="btn-action-icon" />
                  <span>Remove</span>
                </button>
                <button
                  type="button"
                  className="btn-action-text"
                  onClick={handleClearSelection}
                >
                  Clear selection
                </button>
              </div>
            </div>
          )}

          {/* VIEW MODE: OVERVIEW GRID */}
          {viewMode === "overview" && (
            <div className="overview-container">
              {sortedItems.length === 0 ? (
                <div
                  className="empty-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files) handleAddFiles(e.dataTransfer.files);
                  }}
                >
                  <div className="dropzone-art">
                    <PdfDocIcon className="dropzone-icon" />
                  </div>
                  <h3>No images loaded</h3>
                  <p>Drag and drop images here, or click to browse files.</p>
                  <button
                    type="button"
                    className="btn-load-samples"
                    onClick={async (e) => {
                      e.stopPropagation();
                      setIsLoadingSamples(true);
                      const sampleItems = await loadSampleSet(20);
                      setItems(sampleItems);
                      setIsLoadingSamples(false);
                    }}
                  >
                    {isLoadingSamples ? "Loading samples…" : "Load 20 Travel Photos Sample"}
                  </button>
                </div>
              ) : (
                <div className="page-grid" role="list" aria-label="Document Pages">
                  {sortedItems.map((item, idx) => {
                    const isSelected = selectedIds.has(item.id);
                    const pageNumStr = String(idx + 1).padStart(2, "0");

                    return (
                      <div
                        id={`page-card-${item.id}`}
                        key={item.id}
                        role="listitem"
                        className={`page-card ${isSelected ? "selected" : ""} ${
                          activeInspectId === item.id ? "active-inspect" : ""
                        }`}
                        onClick={() => {
                          setActiveInspectId(item.id);
                        }}
                        onDoubleClick={() => {
                          setActiveInspectId(item.id);
                          setViewMode("single");
                        }}
                      >
                        {/* Selection check circle */}
                        <button
                          type="button"
                          className={`selection-check-circle ${isSelected ? "checked" : ""}`}
                          onClick={(e) => toggleSelection(item.id, e)}
                          aria-label={`Select page ${pageNumStr}`}
                        >
                          {isSelected && <CheckIcon className="check-svg" />}
                        </button>

                        {/* Thumbnail image */}
                        <div className="card-thumb-wrap">
                          <img
                            src={item.objectUrl}
                            alt={item.name}
                            className="card-thumb-img"
                            style={{
                              transform: `rotate(${item.rotation}deg)`,
                            }}
                            loading="lazy"
                          />
                        </div>

                        {/* Card bottom metadata: 01 filename.jpg */}
                        <div className="card-meta">
                          <span className="card-page-num">{pageNumStr}</span>
                          <span className="card-filename" title={item.name}>
                            {item.name}
                          </span>
                          {item.customOptions && Object.keys(item.customOptions).length > 0 && (
                            <span
                              className="card-custom-badge"
                              title="Custom per-page settings applied"
                            >
                              {item.customOptions.orientation
                                ? item.customOptions.orientation === "Landscape"
                                  ? "Land."
                                  : "Port."
                                : item.customOptions.pageSize || "Custom"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Status bar below grid */}
              {sortedItems.length > 0 && (
                <div className="grid-footer-bar">
                  <span className="grid-status-count">
                    Showing pages 1 – {sortedItems.length} of {sortedItems.length}
                  </span>
                  <span className="grid-status-hint desktop-only">
                    Click a page to inspect
                  </span>
                </div>
              )}
            </div>
          )}

          {/* VIEW MODE: SINGLE PAGE */}
          {viewMode === "single" && activeInspectItem && (
            <div className="single-page-workspace">
              {/* Left thumbnail navigation strip */}
              <div className="single-thumb-strip">
                <span className="thumb-strip-header">Pages</span>
                <div className="thumb-strip-list">
                  {sortedItems.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`thumb-strip-item ${item.id === activeInspectItem.id ? "active" : ""}`}
                      onClick={() => setActiveInspectId(item.id)}
                    >
                      <span className="thumb-strip-num">{idx + 1}</span>
                      <img
                        src={item.objectUrl}
                        alt=""
                        className="thumb-strip-img"
                        style={{ transform: `rotate(${item.rotation}deg)` }}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Center Canvas Preview */}
              <div className="single-preview-viewport">
                <div className="single-preview-nav">
                  <button
                    type="button"
                    className="btn-nav-arrow"
                    disabled={activeInspectIndex === 0}
                    onClick={() => {
                      if (activeInspectIndex > 0) {
                        setActiveInspectId(sortedItems[activeInspectIndex - 1].id);
                      }
                    }}
                  >
                    ← Previous
                  </button>
                  <span className="preview-page-counter">
                    Page {activeInspectIndex + 1} of {sortedItems.length}
                  </span>
                  <button
                    type="button"
                    className="btn-nav-arrow"
                    disabled={activeInspectIndex === sortedItems.length - 1}
                    onClick={() => {
                      if (activeInspectIndex < sortedItems.length - 1) {
                        setActiveInspectId(sortedItems[activeInspectIndex + 1].id);
                      }
                    }}
                  >
                    Next →
                  </button>
                </div>

                {/* Simulated Paper Sheet */}
                <div
                  className="paper-sheet-preview"
                  style={{
                    transform: `scale(${singleZoom})`,
                    aspectRatio: previewAspectRatio,
                  }}
                >
                  <div
                    className="paper-printable-area"
                    style={{
                      padding: `${(activeItemOptions.marginMm ?? 12) * 1.5}px`,
                    }}
                  >
                    <img
                      src={activeInspectItem.objectUrl}
                      alt={activeInspectItem.name}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: activeItemOptions.fit === "Cover" ? "cover" : "contain",
                        transform: `rotate(${activeInspectItem.rotation}deg)`,
                      }}
                    />
                  </div>
                </div>

                {/* Zoom control */}
                <div className="single-zoom-bar">
                  <span>Zoom:</span>
                  <button type="button" onClick={() => setSingleZoom((z) => Math.max(0.6, z - 0.1))}>−</button>
                  <span>{Math.round(singleZoom * 100)}%</span>
                  <button type="button" onClick={() => setSingleZoom((z) => Math.min(1.5, z + 0.1))}>+</button>
                  <button type="button" onClick={() => setSingleZoom(1)}>Reset</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar — Document Settings (~20-25% desktop) */}
        <aside
          className={`workspace-sidebar ${mobileSettingsOpen ? "mobile-drawer-open" : ""}`}
          aria-label="Document Settings"
        >
          {/* Mobile Drawer Header */}
          <div className="sidebar-mobile-header mobile-only">
            <h3>Document settings</h3>
            <button
              type="button"
              className="btn-close-drawer"
              onClick={() => setMobileSettingsOpen(false)}
            >
              ✕
            </button>
          </div>

          <h2 className="sidebar-heading desktop-only">Document settings</h2>

          {/* Scope Toggle: [ Apply to all pages ] [ Custom per page ] */}
          <div className="scope-toggle-wrap">
            <button
              type="button"
              className={`scope-toggle-btn ${scopeMode === "all" ? "active" : ""}`}
              onClick={() => setScopeMode("all")}
            >
              Apply to all pages
            </button>
            <button
              type="button"
              className={`scope-toggle-btn ${scopeMode === "custom" ? "active" : ""}`}
              onClick={() => setScopeMode("custom")}
            >
              Custom per page
            </button>
          </div>

          {scopeMode === "custom" && (
            <div className="custom-scope-box">
              <div className="custom-scope-header">
                <span className="custom-scope-label">
                  {targetIds.length > 1
                    ? `Editing ${targetIds.length} selected pages`
                    : activeTargetItem
                    ? `Editing Page ${
                        Math.max(
                          0,
                          sortedItems.findIndex((it) => it.id === activeTargetItem.id)
                        ) + 1
                      }: ${activeTargetItem.name}`
                    : "Click a page to customize"}
                </span>
                {activeTargetItem?.customOptions &&
                  Object.keys(activeTargetItem.customOptions).length > 0 && (
                    <button
                      type="button"
                      className="btn-reset-custom"
                      onClick={() => handleResetCustomOptions(targetIds)}
                      title="Reset this page to document defaults"
                    >
                      Reset to default
                    </button>
                  )}
              </div>
              <p className="custom-scope-hint">
                Settings below apply only to this single page.
              </p>
            </div>
          )}

          {/* Setting 1: Page Orientation */}
          <div className="setting-group">
            <label className="setting-label">Page orientation</label>
            <div className="segmented-control">
              <button
                type="button"
                className={`segment-btn ${currentDisplayOptions.orientation === "Portrait" ? "active" : ""}`}
                onClick={() => handleOptionChange("orientation", "Portrait")}
              >
                Portrait
              </button>
              <button
                type="button"
                className={`segment-btn ${currentDisplayOptions.orientation === "Landscape" ? "active" : ""}`}
                onClick={() => handleOptionChange("orientation", "Landscape")}
              >
                Landscape
              </button>
            </div>
          </div>

          {/* Setting 2: Page Size */}
          <div className="setting-group">
            <label className="setting-label">Page size</label>
            <select
              className="setting-select"
              value={currentDisplayOptions.pageSize}
              onChange={(e) => handleOptionChange("pageSize", e.target.value as any)}
            >
              <option value="A4">A4 (210 × 297 mm)</option>
              <option value="Letter">Letter (8.5 × 11 in)</option>
              <option value="Original">Image size</option>
            </select>
          </div>

          {/* Setting 3: Margins */}
          <div className="setting-group">
            <label className="setting-label">Margins</label>
            <div className="segmented-control">
              <button
                type="button"
                className={`segment-btn ${currentDisplayOptions.marginPreset === "None" ? "active" : ""}`}
                onClick={() => handleOptionChange("marginPreset", "None", { marginMm: 0 })}
              >
                None
              </button>
              <button
                type="button"
                className={`segment-btn ${currentDisplayOptions.marginPreset === "Small" ? "active" : ""}`}
                onClick={() => handleOptionChange("marginPreset", "Small", { marginMm: 12 })}
              >
                Small
              </button>
              <button
                type="button"
                className={`segment-btn ${currentDisplayOptions.marginPreset === "Custom" ? "active" : ""}`}
                onClick={() => handleOptionChange("marginPreset", "Custom")}
              >
                Custom
              </button>
            </div>

            {currentDisplayOptions.marginPreset !== "None" && (
              <div className="margin-size-row">
                <span className="margin-size-label">Margin size</span>
                <div className="margin-input-wrap">
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={currentDisplayOptions.marginMm}
                    onChange={(e) => {
                      const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                      handleOptionChange("marginMm", val);
                    }}
                    className="margin-input"
                  />
                  <span className="margin-unit">mm</span>
                </div>
              </div>
            )}
          </div>

          {/* Setting 4: Fit image to page */}
          <div className="setting-group">
            <label className="setting-label">Fit image to page</label>
            <select
              className="setting-select"
              value={currentDisplayOptions.fit}
              onChange={(e) => handleOptionChange("fit", e.target.value as any)}
            >
              <option value="Contain">Contain</option>
              <option value="Cover">Cover</option>
            </select>
          </div>

          {/* Setting 5: Image Quality */}
          <div className="setting-group">
            <label className="setting-label">Image quality</label>
            <select
              className="setting-select"
              value={options.profile}
              onChange={(e) => {
                setOptions((prev) => ({ ...prev, profile: e.target.value as any }));
                markOutdated();
              }}
            >
              <option value="Screen/Mobile">Screen / mobile (good quality)</option>
              <option value="Print">Print (high quality)</option>
              <option value="Original">Original (uncompressed)</option>
            </select>
          </div>

          {/* Setting 6: Filename */}
          <div className="setting-group">
            <label className="setting-label">Filename</label>
            <input
              type="text"
              className="setting-input"
              value={options.filename}
              onChange={(e) => {
                setOptions((prev) => ({ ...prev, filename: e.target.value }));
                markOutdated();
              }}
            />
          </div>

          {/* Primary CTA: Create PDF Button */}
          <div className="sidebar-cta-group">
            <button
              type="button"
              className="btn-create-pdf"
              onClick={handleGeneratePdf}
              disabled={isProcessing || sortedItems.length === 0}
            >
              <PdfDocIcon className="btn-pdf-icon" />
              <span>
                {isProcessing
                  ? "Creating PDF…"
                  : result && result.isOutdated
                  ? "Create updated PDF"
                  : "Create PDF"}
              </span>
            </button>
            <p className="sidebar-cta-caption">
              You can keep editing after export.
            </p>
          </div>

          {/* Generation Progress Indicator */}
          {isProcessing && progress && (
            <div className="sidebar-progress-box">
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <span className="progress-status-text">
                {progress.currentFilename} ({progress.percent}%)
              </span>
            </div>
          )}

          {/* Post-Export Result Card */}
          {result && (
            <div className={`export-result-card ${result.isOutdated ? "outdated" : ""}`}>
              <div className="result-header">
                <span className="result-check">✓</span>
                <strong>{result.isOutdated ? "PDF outdated" : "PDF Ready!"}</strong>
              </div>
              <p className="result-meta">
                {result.filename} · {(result.sizeBytes / (1024 * 1024)).toFixed(2)} MB
              </p>
              <button
                type="button"
                className="btn-download-result"
                onClick={handleDownload}
              >
                Download PDF
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* Mobile Sticky Bottom Action Bar */}
      <div className="mobile-bottom-bar mobile-only">
        <div className="mobile-bottom-actions-row">
          <button
            type="button"
            className="btn-bottom-sub"
            onClick={handleSelectAll}
          >
            <span className="btn-sub-icon">≡</span>
            <span>{selectedIds.size > 0 ? "Clear selection" : "Select pages"}</span>
          </button>
          <button
            type="button"
            className="btn-bottom-sub"
            onClick={() => setMobileSettingsOpen(true)}
          >
            <SettingsIcon className="btn-sub-icon" />
            <span>Settings</span>
          </button>
        </div>

        <button
          type="button"
          className="btn-mobile-create-pdf"
          onClick={handleGeneratePdf}
          disabled={isProcessing || sortedItems.length === 0}
        >
          <PdfDocIcon className="btn-pdf-icon" />
          <span>
            {isProcessing ? "Creating…" : result && result.isOutdated ? "Create updated PDF" : "Create PDF"}
          </span>
        </button>
      </div>
    </div>
  );
}
