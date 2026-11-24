import { ExportResult, ProcessingPanel, useToolOutput } from "./ExportFlow";
import { UploadZone } from "./UploadZone";
import React, { useState, useRef, useEffect, useMemo } from "react";
import { inspectPdfFile, addWatermarkToPdf, parsePageRange, pageRangeError } from "../lib/pdfEngine";
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
  const color = "#4A5553";
  const [position, setPosition] = useState<WatermarkPosition>("diagonal");
  const [pageRange, setPageRange] = useState<string>("");
  const [targetScope, setTargetScope] = useState<"all" | "custom">("all");

  const [previewPage, setPreviewPage] = useState<number>(1);
  const [renderedPage, setRenderedPage] = useState<RenderedPageResult | null>(null);
  const [isRenderingPage, setIsRenderingPage] = useState<boolean>(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const { output, finish, edit } = useToolOutput("watermark");

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
      finish({ blob, name: `${file.name.replace(/\.[^/.]+$/, "")}_watermarked.pdf`, pages: pageCount });
    } catch (err) {
      setErrorMessage((err as Error).message || "Failed to add watermark.");
    } finally {
      setIsProcessing(false);
    }
  };

  const disabledReason = !text.trim() ? "Enter watermark text." : file && targetScope === "custom" ? pageRangeError(pageRange, pageCount) : "";
  if (isProcessing) return <ProcessingPanel title="Applying watermark" />;
  if (output) return <ExportResult output={output} title="Watermarked PDF ready" onEdit={edit} />;

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
            <h1 className="document-title">Watermark</h1>
            <p className="tool-header-subtitle">
              Add a protective or branding text watermark across your document pages.
            </p>
          </div>
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
          <button type="button" aria-label="Dismiss error" onClick={() => setErrorMessage("")}>✕</button>
        </div>
      )}

      {!file ? (
        <UploadZone tool="watermark" title="Select a PDF to watermark" action="Choose PDF"
          onChoose={() => fileInputRef.current?.click()} onFiles={files => { if (files[0]) handleSelectFile(files[0]); }} />
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
                          : undefined,
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
              <label className="setting-label" htmlFor="watermark-watermark-text">Watermark text</label>
              <input id="watermark-watermark-text"
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
              <div className="segmented-control" role="group" aria-label="Placement">
                <button
                  type="button"
                  aria-pressed={position === "diagonal"}
                  className={`segment-btn ${position === "diagonal" ? "active" : ""}`}
                  onClick={() => setPosition("diagonal")}
                >
                  Diagonal
                </button>
                <button
                  type="button"
                  aria-pressed={position === "center"}
                  className={`segment-btn ${position === "center" ? "active" : ""}`}
                  onClick={() => setPosition("center")}
                >
                  Center
                </button>
                <button
                  type="button"
                  aria-pressed={position === "header"}
                  className={`segment-btn ${position === "header" ? "active" : ""}`}
                  onClick={() => setPosition("header")}
                >
                  Header
                </button>
                <button
                  type="button"
                  aria-pressed={position === "footer"}
                  className={`segment-btn ${position === "footer" ? "active" : ""}`}
                  onClick={() => setPosition("footer")}
                >
                  Footer
                </button>
              </div>
            </div>

            <div className="setting-group">
              <label className="setting-label" htmlFor="watermark-size">Text size · {fontSize} pt</label>
              <input id="watermark-size" className="setting-slider" type="range" min="10" max="96" step="1"
                value={fontSize} onChange={event => setFontSize(Number(event.target.value))} />
            </div>
            <div className="setting-group">
              <label className="setting-label" htmlFor="watermark-opacity">Opacity  {Math.round(opacity * 100)}%</label>
              <input
                type="range" id="watermark-opacity"
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
              <div className="segmented-control" role="group" aria-label="Pages">
                <button
                  type="button"
                  aria-pressed={targetScope === "all"}
                  className={`segment-btn ${targetScope === "all" ? "active" : ""}`}
                  onClick={() => setTargetScope("all")}
                >
                  All pages
                </button>
                <button
                  type="button"
                  aria-pressed={targetScope === "custom"}
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
                    aria-label="Page range"
                    className="setting-input"
                    placeholder="e.g. 1-5"
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                  />
                </div>
              )}
            </div>

            {disabledReason && <p className="field-error" role="status">{disabledReason}</p>}
            <button
              type="button"
              className="btn-create-pdf"
              onClick={handleApplyWatermark}
              disabled={Boolean(disabledReason)}
            >
              <StampIcon className="btn-pdf-icon" />
              <span>Apply Watermark</span>
            </button>
          </aside>
        </div>
      )}

      {/* Mobile Sticky Bottom Action Bar */}
      {file && (
        <div className="mobile-bottom-bar mobile-only">
          <button
            type="button"
            className="btn-mobile-create-pdf"
            onClick={handleApplyWatermark}
            disabled={Boolean(disabledReason)}
          >
            <StampIcon className="btn-pdf-icon" />
            <span>Apply Watermark</span>
          </button>
        </div>
      )}
    </div>
  );
}
