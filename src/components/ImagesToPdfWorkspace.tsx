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
import { router, useRouter } from "../lib/router";
import {
  documentSessionStore,
  useDocumentSession,
} from "../lib/documentSessionStore";
import { ThumbnailSheet } from "./ThumbnailSheet";
import {
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

export function ImagesToPdfWorkspace({ onBackToHome }: ImagesToPdfWorkspaceProps) {
  const TOOL_ID = "images-to-pdf";
  const session = useDocumentSession(TOOL_ID);
  const route = useRouter();

  const items = session.items;
  const selectedIds = useMemo(
    () => new Set(session.selectedIds),
    [session.selectedIds]
  );
  const activeInspectId = session.activeInspectId;
  const viewMode = session.viewMode;
  const options = session.options;
  const isProcessing = session.jobStatus === "processing";
  const progress = session.progress;
  const result = session.result;

  const [scopeMode, setScopeMode] = useState<"all" | "custom">("all");
  const [errorMessage, setErrorMessage] = useState<string>(session.errorMessage);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState<boolean>(false);
  const [isLoadingSamples, setIsLoadingSamples] = useState<boolean>(false);
  const [singleZoom, setSingleZoom] = useState<number>(1);
  const [fitMode, setFitMode] = useState<"page" | "width" | "custom">("page");
  const [jumpPageInput, setJumpPageInput] = useState<string>("1");
  const [undoStack, setUndoStack] = useState<ImageItem[] | null>(null);
  const [undoMessage, setUndoMessage] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sorted items based on active sort options
  const sortedItems = useMemo(() => {
    return sortImageItems(items, options.sort, options.manualOrder);
  }, [items, options.sort, options.manualOrder]);

  // Active inspect item for single page mode
  const activeInspectItem = useMemo(() => {
    if (!sortedItems.length) return null;
    return (
      sortedItems.find((it) => it.id === activeInspectId) || sortedItems[0]
    );
  }, [sortedItems, activeInspectId]);

  const activeInspectIndex = useMemo(() => {
    if (!activeInspectItem) return 0;
    return Math.max(
      0,
      sortedItems.findIndex((it) => it.id === activeInspectItem.id)
    );
  }, [sortedItems, activeInspectItem]);

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
    if (selectedIds.size > 0) {
      return Array.from(selectedIds);
    }
    return activeTargetItem ? [activeTargetItem.id] : [];
  }, [selectedIds, activeTargetItem]);

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

  // Effective options for the currently active item
  const activeItemOptions = useMemo((): PdfOptions => {
    if (!activeInspectItem) return options;
    return {
      ...options,
      ...(activeInspectItem.customOptions || {}),
    };
  }, [activeInspectItem, options]);

  // Handle option changes
  const handleOptionChange = <K extends keyof PerPageOptions>(
    key: K,
    value: PerPageOptions[K],
    extraUpdates?: Partial<PerPageOptions>
  ) => {
    if (scopeMode === "custom") {
      if (targetIds.length === 0) return;
      const updated = items.map((it) => {
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
      });
      documentSessionStore.setItems(TOOL_ID, updated);
    } else {
      documentSessionStore.setOptions(TOOL_ID, {
        [key]: value,
        ...(extraUpdates || {}),
      });
    }
  };

  // Reset custom per-page options
  const handleResetCustomOptions = (idsToReset: string[]) => {
    const updated = items.map((it) => {
      if (idsToReset.includes(it.id)) {
        const itemCopy = { ...it };
        delete itemCopy.customOptions;
        return itemCopy;
      }
      return it;
    });
    documentSessionStore.setItems(TOOL_ID, updated);
  };

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
      documentSessionStore.setItems(TOOL_ID, [...items, ...newItems]);
      if (!activeInspectId && newItems[0]) {
        documentSessionStore.setActiveInspectId(TOOL_ID, newItems[0].id);
      }
    }
  };

  // Load sample photos
  const handleLoadSamples = async () => {
    setIsLoadingSamples(true);
    setErrorMessage("");
    try {
      const sampleItems = await loadSampleSet();
      documentSessionStore.setItems(TOOL_ID, [...items, ...sampleItems]);
      if (!activeInspectId && sampleItems[0]) {
        documentSessionStore.setActiveInspectId(TOOL_ID, sampleItems[0].id);
      }
    } catch (err) {
      setErrorMessage("Could not load sample photos.");
    } finally {
      setIsLoadingSamples(false);
    }
  };

  // Selection toggle
  const toggleSelection = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    documentSessionStore.toggleSelectId(TOOL_ID, id);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      documentSessionStore.clearSelection(TOOL_ID);
    } else {
      documentSessionStore.selectAll(TOOL_ID);
    }
  };

  const handleClearSelection = () => {
    documentSessionStore.clearSelection(TOOL_ID);
  };

  // Rotate selected
  const handleRotateSelected = () => {
    if (!selectedIds.size) return;
    documentSessionStore.rotateSelected(TOOL_ID, 90);
  };

  // Rotate single item
  const handleRotateSingle = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    documentSessionStore.rotateItem(TOOL_ID, id, 90);
  };

  // Move selected earlier / later (essential for touch/mobile)
  const handleMoveSelectedEarlier = () => {
    if (!selectedIds.size) return;
    const currentOrder = [...sortedItems];
    for (let i = 1; i < currentOrder.length; i++) {
      if (selectedIds.has(currentOrder[i].id) && !selectedIds.has(currentOrder[i - 1].id)) {
        const temp = currentOrder[i - 1];
        currentOrder[i - 1] = currentOrder[i];
        currentOrder[i] = temp;
      }
    }
    documentSessionStore.setItems(TOOL_ID, currentOrder);
    documentSessionStore.setOptions(TOOL_ID, {
      sort: "manual",
      manualOrder: currentOrder.map((it) => it.id),
    });
  };

  const handleMoveSelectedLater = () => {
    if (!selectedIds.size) return;
    const currentOrder = [...sortedItems];
    for (let i = currentOrder.length - 2; i >= 0; i--) {
      if (selectedIds.has(currentOrder[i].id) && !selectedIds.has(currentOrder[i + 1].id)) {
        const temp = currentOrder[i + 1];
        currentOrder[i + 1] = currentOrder[i];
        currentOrder[i] = temp;
      }
    }
    documentSessionStore.setItems(TOOL_ID, currentOrder);
    documentSessionStore.setOptions(TOOL_ID, {
      sort: "manual",
      manualOrder: currentOrder.map((it) => it.id),
    });
  };

  // Batch remove with Undo
  const handleRemoveSelected = () => {
    if (!selectedIds.size) return;
    const toRemove = items.filter((it) => selectedIds.has(it.id));
    setUndoStack(toRemove);
    setUndoMessage(`${toRemove.length} page${toRemove.length === 1 ? "" : "s"} removed.`);
    documentSessionStore.removeSelected(TOOL_ID);
  };

  // Undo removal
  const handleUndo = () => {
    if (undoStack && undoStack.length > 0) {
      documentSessionStore.setItems(TOOL_ID, [...items, ...undoStack]);
      setUndoStack(null);
      setUndoMessage("");
    }
  };

  // Handle Sort
  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as SortMode;
    documentSessionStore.setOptions(TOOL_ID, { sort: val });
  };

  // Jump to page
  const handleJumpPage = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(jumpPageInput, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= sortedItems.length) {
      const target = sortedItems[pageNum - 1];
      if (target) {
        documentSessionStore.setActiveInspectId(TOOL_ID, target.id);
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
    router.navigate({ toolId: TOOL_ID, stage: "processing" });

    const res = await documentSessionStore.startGeneration(TOOL_ID);
    if (res) {
      router.navigate({ toolId: TOOL_ID, stage: "result", replace: true });
      setMobileSettingsOpen(false);
    }
  };

  // Cancel Generation
  const handleCancelGeneration = () => {
    documentSessionStore.cancelGeneration(TOOL_ID);
    router.navigate({ toolId: TOOL_ID, stage: "editor", replace: true });
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

  // Preview Aspect Ratio calculation for Single Page Viewer
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
        {/* Main Content Area */}
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
                  onClick={() => documentSessionStore.setViewMode(TOOL_ID, "overview")}
                >
                  Overview
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "single"}
                  className={`btn-toggle-tab ${viewMode === "single" ? "active" : ""}`}
                  onClick={() => documentSessionStore.setViewMode(TOOL_ID, "single")}
                  disabled={sortedItems.length === 0}
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
                  <option value="date-newest">Newest first</option>
                  <option value="date-oldest">Oldest first</option>
                  <option value="manual">Manual arrangement</option>
                </select>
              </div>

              {/* Jump to page */}
              {sortedItems.length > 5 && (
                <form onSubmit={handleJumpPage} className="jump-page-form desktop-only">
                  <span>Jump to:</span>
                  <input
                    type="number"
                    min={1}
                    max={sortedItems.length}
                    value={jumpPageInput}
                    onChange={(e) => setJumpPageInput(e.target.value)}
                    className="jump-input"
                    aria-label="Jump to page number"
                  />
                  <span>of {sortedItems.length}</span>
                </form>
              )}
            </div>
          </div>

          {/* Mobile Quick Action Bar (Add & Sort) */}
          <div className="mobile-action-bar mobile-only">
            <button
              type="button"
              className="btn-mobile-add"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
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
                <option value="natural-asc">Sort: Natural</option>
                <option value="natural-desc">Sort: Natural desc</option>
                <option value="name-asc">Sort: Name (A-Z)</option>
                <option value="name-desc">Sort: Name (Z-A)</option>
                <option value="date-newest">Sort: Newest</option>
                <option value="date-oldest">Sort: Oldest</option>
                <option value="manual">Sort: Manual</option>
              </select>
            </div>
          </div>

          {/* Error Message Alert */}
          {errorMessage && (
            <div className="workspace-error-banner" role="alert">
              <span>{errorMessage}</span>
              <button
                type="button"
                className="btn-dismiss-error"
                onClick={() => setErrorMessage("")}
              >
                ✕
              </button>
            </div>
          )}

          {/* Undo Toast */}
          {undoStack && (
            <div className="undo-toast-banner" role="status">
              <span>{undoMessage}</span>
              <button type="button" className="btn-undo-action" onClick={handleUndo}>
                Undo
              </button>
            </div>
          )}

          {/* Batch Selection Action Bar */}
          {selectedIds.size > 0 && viewMode === "overview" && (
            <div className="selection-action-bar" role="region" aria-label="Selected pages actions">
              <span className="selection-count">
                <strong>{selectedIds.size}</strong> of {sortedItems.length} selected
              </span>
              <div className="selection-buttons">
                <button
                  type="button"
                  className="btn-action-inline"
                  onClick={handleRotateSelected}
                  title="Rotate selected 90°"
                >
                  <RotateIcon className="btn-action-icon" />
                  <span>Rotate</span>
                </button>
                <button
                  type="button"
                  className="btn-action-inline"
                  onClick={handleMoveSelectedEarlier}
                  title="Move selected earlier in document order"
                >
                  <span>← Earlier</span>
                </button>
                <button
                  type="button"
                  className="btn-action-inline"
                  onClick={handleMoveSelectedLater}
                  title="Move selected later in document order"
                >
                  <span>Later →</span>
                </button>
                <button
                  type="button"
                  className="btn-action-inline btn-danger"
                  onClick={handleRemoveSelected}
                  title="Remove selected pages"
                >
                  <TrashIcon className="btn-action-icon" />
                  <span>Remove</span>
                </button>
                <button
                  type="button"
                  className="btn-action-text"
                  onClick={handleSelectAll}
                >
                  {selectedIds.size === sortedItems.length ? "Deselect all" : "Select all"}
                </button>
              </div>
            </div>
          )}

          {/* VIEW MODE: OVERVIEW GRID */}
          {viewMode === "overview" && (
            <div className="overview-container">
              {sortedItems.length === 0 ? (
                <div className="empty-dropzone">
                  <div className="dropzone-illustration">
                    <PdfDocIcon className="empty-icon-svg" />
                  </div>
                  <h3>No images added yet</h3>
                  <p className="empty-hint">
                    Add JPG, PNG, or WebP images to convert them into a professional PDF.
                  </p>
                  <button
                    type="button"
                    className="btn-primary-action"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Select Images from Device
                  </button>
                  <div className="empty-divider">or</div>
                  <button
                    type="button"
                    className="btn-sample-load"
                    onClick={handleLoadSamples}
                    disabled={isLoadingSamples}
                  >
                    {isLoadingSamples ? "Loading samples…" : "Load 20 Travel Photos Sample"}
                  </button>
                </div>
              ) : (
                <div className="page-grid" role="list" aria-label="Document Pages">
                  {sortedItems.map((item, idx) => (
                    <ThumbnailSheet
                      key={item.id}
                      item={item}
                      pageIndex={idx}
                      options={options}
                      isSelected={selectedIds.has(item.id)}
                      isActiveInspect={activeInspectId === item.id}
                      onToggleSelect={(id, e) => toggleSelection(id, e)}
                      onInspect={(id) => {
                        documentSessionStore.setActiveInspectId(TOOL_ID, id);
                      }}
                      onRotate={(id, e) => handleRotateSingle(id, e)}
                    />
                  ))}
                </div>
              )}

              {/* Status bar below grid */}
              {sortedItems.length > 0 && (
                <div className="grid-footer-bar">
                  <span className="grid-status-count">
                    Showing pages 1 – {sortedItems.length} of {sortedItems.length}
                  </span>
                  <span className="grid-status-hint desktop-only">
                    Click a page to inspect or double-click for full page view
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
                      className={`thumb-strip-item ${
                        item.id === activeInspectItem.id ? "active" : ""
                      }`}
                      onClick={() =>
                        documentSessionStore.setActiveInspectId(TOOL_ID, item.id)
                      }
                      title={`Page ${idx + 1}: ${item.name}`}
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
                        documentSessionStore.setActiveInspectId(
                          TOOL_ID,
                          sortedItems[activeInspectIndex - 1].id
                        );
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
                        documentSessionStore.setActiveInspectId(
                          TOOL_ID,
                          sortedItems[activeInspectIndex + 1].id
                        );
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
                        objectFit:
                          activeItemOptions.fit === "Cover" ? "cover" : "contain",
                        transform: `rotate(${activeInspectItem.rotation}deg)`,
                      }}
                    />
                  </div>
                </div>

                {/* Zoom Controls */}
                <div className="single-zoom-bar">
                  <span>Zoom:</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSingleZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))
                    }
                    title="Zoom out"
                  >
                    −
                  </button>
                  <span className="zoom-value-label">
                    {Math.round(singleZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSingleZoom((z) => Math.min(2.5, Number((z + 0.15).toFixed(2))))
                    }
                    title="Zoom in"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSingleZoom(1);
                      setFitMode("page");
                    }}
                    title="Reset to 100%"
                  >
                    Fit Page
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Settings Sidebar (Desktop & Mobile Drawer) */}
        <aside
          className={`workspace-sidebar ${
            mobileSettingsOpen ? "mobile-drawer-open" : ""
          }`}
          aria-label="Document settings"
        >
          {/* Mobile Drawer Header */}
          <div className="sidebar-mobile-header mobile-only">
            <h3>Document settings</h3>
            <button
              type="button"
              className="btn-close-drawer"
              onClick={() => setMobileSettingsOpen(false)}
              aria-label="Close settings"
            >
              ✕
            </button>
          </div>

          <div className="sidebar-title-row desktop-only">
            <h2>Document settings</h2>
          </div>

          {/* Scope Selector: Apply to all pages vs Custom per page */}
          <div className="setting-scope-toggle" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={scopeMode === "all"}
              className={`btn-scope-tab ${scopeMode === "all" ? "active" : ""}`}
              onClick={() => setScopeMode("all")}
            >
              Apply to all pages
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scopeMode === "custom"}
              className={`btn-scope-tab ${scopeMode === "custom" ? "active" : ""}`}
              onClick={() => setScopeMode("custom")}
              disabled={sortedItems.length === 0}
            >
              Custom per page
            </button>
          </div>

          {/* Scope notice banner */}
          {scopeMode === "custom" && activeTargetItem && (
            <div className="scope-notice-banner">
              <span className="scope-notice-label">
                Editing: Page {activeInspectIndex + 1} ({activeTargetItem.name})
              </span>
              {activeTargetItem.customOptions && (
                <button
                  type="button"
                  className="btn-reset-scope"
                  onClick={() => handleResetCustomOptions([activeTargetItem.id])}
                >
                  Reset to default
                </button>
              )}
            </div>
          )}

          {/* Setting: Page orientation */}
          <div className="setting-group">
            <label className="setting-label">Page orientation</label>
            <div className="segmented-control">
              <button
                type="button"
                className={`segment-btn ${
                  currentDisplayOptions.orientation === "Portrait" ? "active" : ""
                }`}
                onClick={() => handleOptionChange("orientation", "Portrait")}
              >
                Portrait
              </button>
              <button
                type="button"
                className={`segment-btn ${
                  currentDisplayOptions.orientation === "Landscape" ? "active" : ""
                }`}
                onClick={() => handleOptionChange("orientation", "Landscape")}
              >
                Landscape
              </button>
              <button
                type="button"
                className={`segment-btn ${
                  currentDisplayOptions.orientation === "Auto" ? "active" : ""
                }`}
                onClick={() => handleOptionChange("orientation", "Auto")}
              >
                Auto
              </button>
            </div>
          </div>

          {/* Setting: Page size */}
          <div className="setting-group">
            <label className="setting-label">Page size</label>
            <select
              className="setting-select"
              value={currentDisplayOptions.pageSize}
              onChange={(e) =>
                handleOptionChange(
                  "pageSize",
                  e.target.value as PdfOptions["pageSize"]
                )
              }
            >
              <option value="A4">A4 (210 × 297 mm)</option>
              <option value="Letter">US Letter (8.5 × 11 in)</option>
              <option value="Original">Original image dimensions</option>
            </select>
          </div>

          {/* Setting: Margins */}
          <div className="setting-group">
            <label className="setting-label">Margins</label>
            <div className="segmented-control">
              <button
                type="button"
                className={`segment-btn ${
                  currentDisplayOptions.marginPreset === "None" ? "active" : ""
                }`}
                onClick={() =>
                  handleOptionChange("marginPreset", "None", { marginMm: 0 })
                }
              >
                None
              </button>
              <button
                type="button"
                className={`segment-btn ${
                  currentDisplayOptions.marginPreset === "Small" ? "active" : ""
                }`}
                onClick={() =>
                  handleOptionChange("marginPreset", "Small", { marginMm: 12 })
                }
              >
                Small
              </button>
              <button
                type="button"
                className={`segment-btn ${
                  currentDisplayOptions.marginPreset === "Custom" ? "active" : ""
                }`}
                onClick={() => handleOptionChange("marginPreset", "Custom")}
              >
                Custom
              </button>
            </div>
          </div>

          {/* Setting: Fit image to page */}
          <div className="setting-group">
            <label className="setting-label">Fit image to page</label>
            <select
              className="setting-select"
              value={currentDisplayOptions.fit}
              onChange={(e) =>
                handleOptionChange(
                  "fit",
                  e.target.value as PdfOptions["fit"]
                )
              }
            >
              <option value="Contain">Contain (show entire image with border)</option>
              <option value="Cover">Cover (fill page edge-to-edge)</option>
              <option value="Original">Original 1:1 scale</option>
            </select>
          </div>

          {/* Setting: Image quality */}
          <div className="setting-group">
            <label className="setting-label">Image quality</label>
            <select
              className="setting-select"
              value={options.profile}
              onChange={(e) =>
                documentSessionStore.setOptions(TOOL_ID, {
                  profile: e.target.value as PdfOptions["profile"],
                })
              }
            >
              <option value="Screen/Mobile">Screen / Mobile (good quality, smaller size)</option>
              <option value="Print">Print (high resolution, 300 DPI)</option>
              <option value="Original">Original uncompressed bytes</option>
            </select>
          </div>

          {/* Setting: Filename */}
          <div className="setting-group">
            <label className="setting-label">Filename</label>
            <input
              type="text"
              className="setting-input"
              value={options.filename}
              onChange={(e) => {
                documentSessionStore.setOptions(TOOL_ID, { filename: e.target.value });
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
              <button
                type="button"
                className="btn-cancel-processing"
                onClick={handleCancelGeneration}
              >
                Cancel
              </button>
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

      {/* Mobile Sticky Bottom Action Bar (Sleek single-row layout with min 44x44px touch targets) */}
      <div className="mobile-bottom-bar mobile-only">
        <button
          type="button"
          className="btn-bottom-sub"
          onClick={() => setMobileSettingsOpen(true)}
          aria-label="Open document settings"
          title="Document settings"
        >
          <SettingsIcon className="btn-sub-icon" />
        </button>

        <button
          type="button"
          className="btn-mobile-create-pdf"
          onClick={result && !result.isOutdated ? handleDownload : handleGeneratePdf}
          disabled={isProcessing || sortedItems.length === 0}
        >
          <PdfDocIcon className="btn-pdf-icon" />
          <span>
            {isProcessing
              ? "Creating…"
              : result && !result.isOutdated
              ? "Download PDF"
              : result && result.isOutdated
              ? "Create updated PDF"
              : "Create PDF"}
          </span>
        </button>
      </div>
    </div>
  );
}
