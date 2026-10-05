import React, { useRef, useState, useMemo, useEffect } from "react";
import { CompressionPreset, CompressionResult } from "../types";
import {
  useCompressionSession,
  compressionSessionStore,
  CompressionItem,
} from "../lib/compressionSessionStore";
import { useRouter, router } from "../lib/router";
import { mapStrengthToSettings } from "../lib/compressEngine";
import { CompressIcon, PdfDocIcon, TrashIcon, PlusIcon, CheckIcon } from "./Icons";
import { ExpandedPreviewModal } from "./ExpandedPreviewModal";

interface CompressPdfWorkspaceProps {
  onBackToHome: () => void;
}

export function CompressPdfWorkspace({ onBackToHome }: CompressPdfWorkspaceProps) {
  const route = useRouter();
  const session = useCompressionSession();
  const {
    items,
    activeItemId,
    file,
    fileInfo,
    preset,
    strength,
    previewPage,
    previewViewMode,
    previewImages,
    isPreviewLoading,
    jobStatus,
    progress,
    batchProgress,
    result,
    results,
    zipUrl,
    isOutdated,
    errorMessage,
  } = session;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addMoreInputRef = useRef<HTMLInputElement | null>(null);
  const expandBtnRef = useRef<HTMLButtonElement | null>(null);
  const [jumpPage, setJumpPage] = useState<string>("1");

  // Keep jump page in sync with preview page
  useEffect(() => {
    setJumpPage(String(previewPage));
  }, [previewPage]);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Handler for file selection (initial upload or replace)
  const handleSelectFiles = async (fileList: FileList | File[], replace = true) => {
    const success = await compressionSessionStore.addFiles(fileList, replace);
    if (success) {
      router.navigate({ toolId: "compress-pdf", stage: "editor" });
    }
  };

  // Handler for adding more files to the current batch
  const handleAddMoreFiles = async (fileList: FileList | File[]) => {
    await compressionSessionStore.addFiles(fileList, false);
  };

  // Handler for removing a file
  const handleRemoveFile = (id: string) => {
    compressionSessionStore.removeFile(id);
    const updated = compressionSessionStore.getState();
    if (!updated.items.length) {
      router.navigate({ toolId: "compress-pdf", stage: "upload" });
    }
  };

  // Handler for selecting an active file for preview
  const handleSetActiveFile = (id: string) => {
    compressionSessionStore.setActiveFile(id);
  };

  // Handler for clear all files
  const handleClearAll = () => {
    compressionSessionStore.reset();
    router.navigate({ toolId: "compress-pdf", stage: "upload" });
  };

  // Handler for preset selection
  const handleSelectPreset = (p: CompressionPreset) => {
    if (p === "high-quality") {
      compressionSessionStore.setSettings(20, "high-quality");
    } else if (p === "balanced") {
      compressionSessionStore.setSettings(50, "balanced");
    } else if (p === "smallest") {
      compressionSessionStore.setSettings(85, "smallest");
    }
  };

  // Handler for slider / strength change
  const handleStrengthChange = (val: number) => {
    compressionSessionStore.setSettings(val);
  };

  // Handler for starting compression (single or batch)
  const handleStartCompression = () => {
    if (!items.length || jobStatus === "processing") return;

    // Navigate to processing screen
    router.navigate({ toolId: "compress-pdf", stage: "processing" });

    compressionSessionStore.startCompression(undefined, () => {
      // If currently on processing route, replace history entry with result
      const currentRoute = router.getRoute();
      if (currentRoute.toolId === "compress-pdf" && currentRoute.stage === "processing") {
        router.navigate({ toolId: "compress-pdf", stage: "result", replace: true });
      }
    });
  };

  // Handler for cancelling compression
  const handleCancelCompression = () => {
    compressionSessionStore.cancelCompression();
    if (route.stage === "processing") {
      router.navigate({ toolId: "compress-pdf", stage: "editor", replace: true });
    }
  };

  // In-app Back button handler
  const handleInAppBack = () => {
    if (route.overlay) {
      router.closeOverlay();
      return;
    }
    if (route.stage === "result" || route.stage === "processing") {
      router.navigate({ toolId: "compress-pdf", stage: "editor" });
      return;
    }
    if (route.stage === "editor") {
      router.navigate({ toolId: "compress-pdf", stage: "upload" });
      return;
    }
    onBackToHome();
  };

  const { quality, maxDimension } = useMemo(() => {
    return mapStrengthToSettings(strength);
  }, [strength]);

  const activePageCount = fileInfo?.pageCount || 1;

  const totalPages = useMemo(() => {
    return items.reduce((sum, it) => sum + it.pageCount, 0) || activePageCount;
  }, [items, activePageCount]);

  const totalOriginalBytes = useMemo(() => {
    return (
      items.reduce((sum, it) => sum + (it.result?.originalBytes || it.size), 0) ||
      fileInfo?.size ||
      0
    );
  }, [items, fileInfo]);

  const totalOutputBytes = useMemo(() => {
    return items.reduce(
      (sum, it) => sum + (it.result ? it.result.outputBytes : it.size),
      0
    );
  }, [items]);

  const totalReduced = totalOutputBytes < totalOriginalBytes;
  const totalPercentSaved = totalReduced
    ? Number((((totalOriginalBytes - totalOutputBytes) / totalOriginalBytes) * 100).toFixed(1))
    : 0;

  const completedCount = useMemo(() => {
    return Object.keys(results).length;
  }, [results]);

  // Handle jump page submission
  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpPage, 10);
    if (!isNaN(p) && p >= 1 && p <= activePageCount) {
      compressionSessionStore.setPreviewPage(p);
    } else {
      setJumpPage(String(previewPage));
    }
  };

  // 1. RECOVERY VIEW: If user refreshed on editor/processing/result with no file in memory
  if (
    !items.length &&
    !file &&
    (route.stage === "editor" || route.stage === "processing" || route.stage === "result")
  ) {
    return (
      <div className="folio-workspace tool-generic-workspace compress-workspace">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files?.length) handleSelectFiles(e.target.files, true);
            e.target.value = "";
          }}
        />

        <div className="tool-workspace-header">
          <div className="header-nav-inline">
            <button
              type="button"
              className="btn-inapp-back"
              onClick={onBackToHome}
              aria-label="Back to all tools"
            >
              ← All tools
            </button>
            <h1 className="document-title">Compress PDF</h1>
          </div>
        </div>

        <div className="empty-dropzone session-reconnect-box">
          <div className="dropzone-art">
            <CompressIcon className="dropzone-icon" />
          </div>
          <h3>Select your PDF(s) to continue</h3>
          <p>
            Your previous browser session was reset or refreshed. Files are kept privately in temporary device memory.
          </p>
          <div className="reconnect-actions">
            <button
              type="button"
              className="btn-primary-action"
              onClick={() => fileInputRef.current?.click()}
            >
              Select PDF File(s)
            </button>
            <button
              type="button"
              className="btn-secondary-action"
              onClick={() => router.navigate({ toolId: "home" })}
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. UPLOAD VIEW: No file loaded yet
  if (!items.length || route.stage === "upload") {
    return (
      <div className="folio-workspace tool-generic-workspace compress-workspace">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files?.length) handleSelectFiles(e.target.files, true);
            e.target.value = "";
          }}
        />

        <div className="tool-workspace-header">
          <div className="header-nav-inline">
            <button
              type="button"
              className="btn-inapp-back"
              onClick={onBackToHome}
              aria-label="Back to all tools"
            >
              ← All tools
            </button>
            <div>
              <h1 className="document-title">Compress PDF</h1>
              <p className="tool-header-subtitle">
                Reduce single or batch PDF file sizes while preserving text, vectors, and image clarity.
              </p>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="error-banner" role="alert">
            <span>⚠ {errorMessage}</span>
            <button
              type="button"
              onClick={() => compressionSessionStore.clearError()}
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        <div
          className="empty-dropzone"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files?.length) handleSelectFiles(e.dataTransfer.files, true);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
          aria-label="Upload PDF files"
        >
          <div className="dropzone-art">
            <CompressIcon className="dropzone-icon" />
          </div>
          <h3>Select PDF file(s) to compress</h3>
          <p>Drag and drop one or multiple PDF files here, or click to choose from your device.</p>
          <button type="button" className="btn-primary-action btn-choose-file">
            Choose PDF File(s)
          </button>
        </div>
      </div>
    );
  }

  // 3. PROCESSING STAGE: Dedicated progress screen
  if (route.stage === "processing") {
    const isBatch = items.length > 1;

    return (
      <div className="folio-workspace tool-generic-workspace compress-workspace processing-workspace">
        <div className="tool-workspace-header">
          <div className="header-nav-inline">
            <button
              type="button"
              className="btn-inapp-back"
              onClick={() => router.navigate({ toolId: "compress-pdf", stage: "editor" })}
              aria-label="Back to editor"
            >
              ← Back to settings
            </button>
            <div>
              <h1 className="document-title">
                {isBatch ? `Compressing ${items.length} PDF Files…` : "Compressing PDF…"}
              </h1>
              <p className="tool-header-subtitle">
                {isBatch
                  ? `Batch processing · ${strength}% compression strength`
                  : `${fileInfo?.name} · ${strength}% compression strength`}
              </p>
            </div>
          </div>
        </div>

        <div className="processing-hero-card">
          <div className="processing-animation-ring">
            <div className="spinner-large" />
          </div>

          <h2 className="processing-title">
            {batchProgress?.status || progress?.status || "Optimizing document…"}
          </h2>
          <p className="processing-sub">
            Processing locally on your device. Original text and vector lines stay completely intact.
          </p>

          <div className="processing-meter-box">
            <div className="progress-status-row">
              <span className="progress-status-text">
                {batchProgress?.status || progress?.status || "Processing…"}
              </span>
              <span className="progress-percent-text">
                {batchProgress?.percent || progress?.percent || 0}%
              </span>
            </div>
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: `${batchProgress?.percent || progress?.percent || 5}%` }}
                role="progressbar"
                aria-valuenow={batchProgress?.percent || progress?.percent || 0}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>

          {/* Batch Progress List */}
          {isBatch && (
            <div className="batch-progress-list" role="list" aria-label="Batch files status">
              {items.map((it, idx) => (
                <div
                  key={it.id}
                  className={`batch-progress-row ${it.status === "processing" ? "processing" : ""}`}
                >
                  <div className="batch-progress-file-info">
                    <PdfDocIcon className="batch-file-icon" />
                    <span className="batch-progress-filename" title={it.name}>
                      {idx + 1}. {it.name}
                    </span>
                  </div>
                  <span className={`batch-status-badge ${it.status}`}>
                    {it.status === "completed"
                      ? "✓ Done"
                      : it.status === "processing"
                      ? "● Compressing…"
                      : it.status === "failed"
                      ? "✕ Error"
                      : "Queued"}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="processing-actions-row">
            <button
              type="button"
              className="btn-cancel-processing"
              onClick={handleCancelCompression}
            >
              Cancel compression
            </button>
            <button
              type="button"
              className="btn-secondary-action"
              onClick={() => router.navigate({ toolId: "compress-pdf", stage: "editor" })}
            >
              Keep running in background →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. RESULT STAGE: Dedicated Result Screen (Single or Batch)
  if (route.stage === "result") {
    const isBatch = items.length > 1;

    // A. BATCH RESULT SCREEN
    if (isBatch) {
      return (
        <div className="folio-workspace tool-generic-workspace compress-workspace result-workspace">
          <div className="tool-workspace-header">
            <div className="header-nav-inline">
              <button
                type="button"
                className="btn-inapp-back"
                onClick={() => router.navigate({ toolId: "compress-pdf", stage: "editor" })}
                aria-label="Back to editor"
              >
                ← Edit settings
              </button>
              <div>
                <h1 className="document-title">Batch Compression Complete</h1>
                <p className="tool-header-subtitle">
                  {completedCount} of {items.length} PDF files processed
                </p>
              </div>
            </div>
          </div>

          <div className="result-hero-card" style={{ maxWidth: "680px" }}>
            <div className="result-hero-icon-wrap">
              <span className="result-badge-check">✓</span>
            </div>

            <h2 className="result-hero-heading">All PDFs Processed Successfully!</h2>
            <p className="result-hero-desc">
              Preserved all text, fonts, and vector elements across {items.length} documents. Embedded images were optimized at {strength}% strength.
            </p>

            <div className="compress-stats-grid result-page-stats">
              <div className="stat-item">
                <span className="stat-label">Total original</span>
                <span className="stat-val">{formatBytes(totalOriginalBytes)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Total output</span>
                <span className="stat-val">{formatBytes(totalOutputBytes)}</span>
              </div>
              <div className="stat-item highlight">
                <span className="stat-label">Total savings</span>
                <span className="stat-val">
                  {totalReduced
                    ? `−${totalPercentSaved}% (${formatBytes(totalOriginalBytes - totalOutputBytes)} saved)`
                    : "0%"}
                </span>
              </div>
            </div>

            {/* Primary Action: Download All as ZIP */}
            {zipUrl ? (
              <a
                href={zipUrl}
                download="folio_compressed_pdfs.zip"
                className="btn-download-zip-hero"
              >
                ⬇ Download All as ZIP ({items.length} PDFs · {formatBytes(totalOutputBytes)})
              </a>
            ) : null}

            {/* File-by-file breakdown */}
            <div className="batch-results-list" role="list" aria-label="Individual compressed files">
              {items.map((it) => {
                const itemRes = it.result;
                const isReduced = itemRes?.isReduced;
                const downloadUrl = isReduced
                  ? itemRes.url
                  : URL.createObjectURL(it.file);
                const downloadFilename = isReduced ? itemRes.filename : it.name;

                return (
                  <div key={it.id} className="batch-result-row">
                    <div className="batch-result-info">
                      <PdfDocIcon className="batch-file-icon" />
                      <div className="batch-file-texts">
                        <span className="batch-file-name" title={it.name}>
                          {it.name}
                        </span>
                        <div className="batch-result-meta">
                          <span>
                            {formatBytes(it.size)} →{" "}
                            {itemRes ? formatBytes(itemRes.outputBytes) : "N/A"}
                          </span>
                          {isReduced && (
                            <span className="batch-savings-tag">
                              −{itemRes.percentSaved}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <a
                      href={downloadUrl}
                      download={downloadFilename}
                      className="btn-download-file-item"
                    >
                      ⬇ Download
                    </a>
                  </div>
                );
              })}
            </div>

            <div className="result-sub-actions" style={{ marginTop: "24px" }}>
              <button
                type="button"
                className="btn-secondary-action"
                onClick={() => router.navigate({ toolId: "compress-pdf", stage: "editor" })}
              >
                Adjust settings & retry
              </button>
              <button
                type="button"
                className="btn-text-action"
                onClick={() => {
                  compressionSessionStore.reset();
                  router.navigate({ toolId: "compress-pdf", stage: "upload" });
                }}
              >
                Compress another batch
              </button>
            </div>
          </div>
        </div>
      );
    }

    // B. SINGLE FILE RESULT SCREEN
    if (result) {
      return (
        <div className="folio-workspace tool-generic-workspace compress-workspace result-workspace">
          <div className="tool-workspace-header">
            <div className="header-nav-inline">
              <button
                type="button"
                className="btn-inapp-back"
                onClick={() => router.navigate({ toolId: "compress-pdf", stage: "editor" })}
                aria-label="Back to editor"
              >
                ← Edit settings
              </button>
              <div>
                <h1 className="document-title">Compression Complete</h1>
                <p className="tool-header-subtitle">{fileInfo?.name}</p>
              </div>
            </div>
          </div>

          <div className="result-hero-card">
            <div className="result-hero-icon-wrap">
              <span className="result-badge-check">{result.isReduced ? "✓" : "ℹ"}</span>
            </div>

            <h2 className="result-hero-heading">
              {result.isReduced ? "Your PDF is ready!" : "PDF Already Optimized"}
            </h2>

            <p className="result-hero-desc">
              {result.isReduced
                ? `Preserved all ${result.pageCount} pages and text. Embedded images were optimized at ${result.strength}% strength.`
                : "These settings did not reduce this PDF. It may already be optimized. You can download the original file or adjust compression strength."}
            </p>

            <div className="compress-stats-grid result-page-stats">
              <div className="stat-item">
                <span className="stat-label">Original size</span>
                <span className="stat-val">{formatBytes(result.originalBytes)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Output size</span>
                <span className="stat-val">{formatBytes(result.outputBytes)}</span>
              </div>
              <div className="stat-item highlight">
                <span className="stat-label">Savings</span>
                <span className="stat-val">
                  {result.isReduced ? `−${result.percentSaved}%` : "0%"}
                </span>
              </div>
            </div>

            {isOutdated && (
              <div className="outdated-warning-chip result-outdated-banner">
                ⚠ Settings were changed since this file was generated.
              </div>
            )}

            <div className="result-cta-group">
              <a
                href={
                  result.isReduced
                    ? result.url
                    : file
                    ? URL.createObjectURL(file)
                    : "#"
                }
                download={
                  result.isReduced
                    ? result.filename
                    : fileInfo?.name || "document.pdf"
                }
                className="btn-download-primary"
              >
                ⬇ {result.isReduced ? "Download Compressed PDF" : "Download Original PDF"}
              </a>

              <div className="result-sub-actions">
                <button
                  type="button"
                  className="btn-secondary-action"
                  onClick={() => router.navigate({ toolId: "compress-pdf", stage: "editor" })}
                >
                  Adjust settings & retry
                </button>
                <button
                  type="button"
                  className="btn-text-action"
                  onClick={() => {
                    compressionSessionStore.reset();
                    router.navigate({ toolId: "compress-pdf", stage: "upload" });
                  }}
                >
                  Compress another file
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
  }

  // 5. EDITOR STAGE: The Main Compression Workspace
  const isBatch = items.length > 1;

  return (
    <div className="folio-workspace tool-generic-workspace compress-workspace editor-workspace">
      {/* Hidden file input for adding more files */}
      <input
        ref={addMoreInputRef}
        type="file"
        multiple
        accept="application/pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files?.length) handleAddMoreFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* 1. Header with Title & Back/Home Controls */}
      <div className="tool-workspace-header">
        <div className="header-nav-inline">
          <button
            type="button"
            className="btn-inapp-back"
            onClick={handleInAppBack}
            aria-label="Back to tools"
          >
            ← All tools
          </button>
          <div>
            <h1 className="document-title">Compress PDF</h1>
            <p className="tool-header-subtitle">
              {isBatch
                ? `Batch mode: ${items.length} PDF files selected.`
                : "Adjust compression settings and preview changes before saving."}
            </p>
          </div>
        </div>

        <div className="header-right-actions">
          <button
            type="button"
            className="btn-secondary-action"
            onClick={() => addMoreInputRef.current?.click()}
            aria-label="Add more PDF files"
          >
            + Add More PDFs
          </button>
          {items.length > 0 && (
            <button
              type="button"
              className="btn-text-action"
              onClick={handleClearAll}
              aria-label="Clear all files"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="error-banner" role="alert">
          <span>⚠ {errorMessage}</span>
          <button
            type="button"
            onClick={() => compressionSessionStore.clearError()}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* Background Processing Indicator banner */}
      {jobStatus === "processing" && (batchProgress || progress) && (
        <div className="bg-processing-banner" role="status">
          <div className="bg-processing-left">
            <div className="spinner-small" />
            <div className="bg-processing-text">
              <strong>Compression running in background…</strong>
              <span>
                {batchProgress?.status || progress?.status} (
                {batchProgress?.percent || progress?.percent}%)
              </span>
            </div>
          </div>
          <div className="bg-processing-actions">
            <button
              type="button"
              className="btn-banner-view"
              onClick={() => router.navigate({ toolId: "compress-pdf", stage: "processing" })}
            >
              View
            </button>
            <button
              type="button"
              className="btn-banner-cancel"
              onClick={handleCancelCompression}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="tool-content-layout compress-responsive-layout">
        {/* Left Column / Mobile Order Items */}
        <div className="compress-main-flow">
          {/* BATCH FILES MANAGER CARD (When 2+ files are uploaded) */}
          {isBatch ? (
            <div className="batch-files-card">
              <div className="batch-files-header">
                <div className="batch-files-title-row">
                  <h3 className="batch-files-heading">Batch Files ({items.length})</h3>
                  <span className="batch-files-badge">
                    {formatBytes(totalOriginalBytes)} · {totalPages} pages total
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-add-batch-more"
                  onClick={() => addMoreInputRef.current?.click()}
                >
                  <PlusIcon className="icon-small" /> Add More PDFs
                </button>
              </div>

              <div className="batch-files-list" role="list" aria-label="Batch files list">
                {items.map((it) => {
                  const isActive = it.id === activeItemId;
                  return (
                    <div
                      key={it.id}
                      className={`batch-file-row ${isActive ? "active" : ""}`}
                    >
                      <div className="batch-file-info">
                        <PdfDocIcon className="batch-file-icon" />
                        <div className="batch-file-texts">
                          <span className="batch-file-name" title={it.name}>
                            {it.name}
                          </span>
                          <span className="batch-file-meta">
                            {it.pageCount} {it.pageCount === 1 ? "page" : "pages"} ·{" "}
                            {formatBytes(it.size)}
                          </span>
                        </div>
                      </div>

                      <div className="batch-file-actions">
                        {isActive ? (
                          <span className="batch-preview-pill">Active Preview</span>
                        ) : (
                          <button
                            type="button"
                            className="btn-select-preview"
                            onClick={() => handleSetActiveFile(it.id)}
                            title="Preview compression for this file"
                          >
                            Preview
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-remove-batch-file"
                          onClick={() => handleRemoveFile(it.id)}
                          aria-label={`Remove ${it.name}`}
                          title="Remove file"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="batch-scope-notice">
                Settings below will apply to all {items.length} files upon compression.
              </div>
            </div>
          ) : (
            /* Single File Hero Badge */
            <div className="file-hero-badge">
              <PdfDocIcon className="file-hero-icon" />
              <div className="file-hero-info">
                <h3 className="file-hero-title">{fileInfo?.name}</h3>
                <p className="file-hero-meta">
                  {fileInfo?.pageCount} {fileInfo?.pageCount === 1 ? "page" : "pages"} ·{" "}
                  {formatBytes(fileInfo?.size || 0)}
                </p>
              </div>
            </div>
          )}

          {/* 3. Compression Presets */}
          <div className="setting-group preset-group-card">
            <label className="setting-label">Compression preset</label>
            <div className="preset-card-group-row">
              <button
                type="button"
                className={`preset-pill-btn ${preset === "high-quality" ? "active" : ""}`}
                onClick={() => handleSelectPreset("high-quality")}
              >
                <div className="preset-pill-title">High quality</div>
                <div className="preset-pill-desc">20% · Fine detail</div>
              </button>

              <button
                type="button"
                className={`preset-pill-btn ${preset === "balanced" ? "active" : ""}`}
                onClick={() => handleSelectPreset("balanced")}
              >
                <div className="preset-pill-title">Balanced</div>
                <div className="preset-pill-desc">50% · Recommended</div>
              </button>

              <button
                type="button"
                className={`preset-pill-btn ${preset === "smallest" ? "active" : ""}`}
                onClick={() => handleSelectPreset("smallest")}
              >
                <div className="preset-pill-title">Smallest file</div>
                <div className="preset-pill-desc">85% · Max savings</div>
              </button>
            </div>
          </div>

          {/* 4. Compression-Strength Slider and Numeric Input */}
          <div className="setting-group slider-setting-group">
            <div className="slider-header-row">
              <label className="setting-label" htmlFor="compression-slider">
                Custom strength
              </label>
              <div className="slider-input-sync">
                <input
                  type="number"
                  id="compression-number-input"
                  min="1"
                  max="100"
                  value={strength}
                  aria-label="Compression strength percentage"
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) handleStrengthChange(val);
                  }}
                  className="slider-number-input"
                />
                <span className="slider-percent-symbol">%</span>
              </div>
            </div>

            <input
              id="compression-slider"
              type="range"
              min="1"
              max="100"
              value={strength}
              aria-valuemin={1}
              aria-valuemax={100}
              aria-valuenow={strength}
              aria-label="Compression strength slider"
              onChange={(e) => handleStrengthChange(parseInt(e.target.value, 10))}
              className="folio-range-slider"
            />

            <div className="slider-endpoints-row">
              <span className="endpoint-label">Higher quality (1%)</span>
              <span className="endpoint-label">Smaller file (100%)</span>
            </div>

            <p className="slider-explanation">
              Strength sets image downsampling and quality targets across embedded PDF raster images. Text and vector graphics remain fully intact.
            </p>

            <div className="engine-mapping-pill">
              <span>Quality Target: ~{Math.round(quality * 100)}%</span>
              <span>Max Dimension: {maxDimension}px</span>
            </div>
          </div>

          {/* 5. Interactive Before/After Preview */}
          <div className="compress-compact-preview-card">
            <div className="compact-preview-top-bar">
              <div className="segmented-control mode-selector">
                <button
                  type="button"
                  className={`segment-btn ${previewViewMode !== "compressed" ? "active" : ""}`}
                  onClick={() => compressionSessionStore.setPreviewViewMode("original")}
                >
                  Original
                </button>
                <button
                  type="button"
                  className={`segment-btn ${previewViewMode === "compressed" ? "active" : ""}`}
                  onClick={() => compressionSessionStore.setPreviewViewMode("compressed")}
                >
                  Optimized ({strength}%)
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {isBatch && (
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      maxWidth: "200px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={fileInfo?.name}
                  >
                    {fileInfo?.name}
                  </span>
                )}
                <button
                  ref={expandBtnRef}
                  type="button"
                  className="btn-expand-preview"
                  onClick={() => router.openOverlay("preview")}
                  title="Open full comparison view"
                  aria-label="Expand preview comparison"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    stroke="currentColor"
                    fill="none"
                    strokeWidth="2"
                  >
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                  <span>Expand</span>
                </button>
              </div>
            </div>

            {/* Single Compact Preview Stage */}
            <div className="compact-preview-viewport">
              {previewImages ? (
                <img
                  src={
                    previewViewMode === "compressed"
                      ? previewImages.compressedUrl
                      : previewImages.originalUrl
                  }
                  alt={`Page ${previewPage} ${
                    previewViewMode === "compressed" ? "compressed preview" : "original"
                  }`}
                  className="compact-preview-img"
                />
              ) : (
                <div className="preview-sheet-loading">
                  <div className="loading-spinner" />
                  <span>Loading sample preview…</span>
                </div>
              )}

              {isPreviewLoading && (
                <div className="preview-updating-tag">Updating sample preview…</div>
              )}
            </div>

            {/* Page Navigation & Jump Controls */}
            <div className="compact-preview-nav-bar">
              <div className="preview-page-buttons">
                <button
                  type="button"
                  className="btn-preview-nav"
                  disabled={previewPage <= 1}
                  onClick={() => compressionSessionStore.setPreviewPage(previewPage - 1)}
                  aria-label="Previous page"
                >
                  ← Prev
                </button>
                <span className="preview-page-indicator">
                  Page {previewPage} of {activePageCount}
                </span>
                <button
                  type="button"
                  className="btn-preview-nav"
                  disabled={previewPage >= activePageCount}
                  onClick={() => compressionSessionStore.setPreviewPage(previewPage + 1)}
                  aria-label="Next page"
                >
                  Next →
                </button>
              </div>

              {activePageCount > 1 && (
                <form onSubmit={handleJumpSubmit} className="jump-page-form">
                  <label htmlFor="jump-input" className="jump-label">
                    Jump to:
                  </label>
                  <input
                    id="jump-input"
                    type="number"
                    min="1"
                    max={activePageCount}
                    value={jumpPage}
                    onChange={(e) => setJumpPage(e.target.value)}
                    className="jump-page-input"
                    aria-label="Jump to page number"
                  />
                  <button type="submit" className="btn-jump-go">
                    Go
                  </button>
                </form>
              )}
            </div>

            {/* Multi-page Thumbnail Strip (Supports up to 100 pages) */}
            {activePageCount > 1 && (
              <div
                className="thumbnail-overview-strip"
                role="tablist"
                aria-label="Page selection"
              >
                {Array.from({ length: Math.min(100, activePageCount) }, (_, i) => i + 1).map(
                  (p) => (
                    <button
                      key={p}
                      type="button"
                      role="tab"
                      aria-selected={previewPage === p}
                      className={`thumb-page-btn ${previewPage === p ? "active" : ""}`}
                      onClick={() => compressionSessionStore.setPreviewPage(p)}
                      title={`Page ${p}`}
                    >
                      <span>{p}</span>
                    </button>
                  )
                )}
              </div>
            )}

            <p className="preview-caption">
              Sample preview ({fileInfo?.name} · Page {previewPage}). Shows simulated image downsampling at strength {strength}%. Text and vector shapes are unaffected.
            </p>
          </div>

          {/* Quick Result Details Card (if already compressed) */}
          {result && jobStatus !== "processing" && !isBatch && (
            <div
              className={`export-result-card compress-result-card ${
                !result.isReduced ? "result-no-reduction" : ""
              }`}
            >
              <div className="result-header">
                <span className="result-check">{result.isReduced ? "✓" : "ℹ"}</span>
                <strong>
                  {result.isReduced ? "Compression Output Ready" : "PDF Already Optimized"}
                </strong>
              </div>

              <div className="compress-stats-grid">
                <div className="stat-item">
                  <span className="stat-label">Original</span>
                  <span className="stat-val">{formatBytes(result.originalBytes)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Compressed</span>
                  <span className="stat-val">{formatBytes(result.outputBytes)}</span>
                </div>
                <div className="stat-item highlight">
                  <span className="stat-label">Savings</span>
                  <span className="stat-val">
                    {result.isReduced ? `−${result.percentSaved}%` : "0%"}
                  </span>
                </div>
              </div>

              {isOutdated && (
                <div className="outdated-warning-chip">
                  Settings changed since this result. Click below to recompress.
                </div>
              )}

              <div className="result-card-actions">
                <a
                  href={
                    result.isReduced
                      ? result.url
                      : file
                      ? URL.createObjectURL(file)
                      : "#"
                  }
                  download={
                    result.isReduced
                      ? result.filename
                      : fileInfo?.name || "document.pdf"
                  }
                  className="btn-download-result text-center"
                >
                  ⬇ {result.isReduced ? "Download Compressed PDF" : "Download Original File"}
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Desktop Sidebar Action / Summary Panel */}
        <aside className="tool-settings-sidebar compress-desktop-sidebar">
          <h2 className="sidebar-heading">Action Summary</h2>
          <div className="sidebar-summary-box">
            <div className="summary-row">
              <span className="summary-label">Document(s):</span>
              <strong className="summary-val">
                {isBatch ? `${items.length} PDF Documents` : fileInfo?.name}
              </strong>
            </div>
            <div className="summary-row">
              <span className="summary-label">Total pages:</span>
              <span className="summary-val">{totalPages}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Total size:</span>
              <span className="summary-val">{formatBytes(totalOriginalBytes)}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Preset:</span>
              <span className="summary-val capitalize">{preset.replace("-", " ")}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Strength:</span>
              <span className="summary-val">{strength}%</span>
            </div>
          </div>

          {jobStatus === "processing" ? (
            <button
              type="button"
              className="btn-cancel-action-large"
              onClick={handleCancelCompression}
            >
              Cancel compression
            </button>
          ) : (
            <button
              type="button"
              className="btn-create-pdf"
              onClick={handleStartCompression}
            >
              <CompressIcon className="btn-pdf-icon" />
              <span>
                {result && isOutdated
                  ? isBatch
                    ? `Compress ${items.length} PDFs (Updated)`
                    : "Compress with updated settings"
                  : result
                  ? isBatch
                    ? `Recompress ${items.length} PDFs`
                    : "Recompress PDF"
                  : isBatch
                  ? `Compress ${items.length} PDFs`
                  : "Compress PDF"}
              </span>
            </button>
          )}

          {result && (
            <button
              type="button"
              className="btn-secondary-action w-full mt-2"
              onClick={() => router.navigate({ toolId: "compress-pdf", stage: "result" })}
            >
              View full result screen →
            </button>
          )}
        </aside>
      </div>

      {/* Mobile Sticky Bottom Action Bar with Safe-Area Inset */}
      <div className="mobile-sticky-bottom-bar mobile-only">
        {jobStatus === "processing" ? (
          <div className="mobile-sticky-progress-row">
            <div className="mobile-progress-text">
              <span>
                Compressing… {batchProgress?.percent || progress?.percent || 0}%
              </span>
            </div>
            <button
              type="button"
              className="btn-mobile-cancel"
              onClick={handleCancelCompression}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn-mobile-create-pdf"
            onClick={handleStartCompression}
          >
            <CompressIcon className="btn-pdf-icon" />
            <span>
              {result && isOutdated
                ? isBatch
                  ? `Compress ${items.length} PDFs (Updated)`
                  : "Compress (Updated Settings)"
                : result
                ? isBatch
                  ? `Recompress ${items.length} PDFs`
                  : "Recompress PDF"
                : isBatch
                ? `Compress ${items.length} PDFs`
                : "Compress PDF"}
            </span>
          </button>
        )}
      </div>

      {/* Expanded Preview Modal */}
      <ExpandedPreviewModal
        isOpen={route.overlay === "preview"}
        onClose={() => router.closeOverlay()}
        previewImages={previewImages}
        isLoading={isPreviewLoading}
        currentPage={previewPage}
        totalPages={activePageCount}
        strength={strength}
        onPageChange={(p) => compressionSessionStore.setPreviewPage(p)}
        triggerRef={expandBtnRef}
      />
    </div>
  );
}
