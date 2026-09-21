import React, { useState, useRef } from "react";
import { inspectPdfFile, addPageNumbersToPdf, parsePageRange } from "../lib/pdfEngine";
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
  const [fontSize, setFontSize] = useState<number>(10);
  const [pageRange, setPageRange] = useState<string>("");
  const [targetScope, setTargetScope] = useState<"all" | "custom">("all");

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      setPageRange(`1-${info.pageCount}`);
      setDownloadUrl(null);
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
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadName(`${file.name.replace(/\.[^/.]+$/, "")}_numbered.pdf`);
    } catch (err) {
      setErrorMessage((err as Error).message || "Failed to add page numbers.");
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
          <h1 className="document-title">Page numbers</h1>
          <p className="tool-header-subtitle">
            Add clean, consistent numbering to your document pages.
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
            <NumberIcon className="dropzone-icon" />
          </div>
          <h3>Select a PDF for page numbers</h3>
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

            <div className="numbering-preview-box">
              <div className="preview-sheet-representation">
                <div className="dummy-sheet-lines">
                  <div className="dummy-line" />
                  <div className="dummy-line" />
                  <div className="dummy-line short" />
                </div>
                {/* Simulated Number Badge */}
                <div className={`preview-number-indicator pos-${position}`}>
                  {format === "page-x-of-y" ? `Page ${startNumber} of ${pageCount}` : `${startNumber}`}
                </div>
              </div>
              <p className="preview-caption">Position preview on page</p>
            </div>
          </div>

          <aside className="tool-settings-sidebar">
            <h2 className="sidebar-heading">Numbering options</h2>

            <div className="setting-group">
              <label className="setting-label">Format</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segment-btn ${format === "page-x-of-y" ? "active" : ""}`}
                  onClick={() => setFormat("page-x-of-y")}
                >
                  Page X of Y
                </button>
                <button
                  type="button"
                  className={`segment-btn ${format === "number" ? "active" : ""}`}
                  onClick={() => setFormat("number")}
                >
                  Number only
                </button>
              </div>
            </div>

            <div className="setting-group">
              <label className="setting-label">Position</label>
              <select
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
              <label className="setting-label">Starting number</label>
              <input
                type="number"
                min="1"
                className="setting-input"
                value={startNumber}
                onChange={(e) => setStartNumber(Math.max(1, parseInt(e.target.value, 10) || 1))}
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
                    placeholder="e.g. 1-10"
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn-create-pdf"
              onClick={handleApplyNumbers}
              disabled={isProcessing}
            >
              <NumberIcon className="btn-pdf-icon" />
              <span>{isProcessing ? "Adding Numbers…" : "Add Page Numbers"}</span>
            </button>

            {downloadUrl && (
              <div className="export-result-card">
                <div className="result-header">
                  <span className="result-check">✓</span>
                  <strong>Numbered PDF Ready!</strong>
                </div>
                <p className="result-meta">{downloadName}</p>
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="btn-download-result text-center"
                >
                  Download Numbered PDF
                </a>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
