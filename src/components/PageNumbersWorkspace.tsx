import { ExportResult, ProcessingPanel, useToolOutput } from "./ExportFlow";
import { UploadZone } from "./UploadZone";
import React, { useState, useRef, useEffect, useMemo } from "react";
import { inspectPdfFile, addPageNumbersToPdf, parsePageRange, pageRangeError } from "../lib/pdfEngine";
import { renderPdfPage, RenderedPageResult } from "../lib/pdfRenderer";
import { NumberIcon, PdfDocIcon } from "./Icons";
import { PageNumberPosition } from "../types";

interface PageNumbersWorkspaceProps {
  onBackToHome: () => void;
}

export function PageNumbersWorkspace({ onBackToHome }: PageNumbersWorkspaceProps) {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [position, setPosition] = useState<PageNumberPosition>("bottom-center");
  const [format, setFormat] = useState<"number" | "page-x-of-y">("page-x-of-y");
  const [startNumber, setStartNumber] = useState<number>(1);
  const fontSize = 10;
  const [pageRange, setPageRange] = useState<string>("");
  const [targetScope, setTargetScope] = useState<"all" | "custom">("all");

  const [previewPage, setPreviewPage] = useState<number>(1);
  const [renderedPage, setRenderedPage] = useState<RenderedPageResult | null>(null);
  const [isRenderingPage, setIsRenderingPage] = useState<boolean>(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const { output, finish, edit } = useToolOutput("page-numbers");

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
  const customTargetIndices = useMemo(() => {
    if (targetScope !== "custom" || !pageRange.trim() || pageCount === 0) {
      return null; // null represents all pages
    }
    try {
      return parsePageRange(pageRange, pageCount);
    } catch {
      return [];
    }
  }, [targetScope, pageRange, pageCount]);

  // Whether currently inspected page is included in the numbering
  const isCurrentPageIncluded = useMemo(() => {
    if (customTargetIndices === null) return true;
    return customTargetIndices.includes(previewPage - 1);
  }, [customTargetIndices, previewPage]);

  // Calculated sequential number for the currently previewed page
  const computedPageNumber = useMemo(() => {
    if (!isCurrentPageIncluded) return null;
    if (customTargetIndices === null) {
      return startNumber + (previewPage - 1);
    }
    const idxInTargets = customTargetIndices.indexOf(previewPage - 1);
    return startNumber + idxInTargets;
  }, [isCurrentPageIncluded, customTargetIndices, previewPage, startNumber]);

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

  const handleApplyNumbers = async () => {
    if (!file) return;

    setErrorMessage("");
    setIsProcessing(true);

    try {
      if (targetScope === "custom" && pageRange.trim()) {
        parsePageRange(pageRange, pageCount);
      }

      const bytes = await addPageNumbersToPdf(file, {
        position,
        format,
        startNumber,
        fontSize,
        pageRange: targetScope === "custom" ? pageRange : undefined,
      });

      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
      finish({ blob, name: `${file.name.replace(/\.[^/.]+$/, "")}_numbered.pdf`, pages: pageCount });
    } catch (err) {
      setErrorMessage((err as Error).message || "Failed to add page numbers.");
    } finally {
      setIsProcessing(false);
    }
  };

  const disabledReason = file && targetScope === "custom" ? pageRangeError(pageRange, pageCount) : "";
  if (isProcessing) return <ProcessingPanel title="Adding page numbers" />;
  if (output) return <ExportResult output={output} title="Numbered PDF ready" onEdit={edit} />;

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
            <h1 className="document-title">Page numbers</h1>
            <p className="tool-header-subtitle">
              Add clean, consistent numbering to your document pages.
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
        <UploadZone tool="page-numbers" title="Select a PDF for page numbers" action="Choose PDF"
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

            <div className="numbering-preview-box">
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

              {/* Real PDF Page Render */}
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

                {/* Number Overlay or Excluded Badge */}
                {isCurrentPageIncluded && computedPageNumber !== null ? (
                  <div className={`preview-number-indicator pos-${position}`}>
                    {format === "page-x-of-y"
                      ? `Page ${computedPageNumber} of ${pageCount}`
                      : `${computedPageNumber}`}
                  </div>
                ) : (
                  <div className="preview-excluded-pill">
                    Page {previewPage} excluded from numbering
                  </div>
                )}
              </div>

              <p className="preview-caption">
                {isCurrentPageIncluded
                  ? `Live preview: Page ${previewPage} will be numbered as ${
                      format === "page-x-of-y"
                        ? `Page ${computedPageNumber} of ${pageCount}`
                        : computedPageNumber
                    }`
                  : `Page ${previewPage} is excluded by custom range (${pageRange || "none"})`}
              </p>
            </div>
          </div>

          <aside className="tool-settings-sidebar">
            <h2 className="sidebar-heading">Numbering options</h2>

            <div className="setting-group">
              <label className="setting-label">Format</label>
              <div className="segmented-control" role="group" aria-label="Format">
                <button
                  type="button"
                  aria-pressed={format === "page-x-of-y"}
                  className={`segment-btn ${format === "page-x-of-y" ? "active" : ""}`}
                  onClick={() => setFormat("page-x-of-y")}
                >
                  Page X of Y
                </button>
                <button
                  type="button"
                  aria-pressed={format === "number"}
                  className={`segment-btn ${format === "number" ? "active" : ""}`}
                  onClick={() => setFormat("number")}
                >
                  Number only
                </button>
              </div>
            </div>

            <div className="setting-group">
              <label className="setting-label" htmlFor="page-numbers-position">Position</label>
              <select id="page-numbers-position"
                className="setting-select"
                value={position}
                onChange={(e) => setPosition(e.target.value as PageNumberPosition)}
              >
                <option value="bottom-center">Bottom Center</option>
                <option value="bottom-right">Bottom Right</option>
                <option value="top-center">Top Center</option>
                <option value="top-right">Top Right</option>
              </select>
            </div>

            <div className="setting-group">
              <label className="setting-label" htmlFor="page-numbers-starting-number">Starting number</label>
              <input id="page-numbers-starting-number"
                type="number"
                min="1"
                className="setting-input"
                value={startNumber}
                onChange={(e) => setStartNumber(Math.max(1, parseInt(e.target.value, 10) || 1))}
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
                    placeholder="e.g. 1-10"
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
              onClick={handleApplyNumbers}
              disabled={Boolean(disabledReason)}
            >
              <NumberIcon className="btn-pdf-icon" />
              <span>Apply Page Numbers</span>
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
            onClick={handleApplyNumbers}
            disabled={Boolean(disabledReason)}
          >
            <NumberIcon className="btn-pdf-icon" />
            <span>Apply Page Numbers</span>
          </button>
        </div>
      )}
    </div>
  );
}
