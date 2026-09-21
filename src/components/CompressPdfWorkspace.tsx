import React, { useRef, useState, useMemo, useEffect } from "react";
import { CompressionPreset, CompressionResult } from "../types";
import {
  useCompressionSession,
  compressionSessionStore,
} from "../lib/compressionSessionStore";
import { useRouter, router } from "../lib/router";
import { mapStrengthToSettings } from "../lib/compressEngine";
import { CompressIcon, PdfDocIcon, CheckIcon } from "./Icons";
import { ExpandedPreviewModal } from "./ExpandedPreviewModal";

interface CompressPdfWorkspaceProps {
  onBackToHome: () => void;
}

export function CompressPdfWorkspace({ onBackToHome }: CompressPdfWorkspaceProps) {
  const route = useRouter();
  const session = useCompressionSession();
  const {
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
    result,
    isOutdated,
    errorMessage,
  } = session;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const expandBtnRef = useRef<HTMLButtonElement | null>(null);
  const [jumpPage, setJumpPage] = useState<string>("1");

  // Keep jump page in sync with preview page
  useEffect(() => {
    setJumpPage(String(previewPage));
  }, [previewPage]);

  // Handler for file selection
  const handleSelectFile = async (selectedFile: File) => {
    const success = await compressionSessionStore.setFile(selectedFile);
    if (success) {
      router.navigate({ toolId: "compress-pdf", stage: "editor" });
    }
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

  // Handler for starting compression
  const handleStartCompression = () => {
    if (!file || jobStatus === "processing") return;

    // Navigate to processing screen
    router.navigate({ toolId: "compress-pdf", stage: "processing" });

    compressionSessionStore.startCompression(undefined, (completedResult) => {
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

  const totalPages = fileInfo?.pageCount || 1;

  // Handle jump page submission
  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpPage, 10);
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      compressionSessionStore.setPreviewPage(p);
    } else {
      setJumpPage(String(previewPage));
    }
  };

  // 1. RECOVERY VIEW: If user refreshed on editor/processing/result with no file in memory
  if (!file && (route.stage === "editor" || route.stage === "processing" || route.stage === "result")) {
    return (
      <div className="folio-workspace tool-generic-workspace compress-workspace">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files?.[0]) handleSelectFile(e.target.files[0]);
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
          <h3>Select your PDF to continue</h3>
          <p>
            Your previous browser session was reset or refreshed. Files are kept privately in temporary device memory.
          </p>
          <div className="reconnect-actions">
            <button
              type="button"
              className="btn-primary-action"
              onClick={() => fileInputRef.current?.click()}
            >
              Select PDF File
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
  if (!file || route.stage === "upload") {
    return (
      <div className="folio-workspace tool-generic-workspace compress-workspace">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files?.[0]) handleSelectFile(e.target.files[0]);
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
                Reduce file size while preserving text, vectors, and image clarity.
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
            if (e.dataTransfer.files?.[0]) handleSelectFile(e.dataTransfer.files[0]);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
          aria-label="Upload PDF file"
        >
          <div className="dropzone-art">
            <CompressIcon className="dropzone-icon" />
          </div>
          <h3>Select a PDF to compress</h3>
          <p>Drag and drop a PDF file here, or click to choose from your device.</p>
          <button type="button" className="btn-primary-action btn-choose-file">
            Choose PDF File
          </button>
        </div>
      </div>
    );
  }

  // 3. PROCESSING STAGE: Dedicated progress screen
  if (route.stage === "processing") {
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
              <h1 className="document-title">Compressing PDF…</h1>
              <p className="tool-header-subtitle">
                {fileInfo?.name} · {strength}% compression strength
              </p>
            </div>
          </div>
        </div>

        <div className="processing-hero-card">
          <div className="processing-animation-ring">
            <div className="spinner-large" />
          </div>

          <h2 className="processing-title">
            {progress?.status || "Optimizing embedded images…"}
          </h2>
          <p className="processing-sub">
            Processing locally on your device. Original text and vector lines stay completely intact.
          </p>

          <div className="processing-meter-box">
            <div className="progress-status-row">
              <span className="progress-status-text">
                {progress?.status || "Processing…"}
              </span>
              <span className="progress-percent-text">
                {progress?.percent || 0}%
              </span>
            </div>
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: `${progress?.percent || 5}%` }}
                role="progressbar"
                aria-valuenow={progress?.percent || 0}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>

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

  // 4. RESULT STAGE: Dedicated Result Screen
  if (route.stage === "result" && result) {
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
              <p className="tool-header-subtitle">
                {fileInfo?.name}
              </p>
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
              <span className="stat-val">{(result.originalBytes / 1024).toFixed(0)} KB</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Output size</span>
              <span className="stat-val">{(result.outputBytes / 1024).toFixed(0)} KB</span>
            </div>
            <div className="stat-item highlight">
              <span className="stat-label">Savings</span>
              <span className="stat-val">{result.isReduced ? `−${result.percentSaved}%` : "0%"}</span>
            </div>
          </div>

          {isOutdated && (
            <div className="outdated-warning-chip result-outdated-banner">
              ⚠ Settings were changed since this file was generated.
            </div>
          )}

          <div className="result-cta-group">
            <a
              href={result.isReduced ? result.url : (file ? URL.createObjectURL(file) : "#")}
              download={result.isReduced ? result.filename : (fileInfo?.name || "document.pdf")}
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

  // 5. EDITOR STAGE: The Main Mobile Compression Redesign
  return (
    <div className="folio-workspace tool-generic-workspace compress-workspace editor-workspace">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files?.[0]) handleSelectFile(e.target.files[0]);
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
              Adjust compression settings and preview changes before saving.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn-change-file"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Change current PDF file"
        >
          Change PDF
        </button>
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

      {/* Background Processing Indicator banner (if user backed out during processing) */}
      {jobStatus === "processing" && progress && (
        <div className="bg-processing-banner" role="status">
          <div className="bg-processing-left">
            <div className="spinner-small" />
            <div className="bg-processing-text">
              <strong>Compression running in background…</strong>
              <span>{progress.status} ({progress.percent}%)</span>
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
          {/* 2. Filename, Original Size, and Page Count Badge */}
          <div className="file-hero-badge">
            <PdfDocIcon className="file-hero-icon" />
            <div className="file-hero-info">
              <h3 className="file-hero-title">{fileInfo?.name}</h3>
              <p className="file-hero-meta">
                {fileInfo?.pageCount} {fileInfo?.pageCount === 1 ? "page" : "pages"} ·{" "}
                {((fileInfo?.size || 0) / 1024).toFixed(0)} KB
                {(fileInfo?.size || 0) > 1024 * 1024 &&
                  ` (${((fileInfo?.size || 0) / (1024 * 1024)).toFixed(2)} MB)`}
              </p>
            </div>
          </div>

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
              Strength sets image downsampling and quality targets. This percentage does not guarantee an identical reduction in file size.
            </p>

            <div className="engine-mapping-pill">
              <span>Quality Target: ~{Math.round(quality * 100)}%</span>
              <span>Max Dimension: {maxDimension}px</span>
            </div>
          </div>

          {/* 5. Compact Optional Preview */}
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

              <button
                ref={expandBtnRef}
                type="button"
                className="btn-expand-preview"
                onClick={() => router.openOverlay("preview")}
                title="Open full comparison view"
                aria-label="Expand preview comparison"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
                <span>Expand</span>
              </button>
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
                  alt={`Page ${previewPage} ${previewViewMode === "compressed" ? "compressed preview" : "original"}`}
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
                  Page {previewPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn-preview-nav"
                  disabled={previewPage >= totalPages}
                  onClick={() => compressionSessionStore.setPreviewPage(previewPage + 1)}
                  aria-label="Next page"
                >
                  Next →
                </button>
              </div>

              {totalPages > 1 && (
                <form onSubmit={handleJumpSubmit} className="jump-page-form">
                  <label htmlFor="jump-input" className="jump-label">Jump to:</label>
                  <input
                    id="jump-input"
                    type="number"
                    min="1"
                    max={totalPages}
                    value={jumpPage}
                    onChange={(e) => setJumpPage(e.target.value)}
                    className="jump-page-input"
                    aria-label="Jump to page number"
                  />
                  <button type="submit" className="btn-jump-go">Go</button>
                </form>
              )}
            </div>

            {/* Multi-page Thumbnail Strip (Supports up to 100 pages) */}
            {totalPages > 1 && (
              <div className="thumbnail-overview-strip" role="tablist" aria-label="Page selection">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
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
                ))}
              </div>
            )}

            <p className="preview-caption">
              Sample preview (Page {previewPage}). Shows simulated image downsampling at strength {strength}%. Text and vector shapes are unaffected.
            </p>
          </div>

          {/* 6. Progress or Result Details Card */}
          {result && jobStatus !== "processing" && (
            <div className={`export-result-card compress-result-card ${!result.isReduced ? "result-no-reduction" : ""}`}>
              <div className="result-header">
                <span className="result-check">{result.isReduced ? "✓" : "ℹ"}</span>
                <strong>
                  {result.isReduced ? "Compression Output Ready" : "PDF Already Optimized"}
                </strong>
              </div>

              <div className="compress-stats-grid">
                <div className="stat-item">
                  <span className="stat-label">Original</span>
                  <span className="stat-val">{(result.originalBytes / 1024).toFixed(0)} KB</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Compressed</span>
                  <span className="stat-val">{(result.outputBytes / 1024).toFixed(0)} KB</span>
                </div>
                <div className="stat-item highlight">
                  <span className="stat-label">Savings</span>
                  <span className="stat-val">{result.isReduced ? `−${result.percentSaved}%` : "0%"}</span>
                </div>
              </div>

              {isOutdated && (
                <div className="outdated-warning-chip">
                  Settings changed since this result. Click below to recompress.
                </div>
              )}

              <div className="result-card-actions">
                <a
                  href={result.isReduced ? result.url : (file ? URL.createObjectURL(file) : "#")}
                  download={result.isReduced ? result.filename : (fileInfo?.name || "document.pdf")}
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
              <span className="summary-label">Document:</span>
              <strong className="summary-val">{fileInfo?.name}</strong>
            </div>
            <div className="summary-row">
              <span className="summary-label">Pages:</span>
              <span className="summary-val">{totalPages}</span>
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
                  ? "Compress with updated settings"
                  : result
                  ? "Recompress PDF"
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

      {/* 7. Mobile Sticky Bottom Action Bar with Safe-Area Inset */}
      <div className="mobile-sticky-bottom-bar mobile-only">
        {jobStatus === "processing" ? (
          <div className="mobile-sticky-progress-row">
            <div className="mobile-progress-text">
              <span>Compressing… {progress?.percent || 0}%</span>
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
                ? "Compress (Updated Settings)"
                : result
                ? "Recompress PDF"
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
        totalPages={totalPages}
        strength={strength}
        onPageChange={(p) => compressionSessionStore.setPreviewPage(p)}
        triggerRef={expandBtnRef}
      />
    </div>
  );
}
