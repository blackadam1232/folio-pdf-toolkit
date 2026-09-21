import React, { useState, useRef, useEffect, useMemo } from "react";
import { inspectPdfFile, addWatermarkToPdf, parsePageRange } from "../lib/pdfEngine";
import { renderPdfPage, RenderedPageResult } from "../lib/pdfRenderer";
import { StampIcon, PdfDocIcon } from "./Icons";
import { WatermarkPosition } from "../types";

interface WatermarkWorkspaceProps {
  onBackToHome: () => void;
}

export function WatermarkWorkspace({ onBackToHome }: WatermarkWorkspaceProps) {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [text, setText] = useState<string>("CONFIDENTIAL");
  const [fontSize, setFontSize] = useState<number>(48);
  const [opacity, setOpacity] = useState<number>(0.2);
  const [color, setColor] = useState<string>("#4A5553");
  const [position, setPosition] = useState<WatermarkPosition>("diagonal");
  const [pageRange, setPageRange] = useState<string>("");
  const [targetScope, setTargetScope] = useState<"all" | "custom">("all");

  const [previewPage, setPreviewPage] = useState<number>(1);
  const [renderedPage, setRenderedPage] = useState<RenderedPageResult | null>(null);
  const [isRenderingPage, setIsRenderingPage] = useState<boolean>(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Render actual PDF page content whenever file or preview page changes
  useEffect(() => {
    if (!file) {
      setRenderedPage(null);
      return;
    }
    let isCancelled = false;
    setIsRenderingPage(true);
    renderPdfPage(file, previewPage)
      .then((res) => {
        if (!isCancelled) {
          setRenderedPage(res);
          setIsRenderingPage(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error("Failed to render PDF page:", err);
          setIsRenderingPage(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [file, previewPage]);

  // Compute targeted pages in custom range mode
  const targetIndices = useMemo(() => {
    if (targetScope !== "custom" || !pageRange.trim() || pageCount === 0) {
      return null; // null means all pages
    }
    try {
      return parsePageRange(pageRange, pageCount);
    } catch {
      return [];
    }
  }, [targetScope, pageRange, pageCount]);

  const isCurrentPageIncluded = useMemo(() => {
    if (targetIndices === null) return true;
    return targetIndices.includes(previewPage - 1);
  }, [targetIndices, previewPage]);

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
      setRenderedPage(null);
      setPageRange(`1-${info.pageCount}`);
      setDownloadUrl(null);
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleApplyWatermark = async () => {
    if (!file) return;

    if (!text.trim()) {
      setErrorMessage("Please enter watermark text.");
      return;
    }

    setErrorMessage("");
    setIsProcessing(true);

    try {
      if (targetScope === "custom" && pageRange.trim()) {
        parsePageRange(pageRange, pageCount);
      }

      const bytes = await addWatermarkToPdf(file, {
        text: text.trim(),
        fontSize,
        color,
        opacity,
        angleDeg: position === "diagonal" ? 45 : 0,
        position,
        pageRange: targetScope === "custom" ? pageRange : undefined,
      });

      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadName(`${file.name.replace(/\.[^/.]+$/, "")}_watermarked.pdf`);
    } catch (err) {
      setErrorMessage((err as Error).message || "Failed to add watermark.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="folio-workspace tool-generic-workspace">
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
        <div>
          <h1 className="document-title">Watermark</h1>
          <p className="tool-header-subtitle">
            Add a protective or branding text watermark across your document pages.
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
            <StampIcon className="dropzone-icon" />
          </div>
          <h3>Select a PDF to watermark</h3>
          <p>Drag and drop a PDF file here, or click to choose from your device.</p>
        </div>
      ) : (
        <div className="tool-content-layout">
          <div className="tool-inspect-panel">
            <div className="file-hero-badge">
              <PdfDocIcon className="file-hero-icon" />
              <div className="file-hero-info">
                <h3>{file.name}</h3>
                <p>{pageCount} pages · {(file.size / 1024).toFixed(0)} KB</p>
              </div>
            </div>

            <div className="watermark-preview-box">
              {/* Page navigation controls */}
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

              {/* Real PDF Page Render with Watermark */}
              <div
                className="preview-real-sheet"
                style={{
                  aspectRatio: renderedPage
                    ? `${renderedPage.width} / ${renderedPage.height}`
                    : "210 / 297",
                }}
              >
                {renderedPage ? (
                  <img
                    src={renderedPage.dataUrl}
                    alt={`PDF Page ${previewPage}`}
                    className="preview-real-img"
                  />
                ) : (
                  <div className="preview-sheet-loading">
                    <div className="loading-spinner" />
                    <span>Rendering page {previewPage}…</span>
                  </div>
                )}

                {isRenderingPage && (
                  <div className="preview-updating-tag">Rendering…</div>
                )}

                {/* Simulated Watermark Text */}
                {isCurrentPageIncluded ? (
                  <div
                    className={`simulated-watermark-text pos-${position}`}
                    style={{
                      color,
                      opacity,
                      fontSize: `${fontSize * 0.4}px`,
                      transform:
                        position === "diagonal"
                          ? "translate(-50%, -50%) rotate(-45deg)"
                          : "none",
                    }}
                  >
                    {text || "WATERMARK"}
                  </div>
                ) : (
                  <div className="preview-excluded-pill">
                    Watermark omitted on page {previewPage}
                  </div>
                )}
              </div>

              <p className="preview-caption">
                {isCurrentPageIncluded
                  ? `Live preview: Page ${previewPage} with watermark`
                  : `Page ${previewPage} is excluded by custom range (${pageRange || "none"})`}
              </p>
            </div>
          </div>

          <aside className="tool-settings-sidebar">
            <h2 className="sidebar-heading">Watermark options</h2>

            <div className="setting-group">
              <label className="setting-label">Watermark text</label>
              <input
                type="text"
                className="setting-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="preset-chips">
                {["CONFIDENTIAL", "DRAFT", "SAMPLE", "COPY"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="chip-btn"
                    onClick={() => setText(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-group">
              <label className="setting-label">Placement</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segment-btn ${position === "diagonal" ? "active" : ""}`}
                  onClick={() => setPosition("diagonal")}
                >
                  Diagonal
                </button>
                <button
                  type="button"
                  className={`segment-btn ${position === "center" ? "active" : ""}`}
                  onClick={() => setPosition("center")}
                >
                  Center
                </button>
                <button
                  type="button"
                  className={`segment-btn ${position === "header" ? "active" : ""}`}
                  onClick={() => setPosition("header")}
                >
                  Header
                </button>
                <button
                  type="button"
                  className={`segment-btn ${position === "footer" ? "active" : ""}`}
                  onClick={() => setPosition("footer")}
                >
                  Footer
                </button>
              </div>
            </div>

            <div className="setting-group">
              <label className="setting-label">Opacity: {Math.round(opacity * 100)}%</label>
              <input
                type="range"
                min="0.05"
                max="0.8"
                step="0.05"
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className="setting-slider"
              />
            </div>

            <div className="setting-group">
              <label className="setting-label">Pages</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segment-btn ${targetScope === "all" ? "active" : ""}`}
                  onClick={() => setTargetScope("all")}
                >
                  All pages
                </button>
                <button
                  type="button"
                  className={`segment-btn ${targetScope === "custom" ? "active" : ""}`}
                  onClick={() => setTargetScope("custom")}
                >
                  Custom
                </button>
              </div>

              {targetScope === "custom" && (
                <div className="custom-range-input-wrap">
                  <input
                    type="text"
                    className="setting-input"
                    placeholder="e.g. 1-5"
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn-create-pdf"
              onClick={handleApplyWatermark}
              disabled={isProcessing}
            >
              <StampIcon className="btn-pdf-icon" />
              <span>{isProcessing ? "Applying…" : "Apply Watermark"}</span>
            </button>

            {downloadUrl && (
              <div className="export-result-card">
                <div className="result-header">
                  <span className="result-check">✓</span>
                  <strong>Watermarked PDF Ready!</strong>
                </div>
                <p className="result-meta">{downloadName}</p>
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="btn-download-result text-center"
                >
                  Download Watermarked PDF
                </a>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
