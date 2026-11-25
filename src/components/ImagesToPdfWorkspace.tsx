import { UploadZone } from "./UploadZone";
import { ExportResult, ProcessingPanel, formatBytes } from "./ExportFlow";
import { useDialogFocus } from "../lib/useDialogFocus";
import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  ConversionResult,
  CropRect,
  GenerationProgress,
  ImageItem,
  MarginPresetOption,
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
import { PreviewCanvas } from "./PreviewCanvas";
import { ImageEditorModal } from "./ImageEditorModal";
import {
  EditIcon,
  RotateIcon,
  TrashIcon,
  CheckIcon,
  PdfDocIcon,
  SettingsIcon,
  PlusIcon,
  CopyIcon,
  ResetIcon,
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

  // Scope: "all" (All pages — shared defaults) vs "this-page" (This page — settings for active image only)
  const [scopeMode, setScopeMode] = useState<"all" | "this-page">("all");
  const [errorMessage, setErrorMessage] = useState<string>(session.errorMessage);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState<boolean>(false);
  const [isLoadingSamples, setIsLoadingSamples] = useState<boolean>(false);
  const [singleZoom, setSingleZoom] = useState<number>(1);
  const [jumpPageInput, setJumpPageInput] = useState<string>("1");
  const [lastRemoval, setLastRemoval] = useState<{
    pages: ImageItem[];
    order: string[];
    selected: string[];
  } | null>(null);

  // Editor Modal State
  const [editQueue, setEditQueue] = useState<{ ids: string[]; index: number } | null>(null);
  const editingItemId = editQueue?.ids[editQueue.index];

  // Apply to all pages confirmation modal
  const [showApplyAllModal, setShowApplyAllModal] = useState<boolean>(false);

  const settingsPanel = useDialogFocus<HTMLElement>(mobileSettingsOpen && !showApplyAllModal, () => setMobileSettingsOpen(false));
  const confirmPanel = useDialogFocus<HTMLDivElement>(showApplyAllModal, () => setShowApplyAllModal(false));
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 768px)");
    const closeOnDesktop = () => { if (!mobile.matches) setMobileSettingsOpen(false); };
    mobile.addEventListener("change", closeOnDesktop);
    return () => mobile.removeEventListener("change", closeOnDesktop);
  }, []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sorted items based on active sort options
  const sortedItems = useMemo(() => {
    return sortImageItems(items, options.sort, options.manualOrder);
  }, [items, options.sort, options.manualOrder]);

  // Active inspect item for single page mode & "This page" settings
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

  // Item currently being edited in ImageEditorModal
  const editingItem = useMemo(() => {
    if (!editingItemId) return null;
    return items.find((it) => it.id === editingItemId) || null;
  }, [items, editingItemId]);

  const editingIndex = useMemo(() => {
    if (!editingItem) return 0;
    return Math.max(
      0,
      sortedItems.findIndex((it) => it.id === editingItem.id)
    );
  }, [sortedItems, editingItem]);

  // Effective options for the active inspect item (inherited + explicit overrides)
  const activeItemOptions = useMemo((): PdfOptions => {
    if (!activeInspectItem) return options;
    return {
      ...options,
      ...(activeInspectItem.customOptions || {}),
    };
  }, [activeInspectItem, options]);

  // Effective options displayed in settings controls depending on scopeMode
  const currentDisplayOptions: PdfOptions = useMemo(() => {
    if (scopeMode === "this-page" && activeInspectItem) {
      return activeItemOptions;
    }
    return options;
  }, [scopeMode, activeInspectItem, activeItemOptions, options]);

  // Handle option changes in shared defaults ("all") vs this page ("this-page")
  const handleOptionChange = <K extends keyof PerPageOptions>(
    key: K,
    value: PerPageOptions[K],
    extraUpdates?: Partial<PerPageOptions>
  ) => {
    if (scopeMode === "this-page") {
      if (!activeInspectItem) return;
      documentSessionStore.updateItemCustomOption(
        TOOL_ID,
        activeInspectItem.id,
        key,
        value,
        extraUpdates
      );
    } else {
      documentSessionStore.setOptions(TOOL_ID, {
        [key]: value,
        ...(extraUpdates || {}),
      });
    }
  };

  // Reset a specific property on this page back to document default
  const handleResetProperty = (property: keyof PerPageOptions) => {
    if (!activeInspectItem) return;
    documentSessionStore.resetItemCustomOptionProperty(
      TOOL_ID,
      activeInspectItem.id,
      property
    );
  };

  // Reset all page settings for this page back to document defaults
  const handleResetPageSettings = () => {
    if (!activeInspectItem) return;
    documentSessionStore.resetItemCustomOptions(TOOL_ID, activeInspectItem.id);
  };

  // Apply this page's effective settings to all pages (with confirmation)
  const handleConfirmApplyToAll = () => {
    if (!activeInspectItem) return;
    documentSessionStore.applyItemSettingsToAll(TOOL_ID, activeInspectItem.id);
    setShowApplyAllModal(false);
  };

  function appendImages(incoming: ImageItem[]) {
    const current = documentSessionStore.getToolState(TOOL_ID).items;
    const combined = [...current, ...incoming];
    if (combined.length > MAX_FILES_LIMIT || combined.reduce((sum, item) => sum + item.size, 0) > MAX_TOTAL_BYTES_LIMIT) {
      incoming.forEach(item => URL.revokeObjectURL(item.objectUrl));
      setErrorMessage("This selection exceeds the document's image count or size limit.");
      return;
    }
    documentSessionStore.setItems(TOOL_ID, combined);
  }

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
      setErrorMessage(
        `Total batch size exceeds ${(MAX_TOTAL_BYTES_LIMIT / (1024 * 1024)).toFixed(0)} MB limit.`
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

    if (newItems.length) appendImages(newItems);
  };

  // Load sample photos
  const handleLoadSamples = async () => {
    setIsLoadingSamples(true);
    setErrorMessage("");
    try {
      const sampleItems = await loadSampleSet();
      appendImages(sampleItems);
    } catch (err) {
      setErrorMessage("Could not load sample photos.");
    } finally {
      setIsLoadingSamples(false);
    }
  };

  // Selection toggle
  const toggleSelection = (id: string) => {
    documentSessionStore.toggleSelectId(TOOL_ID, id);
    if (!selectedIds.has(id)) documentSessionStore.setActiveInspectId(TOOL_ID, id);
    else if (id === activeInspectId) {
      const remaining = sortedItems.find(item => item.id !== id && selectedIds.has(item.id));
      if (remaining) documentSessionStore.setActiveInspectId(TOOL_ID, remaining.id);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      documentSessionStore.clearSelection(TOOL_ID);
    } else {
      documentSessionStore.selectAll(TOOL_ID);
    }
  };

  // Rotate selected
  const handleRotateSelected = () => {
    if (!selectedIds.size) return;
    documentSessionStore.rotateSelected(TOOL_ID, 90);
  };

  const handleDuplicate = (id?: string) => {
    try {
      const added = id
        ? documentSessionStore.duplicateItem(TOOL_ID, id)
        : documentSessionStore.duplicateSelected(TOOL_ID);
      setErrorMessage(added.length ? "" : "These copies would exceed the document’s image count or size limit.");
    } catch {
      setErrorMessage("Couldn’t create a copy. Try duplicating fewer images at once.");
    }
  };

  const editPage = (id: string) => setEditQueue({ ids: [id], index: 0 });
  const editSelected = () => {
    const ids = sortedItems.filter(item => selectedIds.has(item.id)).map(item => item.id);
    if (ids.length) setEditQueue({ ids, index: 0 });
  };

  // Move selected earlier / later
  const canMoveSelected = (direction: -1 | 1) => sortedItems.some((item, index) => {
    const neighbor = sortedItems[index + direction];
    return neighbor && selectedIds.has(item.id) && !selectedIds.has(neighbor.id);
  });

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

  const deletePages = (page?: ImageItem) => {
    const pages = page ? [page] : items.filter(item => selectedIds.has(item.id));
    if (!pages.length) return;
    setLastRemoval({
      pages,
      order: items.map(item => item.id),
      selected: pages.filter(item => selectedIds.has(item.id)).map(item => item.id),
    });
    if (page) documentSessionStore.removeItem(TOOL_ID, page.id);
    else documentSessionStore.removeSelected(TOOL_ID);
  };

  // Undo removal
  const handleUndo = () => {
    if (!lastRemoval) return;
    const restored = [...items];
    for (const item of lastRemoval.pages) {
      restored.splice(lastRemoval.order.indexOf(item.id), 0, { ...item, objectUrl: URL.createObjectURL(item.file) });
    }
    documentSessionStore.setItems(TOOL_ID, restored);
    documentSessionStore.setSelectedIds(TOOL_ID, [...selectedIds, ...lastRemoval.selected]);
    setLastRemoval(null);
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
    if (router.getRoute().toolId !== TOOL_ID || router.getRoute().stage !== "processing") return;
    if (!res) {
      setErrorMessage(documentSessionStore.getToolState(TOOL_ID).errorMessage);
      router.navigate({ toolId: TOOL_ID, stage: "editor", replace: true });
      return;
    }
    router.navigate({ toolId: TOOL_ID, stage: "result", replace: true });
    setMobileSettingsOpen(false);
  };

  // Cancel Generation
  const handleCancelGeneration = () => {
    documentSessionStore.cancelGeneration(TOOL_ID);
    router.navigate({ toolId: TOOL_ID, stage: "editor", replace: true });
  };

  // Download PDF
  const handleDownload = () => {
    if (!result || session.isOutdated) return;
    const a = document.createElement("a");
    a.href = result.url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Check if active item has explicit overrides for individual properties
  const hasCustomOrientation =
    scopeMode === "this-page" &&
    activeInspectItem?.customOptions?.orientation !== undefined;
  const hasCustomPageSize =
    scopeMode === "this-page" &&
    activeInspectItem?.customOptions?.pageSize !== undefined;
  const hasCustomMargins =
    scopeMode === "this-page" &&
    activeInspectItem?.customOptions?.marginPreset !== undefined;
  const hasCustomFit =
    scopeMode === "this-page" &&
    activeInspectItem?.customOptions?.fit !== undefined;
  const hasCustomProfile =
    scopeMode === "this-page" &&
    activeInspectItem?.customOptions?.profile !== undefined;

  const hasAnyPageOverrides =
    activeInspectItem?.customOptions &&
    Object.keys(activeInspectItem.customOptions).length > 0;

  if (isProcessing && route.stage === "processing") return <ProcessingPanel title="Creating your PDF" detail={progress?.currentFilename} percent={progress?.percent} onCancel={handleCancelGeneration} />;
  if (route.stage === "result" && result && !session.isOutdated) return <ExportResult
    title="Your PDF is ready" output={{ blob: result.blob, name: result.filename, pages: result.pageCount }}
    onEdit={() => router.navigate({ toolId: TOOL_ID, stage: "editor", replace: true })} />;

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

      {items.length === 0 ? <>
        <div className="tool-workspace-header"><div><h1 className="document-title">Images to PDF</h1><p className="tool-header-subtitle">Arrange images into pages and choose how they fit.</p></div></div>
        {errorMessage && <p className="error-banner" role="alert">{errorMessage}</p>}
        <UploadZone tool="images-to-pdf" title="Convert images to a PDF" action="Add images" formats="JPEG · PNG · WebP"
          onChoose={() => fileInputRef.current?.click()} onFiles={handleAddFiles}>
          <button className="sample-action" onClick={handleLoadSamples} disabled={isLoadingSamples}>{isLoadingSamples ? "Loading sample…" : "Try the sample photos"}</button>
        </UploadZone>
        {lastRemoval && <button className="return-action" onClick={handleUndo}>Undo removal</button>}
      </> : <>
      {/* Main Workspace Layout */}
      <div className="workspace-layout">
        {/* Main Content Area */}
        <div className="workspace-main-col" onDragOver={event => event.preventDefault()} onDrop={event => {
          event.preventDefault();
          if (event.dataTransfer.files.length && !isProcessing) handleAddFiles(event.dataTransfer.files);
        }}>
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
              <h1 className="document-title">Images to PDF</h1>
              <span className="document-page-badge">
                {sortedItems.length} {sortedItems.length === 1 ? "page" : "pages"}
              </span>
              {viewMode === "overview" && (
                <button type="button" className="btn-action-text selection-all" onClick={handleSelectAll}>
                  {selectedIds.size === sortedItems.length ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>

            <div className="title-controls-group">
              {/* View Switcher */}
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
          {lastRemoval && (
            <div className="undo-toast-banner" role="status">
              <span>{lastRemoval.pages.length} {lastRemoval.pages.length === 1 ? "page" : "pages"} deleted.</span>
              <button type="button" className="btn-undo-action" onClick={handleUndo}>
                Undo
              </button>
            </div>
          )}

          {/* Batch Selection Action Bar */}
          {selectedIds.size > 0 && viewMode === "overview" && (
            <div className="selection-action-bar" role="region" aria-label="Selected pages actions">
              <span className="selection-count" role="status" aria-atomic="true">
                <strong>{selectedIds.size}</strong> of {sortedItems.length} selected
              </span>
              <div className="selection-buttons">
                <button type="button" className="btn-action-inline" onClick={editSelected} title="Edit selected pages in order">
                  <EditIcon className="btn-action-icon" /><span>Edit</span>
                </button>
                <button type="button" className="btn-action-inline" onClick={() => handleDuplicate()} title="Duplicate selected pages">
                  <CopyIcon className="btn-action-icon" /><span>Duplicate</span>
                </button>
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
                  disabled={!canMoveSelected(-1)}
                  title="Move selected earlier in document order"
                >
                  <span>← Earlier</span>
                </button>
                <button
                  type="button"
                  className="btn-action-inline"
                  onClick={handleMoveSelectedLater}
                  disabled={!canMoveSelected(1)}
                  title="Move selected later in document order"
                >
                  <span>Later →</span>
                </button>
                <button
                  type="button"
                  className="btn-action-inline btn-danger"
                  onClick={() => deletePages()}
                  title="Delete selected pages"
                >
                  <TrashIcon className="btn-action-icon" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          )}

          {/* VIEW MODE: OVERVIEW GRID */}
          {viewMode === "overview" && (
            <div className="overview-container">
                <div className="page-grid" role="list" aria-label="Document Pages">
                  {sortedItems.map((item, idx) => (
                    <ThumbnailSheet
                      key={item.id}
                      item={item}
                      pageIndex={idx}
                      options={options}
                      isSelected={selectedIds.has(item.id)}
                      onToggleSelect={toggleSelection}
                      onInspect={(id) => {
                        documentSessionStore.setActiveInspectId(TOOL_ID, id);
                        documentSessionStore.setViewMode(TOOL_ID, "single");
                      }}
                      total={sortedItems.length}
                      onMove={direction => {
                        const order = [...sortedItems];
                        const target = idx + direction;
                        [order[idx], order[target]] = [order[target], order[idx]];
                        documentSessionStore.setOptions(TOOL_ID, { sort: "manual", manualOrder: order.map(page => page.id) });
                      }}
                      onRemove={() => deletePages(item)}
                      onEdit={editPage}
                      onDuplicate={handleDuplicate}
                      onRotate={id => documentSessionStore.rotateItem(TOOL_ID, id, 90)}
                    />
                  ))}
                </div>

              {/* Status bar below grid */}
              {sortedItems.length > 0 && (
                <div className="grid-footer-bar">
                  <span className="grid-status-count">
                    {sortedItems.length} pages · {formatBytes(items.reduce((sum, item) => sum + item.size, 0))}
                  </span>
                  <span className="grid-status-hint desktop-only">
                    Open a page’s menu to reorder or delete it.
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

                {/* Accurate layout preview */}
                <div className="paper-sheet-preview-wrap">
                  <PreviewCanvas
                    zoom={singleZoom}
                    item={activeInspectItem}
                    options={options}
                    pageIndex={activeInspectIndex}
                    totalPages={sortedItems.length}
                    onPageChange={(idx) => {
                      if (sortedItems[idx]) {
                        documentSessionStore.setActiveInspectId(TOOL_ID, sortedItems[idx].id);
                      }
                    }}
                  />
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
                    }}
                    title="Reset to 100%"
                  >
                    Fit Page
                  </button>
                  <button
                    type="button"
                    className="btn-single-edit-action"
                    onClick={() => editPage(activeInspectItem.id)}
                    title="Edit image crop, rotation, and flip"
                  >
                    Edit Image
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Settings Sidebar (Desktop & Mobile Drawer) */}
        <aside
          ref={settingsPanel} role={mobileSettingsOpen ? "dialog" : undefined} aria-modal={mobileSettingsOpen || undefined}
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

          {/* Scope Selector: All pages — shared defaults vs This page — settings for the active image only */}
          <div className="setting-scope-toggle" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={scopeMode === "all"}
              className={`btn-scope-tab ${scopeMode === "all" ? "active" : ""}`}
              onClick={() => setScopeMode("all")}
            >
              All pages
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scopeMode === "this-page"}
              className={`btn-scope-tab ${scopeMode === "this-page" ? "active" : ""}`}
              onClick={() => setScopeMode("this-page")}
              disabled={sortedItems.length === 0}
              title={
                sortedItems.length === 0
                  ? "Add images to customize settings for a specific page"
                  : "Settings for this image only"
              }
            >
              This page
            </button>
          </div>

          {/* Disabled Help Notice if no items exist */}
          {sortedItems.length === 0 && (
            <div className="scope-disabled-hint">
              <span>Select or upload images to configure individual page settings.</span>
            </div>
          )}

          {/* "This page" Scope Notice Banner */}
          {scopeMode === "this-page" && activeInspectItem && (
            <div className="scope-notice-banner">
              <div className="scope-notice-main">
                <span className="scope-notice-title">
                  Editing page {activeInspectIndex + 1} — {activeInspectItem.name}
                </span>
                <span className="scope-notice-subtitle">
                  Changes apply only to this page.
                </span>
                {selectedIds.size > 0 && !selectedIds.has(activeInspectItem.id) && (
                  <span className="scope-batch-note">
                    (Active page: Page {activeInspectIndex + 1}. Note: {selectedIds.size} other{" "}
                    {selectedIds.size === 1 ? "page is" : "pages are"} selected in batch.)
                  </span>
                )}
              </div>

              {hasAnyPageOverrides && (
                <div className="scope-notice-actions">
                  <button
                    type="button"
                    className="btn-reset-scope"
                    onClick={handleResetPageSettings}
                    title="Remove all settings overrides for this page"
                  >
                    Reset page settings
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Setting: Page orientation */}
          <div className="setting-group">
            <div className="setting-label-row">
              <label className="setting-label">Page orientation</label>
              {scopeMode === "this-page" && (
                <div className="inheritance-status-wrap">
                  {hasCustomOrientation ? (
                    <>
                      <span className="badge-custom-prop">Custom</span>
                      <button
                        type="button"
                        className="btn-reset-prop"
                        onClick={() => handleResetProperty("orientation")}
                        title={`Use document default (${options.orientation})`}
                      >
                        Reset
                      </button>
                    </>
                  ) : (
                    <span className="badge-inherited-prop">
                      Inherited ({options.orientation})
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="segmented-control">
              <button
                type="button"
                aria-pressed={currentDisplayOptions.orientation === "Portrait"}
                  className={`segment-btn ${
                  currentDisplayOptions.orientation === "Portrait" ? "active" : ""
                }`}
                onClick={() => handleOptionChange("orientation", "Portrait")}
              >
                Portrait
              </button>
              <button
                type="button"
                aria-pressed={currentDisplayOptions.orientation === "Landscape"}
                  className={`segment-btn ${
                  currentDisplayOptions.orientation === "Landscape" ? "active" : ""
                }`}
                onClick={() => handleOptionChange("orientation", "Landscape")}
              >
                Landscape
              </button>
              <button
                type="button"
                aria-pressed={currentDisplayOptions.orientation === "Auto"}
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
            <div className="setting-label-row">
              <label className="setting-label">Page size</label>
              {scopeMode === "this-page" && (
                <div className="inheritance-status-wrap">
                  {hasCustomPageSize ? (
                    <>
                      <span className="badge-custom-prop">Custom</span>
                      <button
                        type="button"
                        className="btn-reset-prop"
                        onClick={() => handleResetProperty("pageSize")}
                        title={`Use document default (${options.pageSize})`}
                      >
                        Reset
                      </button>
                    </>
                  ) : (
                    <span className="badge-inherited-prop">
                      Inherited ({options.pageSize})
                    </span>
                  )}
                </div>
              )}
            </div>
            <select
              aria-label="pageSize" className="setting-select"
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
            <div className="setting-label-row">
              <label className="setting-label">Margins</label>
              {scopeMode === "this-page" && (
                <div className="inheritance-status-wrap">
                  {hasCustomMargins ? (
                    <>
                      <span className="badge-custom-prop">Custom</span>
                      <button
                        type="button"
                        className="btn-reset-prop"
                        onClick={() => handleResetProperty("marginPreset")}
                        title={`Use document default (${options.marginPreset})`}
                      >
                        Reset
                      </button>
                    </>
                  ) : (
                    <span className="badge-inherited-prop">
                      Inherited ({options.marginPreset})
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="segmented-control margin-presets-control">
              <button
                type="button"
                aria-pressed={currentDisplayOptions.marginPreset === "None"}
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
                aria-pressed={currentDisplayOptions.marginPreset === "Small"}
                  className={`segment-btn ${
                  currentDisplayOptions.marginPreset === "Small" ? "active" : ""
                }`}
                onClick={() =>
                  handleOptionChange("marginPreset", "Small", { marginMm: 12 })
                }
              >
                Small (12mm)
              </button>
              <button
                type="button"
                aria-pressed={currentDisplayOptions.marginPreset === "Medium"}
                  className={`segment-btn ${
                  currentDisplayOptions.marginPreset === "Medium" ? "active" : ""
                }`}
                onClick={() =>
                  handleOptionChange("marginPreset", "Medium", { marginMm: 20 })
                }
              >
                Medium (20mm)
              </button>
              <button
                type="button"
                aria-pressed={currentDisplayOptions.marginPreset === "Custom"}
                  className={`segment-btn ${
                  currentDisplayOptions.marginPreset === "Custom" ? "active" : ""
                }`}
                onClick={() => handleOptionChange("marginPreset", "Custom")}
              >
                Custom
              </button>
            </div>

            {/* Custom Margin Inputs in mm */}
            {currentDisplayOptions.marginPreset === "Custom" && (
              <div className="custom-margins-grid">
                <label className="margin-input-field">
                  <span>Top (mm)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={currentDisplayOptions.customMargins[0]}
                    onChange={(e) => {
                      const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                      const cur = [...currentDisplayOptions.customMargins] as [
                        number,
                        number,
                        number,
                        number
                      ];
                      cur[0] = v;
                      handleOptionChange("customMargins", cur);
                    }}
                  />
                </label>
                <label className="margin-input-field">
                  <span>Right (mm)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={currentDisplayOptions.customMargins[1]}
                    onChange={(e) => {
                      const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                      const cur = [...currentDisplayOptions.customMargins] as [
                        number,
                        number,
                        number,
                        number
                      ];
                      cur[1] = v;
                      handleOptionChange("customMargins", cur);
                    }}
                  />
                </label>
                <label className="margin-input-field">
                  <span>Bottom (mm)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={currentDisplayOptions.customMargins[2]}
                    onChange={(e) => {
                      const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                      const cur = [...currentDisplayOptions.customMargins] as [
                        number,
                        number,
                        number,
                        number
                      ];
                      cur[2] = v;
                      handleOptionChange("customMargins", cur);
                    }}
                  />
                </label>
                <label className="margin-input-field">
                  <span>Left (mm)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={currentDisplayOptions.customMargins[3]}
                    onChange={(e) => {
                      const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                      const cur = [...currentDisplayOptions.customMargins] as [
                        number,
                        number,
                        number,
                        number
                      ];
                      cur[3] = v;
                      handleOptionChange("customMargins", cur);
                    }}
                  />
                </label>
              </div>
            )}
          </div>

          {/* Setting: Fit image to page */}
          <div className="setting-group">
            <div className="setting-label-row">
              <label className="setting-label">Fit image to page</label>
              {scopeMode === "this-page" && (
                <div className="inheritance-status-wrap">
                  {hasCustomFit ? (
                    <>
                      <span className="badge-custom-prop">Custom</span>
                      <button
                        type="button"
                        className="btn-reset-prop"
                        onClick={() => handleResetProperty("fit")}
                        title={`Use document default (${options.fit})`}
                      >
                        Reset
                      </button>
                    </>
                  ) : (
                    <span className="badge-inherited-prop">
                      Inherited ({options.fit})
                    </span>
                  )}
                </div>
              )}
            </div>
            <select
              aria-label="fit" className="setting-select"
              value={currentDisplayOptions.fit}
              onChange={(e) =>
                handleOptionChange(
                  "fit",
                  e.target.value as PdfOptions["fit"]
                )
              }
            >
              <option value="Contain">Contain · show entire image</option>
              <option value="Cover">Cover · fill printable area</option>
              <option value="Original">Original 1:1 scale</option>
            </select>
          </div>

          {/* Setting: Image quality */}
          <div className="setting-group">
            <div className="setting-label-row">
              <label className="setting-label">Image quality</label>
              {scopeMode === "this-page" && (
                <div className="inheritance-status-wrap">
                  {hasCustomProfile ? (
                    <>
                      <span className="badge-custom-prop">Custom</span>
                      <button
                        type="button"
                        className="btn-reset-prop"
                        onClick={() => handleResetProperty("profile")}
                        title={`Use document default (${options.profile})`}
                      >
                        Reset
                      </button>
                    </>
                  ) : (
                    <span className="badge-inherited-prop">
                      Inherited ({options.profile})
                    </span>
                  )}
                </div>
              )}
            </div>
            <select
              aria-label="profile" className="setting-select"
              value={currentDisplayOptions.profile}
              onChange={(e) =>
                handleOptionChange(
                  "profile",
                  e.target.value as PdfOptions["profile"]
                )
              }
            >
              <option value="Screen/Mobile">Screen / mobile · smaller file</option>
              <option value="Print">Print · high resolution</option>
              <option value="Original">Original quality</option>
            </select>
          </div>

          {/* Explicit "Apply these settings to all pages" action when in This Page mode */}
          {scopeMode === "this-page" && activeInspectItem && (
            <div className="apply-all-action-wrap">
              <button
                type="button"
                className="btn-apply-to-all"
                onClick={() => setShowApplyAllModal(true)}
              >
                Apply these settings to all pages
              </button>
            </div>
          )}

          {/* Setting: Document-wide Output Filename */}
          {scopeMode === "all" && (
            <div className="setting-group">
              <div className="setting-label-row">
                <label className="setting-label">PDF Filename</label>
                <span className="badge-doc-wide">Document-wide</span>
              </div>
              <input
                type="text"
                aria-label="Output filename" className="setting-input"
                value={options.filename}
                onChange={(e) => {
                  documentSessionStore.setOptions(TOOL_ID, { filename: e.target.value });
                }}
              />
            </div>
          )}

          {/* Primary CTA: Create PDF Button */}
          <button className="mobile-only primary-action settings-done" onClick={() => setMobileSettingsOpen(false)}>Done</button>
          <div className="sidebar-cta-group desktop-only">
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
                  : result && session.isOutdated
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
            <div className={`export-result-card ${session.isOutdated ? "outdated" : ""}`}>
              <div className="result-header">
                <span className="result-check">✓</span>
                <strong>{session.isOutdated ? "PDF outdated" : "PDF Ready!"}</strong>
              </div>
              <p className="result-meta">
                {result.filename} · {(result.sizeBytes / (1024 * 1024)).toFixed(2)} MB
              </p>
              <button
                type="button"
                disabled={session.isOutdated}
                className="btn-download-result"
                onClick={handleDownload}
              >
                Download PDF
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* Confirmation Modal: Apply These Settings to All Pages */}
      {showApplyAllModal && activeInspectItem && (
        <div ref={confirmPanel} className="folio-modal-backdrop" role="dialog" aria-label="Apply settings to all pages" aria-modal="true">
          <div className="folio-modal-card confirm-modal-card">
            <div className="modal-header">
              <h3>Apply settings to all pages?</h3>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setShowApplyAllModal(false)}
                aria-label="Cancel"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>
                This will apply Page {activeInspectIndex + 1}’s layout settings (page size,
                orientation, margins, fit mode, and image quality) to all pages in this
                document and replace any existing individual page settings.
              </p>
              <p className="modal-hint">
                Individual image edits (crops, rotations, flips) will not be affected.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setShowApplyAllModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary-action"
                onClick={handleConfirmApplyToAll}
              >
                Yes, apply to all pages
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Image Editor Modal */}
      <ImageEditorModal
        isOpen={!!editingItemId}
        item={editingItem}
        pageIndex={editingIndex}
        totalPages={sortedItems.length}
        selectionProgress={editQueue && editQueue.ids.length > 1 ? { current: editQueue.index + 1, total: editQueue.ids.length } : undefined}
        onClose={() => setEditQueue(null)}
        onApply={(edits) => {
          if (!editQueue || !editingItemId) return;
          documentSessionStore.updateItemEdits(TOOL_ID, editingItemId, edits);
          const next = editQueue.index + 1;
          setEditQueue(next < editQueue.ids.length ? { ...editQueue, index: next } : null);
        }}
      />

      {/* Mobile Sticky Bottom Action Bar */}
      <div className="mobile-bottom-bar mobile-only">
        <button
          type="button"
          className="btn-bottom-sub"
          onClick={() => setMobileSettingsOpen(true)}
          aria-label="Open document settings"
          title="Document settings"
        >
          <SettingsIcon className="btn-sub-icon" /> Settings
        </button>

        <button
          type="button"
          className="btn-mobile-create-pdf"
          onClick={result && !session.isOutdated ? handleDownload : handleGeneratePdf}
          disabled={isProcessing || sortedItems.length === 0}
        >
          <PdfDocIcon className="btn-pdf-icon" />
          <span>
            {isProcessing
              ? "Creating…"
              : result && !session.isOutdated
              ? "Download PDF"
              : result && session.isOutdated
              ? "Create updated PDF"
              : "Create PDF"}
          </span>
        </button>
      </div>
      </>}
    </div>
  );
}
