import React, { useState, useRef, useEffect, useMemo } from "react";
import { inspectPdfFile, rotatePdf, parsePageRange } from "../lib/pdfEngine";
import { renderPdfPage, RenderedPageResult } from "../lib/pdfRenderer";
import { RotateIcon, PdfDocIcon } from "./Icons";

interface RotatePdfWorkspaceProps {
  onBackToHome: () => void;
}

export function RotatePdfWorkspace({ onBackToHome }: RotatePdfWorkspaceProps) {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [angle, setAngle] = useState<90 | 180 | 270>(90);
  const [targetScope, setTargetScope] = useState<"all" | "custom">("all");
  const [customRange, setCustomRange] = useState<string>("1");

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
    if (targetScope !== "custom" || !customRange.trim() || pageCount === 0) {
      return null; // null means all pages
    }
    try {
      return parsePageRange(customRange, pageCount);
    } catch {
      return [];
    }
  }, [targetScope, customRange, pageCount]);

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
      setCustomRange(`1-${info.pageCount}`);
      setDownloadUrl(null);
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleRotate = async () => {
    if (!file) return;

    setErrorMessage("");
    setIsProcessing(true);

    try {
      let pageIndices: number[] | undefined = undefined;
      if (targetScope === "custom") {
        pageIndices = parsePageRange(customRange, pageCount);
      }

      const rotatedBytes = await rotatePdf(file, angle, pageIndices);
      const blob = new Blob([rotatedBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadName(`${file.name.replace(/\.[^/.]+$/, "")}_rotated.pdf`);
    } catch (err) {
      setErrorMessage((err as Error).message || "Failed to rotate PDF.");
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
          <h1 className="document-title">Rotate pages</h1>
          <p className="tool-header-subtitle">
            Turn pages clockwise or upside-down to ensure consistent reading orientation.
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
            <RotateIcon className="dropzone-icon" />
          </div>
          <h3>Select a PDF to rotate</h3>
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

            <div className="rotate-preview-visual">
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

              {/* Real PDF Page Render with Rotation */}
              <div className="rotate-stage-container">
                <div
                  className="rotate-real-sheet-wrap"
                  style={{
                    transform: isCurrentPageIncluded ? `rotate(${angle}deg)` : "none",
                  }}
                >
                  {renderedPage ? (
                    <img
                      src={renderedPage.dataUrl}
                      alt={`Page ${previewPage}`}
                      className="rotate-real-img"
                      style={{
                        aspectRatio: `${renderedPage.width} / ${renderedPage.height}`,
                      }}
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
                </div>

                <div className="rotate-angle-tag">
                  {isCurrentPageIncluded ? `${angle}°` : "0° (skipped)"}
                </div>
              </div>

              <p className="rotate-caption">
                {isCurrentPageIncluded
                  ? `Live preview: Page ${previewPage} rotated ${angle}° clockwise`
                  : `Page ${previewPage} remains unchanged (excluded by specific pages)`}
              </p>
            </div>
          </div>

          <aside className="tool-settings-sidebar">
            <h2 className="sidebar-heading">Rotation settings</h2>

            <div className="setting-group">
              <label className="setting-label">Angle</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segment-btn ${angle === 90 ? "active" : ""}`}
                  onClick={() => setAngle(90)}
                >
                  90°
                </button>
                <button
                  type="button"
                  className={`segment-btn ${angle === 180 ? "active" : ""}`}
                  onClick={() => setAngle(180)}
                >
                  180°
                </button>
                <button
                  type="button"
                  className={`segment-btn ${angle === 270 ? "active" : ""}`}
                  onClick={() => setAngle(270)}
                >
                  270°
                </button>
              </div>
            </div>

            <div className="setting-group">
              <label className="setting-label">Target pages</label>
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
                  Specific pages
                </button>
              </div>

              {targetScope === "custom" && (
                <div className="custom-range-input-wrap">
                  <input
                    type="text"
                    className="setting-input"
                    placeholder="e.g. 1, 3, 5-7"
                    value={customRange}
                    onChange={(e) => setCustomRange(e.target.value)}
                  />
                  <span className="setting-hint">Document has {pageCount} pages</span>
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn-create-pdf"
              onClick={handleRotate}
              disabled={isProcessing}
            >
              <RotateIcon className="btn-pdf-icon" />
              <span>{isProcessing ? "Rotating…" : "Rotate PDF"}</span>
            </button>

            {downloadUrl && (
              <div className="export-result-card">
                <div className="result-header">
                  <span className="result-check">✓</span>
                  <strong>Rotation Complete!</strong>
                </div>
                <p className="result-meta">{downloadName}</p>
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="btn-download-result text-center"
                >
                  Download Rotated PDF
                </a>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
