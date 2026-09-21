import React, { useState, useRef, useEffect, useMemo } from "react";
import { inspectPdfFile } from "../lib/pdfEngine";
import {
  compressPdf,
  generateCompressionPreview,
  mapStrengthToSettings,
  getPresetForStrength,
} from "../lib/compressEngine";
import { CompressionPreset, CompressionResult } from "../types";
import { CompressIcon, PdfDocIcon, CheckIcon } from "./Icons";

interface CompressPdfWorkspaceProps {
  onBackToHome: () => void;
}

export function CompressPdfWorkspace({ onBackToHome }: CompressPdfWorkspaceProps) {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);

  // Compression controls state
  const [preset, setPreset] = useState<CompressionPreset>("balanced");
  const [strength, setStrength] = useState<number>(50); // 1-100%

  // Comparison preview state
  const [previewPage, setPreviewPage] = useState<number>(1);
  const [previewViewMode, setPreviewViewMode] = useState<"split" | "original" | "compressed">("split");
  const [previewImages, setPreviewImages] = useState<{ originalUrl: string; compressedUrl: string } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);

  // Processing & progress
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ percent: number; status: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [isOutdated, setIsOutdated] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const previewDebounceRef = useRef<any>(null);

  // Mark result outdated when settings change
  const handleSettingChange = (newStrength: number, newPreset?: CompressionPreset) => {
    const clamped = Math.max(1, Math.min(100, newStrength));
    setStrength(clamped);
    if (newPreset) {
      setPreset(newPreset);
    } else {
      setPreset(getPresetForStrength(clamped));
    }
    if (result) {
      setIsOutdated(true);
    }
  };

  const handleSelectPreset = (p: CompressionPreset) => {
    if (p === "high-quality") {
      handleSettingChange(20, "high-quality");
    } else if (p === "balanced") {
      handleSettingChange(50, "balanced");
    } else if (p === "smallest") {
      handleSettingChange(85, "smallest");
    }
  };

  const handleSelectFile = async (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith(".pdf")) {
      setErrorMessage("Please select a valid .pdf file.");
      return;
    }
    setErrorMessage("");
    try {
      const info = await inspectPdfFile(selectedFile);
      setFile(selectedFile);
      setPageCount(info.pageCount);
      setPreviewPage(1);
      setResult(null);
      setIsOutdated(false);
      setPreviewImages(null);
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  // Debounced before/after preview generation
  useEffect(() => {
    if (!file) {
      setPreviewImages(null);
      return;
    }

    if (previewDebounceRef.current) {
      clearTimeout(previewDebounceRef.current);
    }

    setIsPreviewLoading(true);
    previewDebounceRef.current = setTimeout(() => {
      generateCompressionPreview(file, previewPage, strength)
        .then((res) => {
          setPreviewImages(res);
          setIsPreviewLoading(false);
        })
        .catch((err) => {
          console.warn("Preview generation error:", err);
          setIsPreviewLoading(false);
        });
    }, 280);

    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    };
  }, [file, previewPage, strength]);

  // Execute actual compression
  const handleCompress = async () => {
    if (!file) return;

    setErrorMessage("");
    setIsProcessing(true);
    setProgress({ percent: 0, status: "Preparing compression…" });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await compressPdf(
        file,
        strength,
        (p) => setProgress(p),
        controller.signal
      );
      setResult(res);
      setIsOutdated(false);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("cancelled")) {
        setErrorMessage("Compression was cancelled.");
      } else {
        setErrorMessage(msg || "Failed to compress PDF.");
      }
    } finally {
      setIsProcessing(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const { quality, maxDimension } = useMemo(() => {
    return mapStrengthToSettings(strength);
  }, [strength]);

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

      {/* Header */}
      <div className="tool-workspace-header">
        <div>
          <h1 className="document-title">Compress PDF</h1>
          <p className="tool-header-subtitle">
            Reduce file size while preserving text, vectors, and image clarity.
          </p>
        </div>
        {file && (
          <button
            type="button"
            className="btn-add-images"
            onClick={() => fileInputRef.current?.click()}
          >
            Change PDF
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="error-banner" role="alert">
          <span>⚠ {errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage("")}>✕</button>
        </div>
      )}

      {!file ? (
        <div
          className="empty-dropzone"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files?.[0]) handleSelectFile(e.dataTransfer.files[0]);
          }}
        >
          <div className="dropzone-art">
            <CompressIcon className="dropzone-icon" />
          </div>
          <h3>Select a PDF to compress</h3>
          <p>Drag and drop a PDF file here, or click to choose from your device.</p>
        </div>
      ) : (
        <div className="tool-content-layout">
          {/* Main Inspection & Comparison Panel */}
          <div className="tool-inspect-panel">
            <div className="file-hero-badge">
              <PdfDocIcon className="file-hero-icon" />
              <div className="file-hero-info">
                <h3>{file.name}</h3>
                <p>
                  {pageCount} {pageCount === 1 ? "page" : "pages"} ·{" "}
                  {(file.size / 1024).toFixed(0)} KB
                  {file.size > 1024 * 1024 && ` (${(file.size / (1024 * 1024)).toFixed(2)} MB)`}
                </p>
              </div>
            </div>

            {/* Comparison Stage */}
            <div className="compress-comparison-box">
              {/* Top Navigation & View Mode Header */}
              <div className="compress-preview-header">
                <div className="preview-nav-bar">
                  <button
                    type="button"
                    className="btn-preview-nav"
                    disabled={previewPage <= 1}
                    onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                    title="Previous page"
                  >
                    ← Prev
                  </button>
                  <span className="preview-page-indicator">
                    Page {previewPage} of {pageCount}
                  </span>
                  <button
                    type="button"
                    className="btn-preview-nav"
                    disabled={previewPage >= pageCount}
                    onClick={() => setPreviewPage((p) => Math.min(pageCount, p + 1))}
                    title="Next page"
                  >
                    Next →
                  </button>
                </div>

                <div className="segmented-control mode-selector">
                  <button
                    type="button"
                    className={`segment-btn ${previewViewMode === "split" ? "active" : ""}`}
                    onClick={() => setPreviewViewMode("split")}
                  >
                    Side-by-side
                  </button>
                  <button
                    type="button"
                    className={`segment-btn ${previewViewMode === "original" ? "active" : ""}`}
                    onClick={() => setPreviewViewMode("original")}
                  >
                    Original
                  </button>
                  <button
                    type="button"
                    className={`segment-btn ${previewViewMode === "compressed" ? "active" : ""}`}
                    onClick={() => setPreviewViewMode("compressed")}
                  >
                    Preview ({strength}%)
                  </button>
                </div>
              </div>

              {/* Preview Cards */}
              <div className={`comparison-stage mode-${previewViewMode}`}>
                {(previewViewMode === "split" || previewViewMode === "original") && (
                  <div className="comparison-card">
                    <div className="comparison-card-badge">Original (Page {previewPage})</div>
                    <div className="comparison-img-wrap">
                      {previewImages ? (
                        <img
                          src={previewImages.originalUrl}
                          alt="Original page"
                          className="comparison-img"
                        />
                      ) : (
                        <div className="preview-sheet-loading">
                          <div className="loading-spinner" />
                          <span>Loading original page…</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(previewViewMode === "split" || previewViewMode === "compressed") && (
                  <div className="comparison-card">
                    <div className="comparison-card-badge badge-compressed">
                      Optimized Preview (Strength {strength}%)
                    </div>
                    <div className="comparison-img-wrap">
                      {previewImages ? (
                        <img
                          src={previewImages.compressedUrl}
                          alt="Compressed page preview"
                          className="comparison-img"
                        />
                      ) : (
                        <div className="preview-sheet-loading">
                          <div className="loading-spinner" />
                          <span>Generating sample preview…</span>
                        </div>
                      )}
                      {isPreviewLoading && (
                        <div className="preview-updating-tag">Updating preview…</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <p className="preview-caption">
                Sample preview (Page {previewPage}) — not final output. Shows simulated image downsampling at strength {strength}%.
              </p>
            </div>
          </div>

          {/* Right Sidebar: Compression Controls */}
          <aside className="tool-settings-sidebar compress-sidebar">
            <h2 className="sidebar-heading">Compression settings</h2>

            {/* Presets */}
            <div className="setting-group">
              <label className="setting-label">Presets</label>
              <div className="preset-card-group">
                <button
                  type="button"
                  className={`preset-card-btn ${preset === "high-quality" ? "active" : ""}`}
                  onClick={() => handleSelectPreset("high-quality")}
                >
                  <div className="preset-card-title">High quality</div>
                  <div className="preset-card-desc">Prioritize image detail; gentle compression (20%)</div>
                </button>
                <button
                  type="button"
                  className={`preset-card-btn ${preset === "balanced" ? "active" : ""}`}
                  onClick={() => handleSelectPreset("balanced")}
                >
                  <div className="preset-card-title">Balanced</div>
                  <div className="preset-card-desc">Balance image quality and file size (50%)</div>
                </button>
                <button
                  type="button"
                  className={`preset-card-btn ${preset === "smallest" ? "active" : ""}`}
                  onClick={() => handleSelectPreset("smallest")}
                >
                  <div className="preset-card-title">Smallest file</div>
                  <div className="preset-card-desc">Stronger compression, visible detail loss accepted (85%)</div>
                </button>
              </div>
            </div>

            {/* Compression Strength Slider */}
            <div className="setting-group slider-setting-group">
              <div className="slider-header-row">
                <label className="setting-label" htmlFor="compression-slider">
                  Compression strength
                </label>
                <div className="slider-input-sync">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={strength}
                    aria-label="Compression strength percentage"
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) handleSettingChange(val);
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
                onChange={(e) => handleSettingChange(parseInt(e.target.value, 10))}
                className="folio-range-slider"
              />

              <div className="slider-endpoints-row">
                <span className="endpoint-label">Better quality (1%)</span>
                <span className="endpoint-label">Smaller file (100%)</span>
              </div>

              <p className="slider-explanation">
                Higher strength prioritizes smaller files and may reduce image detail. This percentage is not a guaranteed reduction in file size.
              </p>

              {/* Technical mapping info */}
              <div className="engine-mapping-pill">
                <span>Target Quality: ~{Math.round(quality * 100)}%</span>
                <span>Max Resolution: {maxDimension}px</span>
              </div>
            </div>

            {/* Progress Bar (during processing) */}
            {isProcessing && progress && (
              <div className="compression-progress-box">
                <div className="progress-status-row">
                  <span className="progress-status-text">{progress.status}</span>
                  <span className="progress-percent-text">{progress.percent}%</span>
                </div>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <button
                  type="button"
                  className="btn-cancel-action"
                  onClick={handleCancel}
                >
                  Cancel compression
                </button>
              </div>
            )}

            {/* Primary Action: Compress Button */}
            {!isProcessing && (
              <button
                type="button"
                className="btn-create-pdf"
                onClick={handleCompress}
                disabled={isProcessing}
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

            {/* Results Card */}
            {result && !isProcessing && (
              <div className={`export-result-card compress-result-card ${!result.isReduced ? "result-no-reduction" : ""}`}>
                <div className="result-header">
                  <span className="result-check">{result.isReduced ? "✓" : "ℹ"}</span>
                  <strong>
                    {result.isReduced ? "Compression Complete!" : "PDF Already Optimized"}
                  </strong>
                </div>

                <div className="compress-stats-grid">
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

                {!result.isReduced ? (
                  <p className="no-reduction-notice">
                    These settings did not reduce this PDF. It may already be optimized.
                  </p>
                ) : (
                  <p className="reduction-success-notice">
                    Preserved all {result.pageCount} pages and text. Embedded images optimized at {result.strength}% strength.
                  </p>
                )}

                {isOutdated && (
                  <div className="outdated-warning-chip">
                    Settings changed since last run. Click above to apply.
                  </div>
                )}

                <a
                  href={result.isReduced ? result.url : URL.createObjectURL(file)}
                  download={result.isReduced ? result.filename : file.name}
                  className="btn-download-result text-center"
                >
                  {result.isReduced ? "Download Compressed PDF" : "Download Original File"}
                </a>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
