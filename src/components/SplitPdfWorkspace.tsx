import React, { useState, useRef } from "react";
import JSZip from "jszip";
import { inspectPdfFile, splitPdf, parsePageRange } from "../lib/pdfEngine";
import { ScissorsIcon, PdfDocIcon } from "./Icons";

interface SplitPdfWorkspaceProps {
  onBackToHome: () => void;
}

export function SplitPdfWorkspace({ onBackToHome }: SplitPdfWorkspaceProps) {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [rangeInput, setRangeInput] = useState<string>("1-2");
  const [exportMode, setExportMode] = useState<"single" | "zip">("single");
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
      setRangeInput(`1-${Math.min(3, info.pageCount)}`);
      setDownloadUrl(null);
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleSplit = async () => {
    if (!file) return;

    setErrorMessage("");
    setIsProcessing(true);

    try {
      // Validate range first
      const indices = parsePageRange(rangeInput, pageCount);
      if (!indices.length) {
        throw new Error("No valid pages specified in range.");
      }

      const { singlePdf, splitFiles } = await splitPdf(file, rangeInput);

      if (exportMode === "single") {
        const blob = new Blob([singlePdf.buffer as ArrayBuffer], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setDownloadName(`${file.name.replace(/\.[^/.]+$/, "")}_extracted.pdf`);
      } else {
        // Zip mode
        const zip = new JSZip();
        splitFiles.forEach((sf) => {
          zip.file(sf.name, sf.bytes);
        });
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(zipBlob);
        setDownloadUrl(url);
        setDownloadName(`${file.name.replace(/\.[^/.]+$/, "")}_split_pages.zip`);
      }
    } catch (err) {
      setErrorMessage((err as Error).message || "Failed to split PDF.");
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
            <h1 className="document-title">Split PDF</h1>
            <p className="tool-header-subtitle">
              Extract individual pages or ranges into separate PDF documents.
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
            <ScissorsIcon className="dropzone-icon" />
          </div>
          <h3>Select a PDF to split</h3>
          <p>Drag and drop a PDF here, or click to choose from your device.</p>
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

            <div className="split-helper-box">
              <h4>Range Syntax Examples</h4>
              <p><code>1-3, 5, 8-10</code> — Extracts pages 1, 2, 3, 5, 8, 9, and 10.</p>
              <p><code>1</code> — Extracts only page 1.</p>
              <p><code>2-{pageCount}</code> — Extracts from page 2 to the end of the document.</p>
            </div>
          </div>

          <aside className="tool-settings-sidebar">
            <h2 className="sidebar-heading">Split options</h2>

            <div className="setting-group">
              <label className="setting-label">Pages to extract</label>
              <input
                type="text"
                className="setting-input"
                placeholder="e.g. 1-3, 5"
                value={rangeInput}
                onChange={(e) => {
                  setRangeInput(e.target.value);
                  setDownloadUrl(null);
                }}
              />
              <span className="setting-hint">Document has {pageCount} pages total.</span>
            </div>

            <div className="setting-group">
              <label className="setting-label">Export format</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segment-btn ${exportMode === "single" ? "active" : ""}`}
                  onClick={() => setExportMode("single")}
                >
                  Single PDF
                </button>
                <button
                  type="button"
                  className={`segment-btn ${exportMode === "zip" ? "active" : ""}`}
                  onClick={() => setExportMode("zip")}
                >
                  ZIP (Individual)
                </button>
              </div>
            </div>

            <button
              type="button"
              className="btn-create-pdf"
              onClick={handleSplit}
              disabled={isProcessing || !rangeInput.trim()}
            >
              <ScissorsIcon className="btn-pdf-icon" />
              <span>{isProcessing ? "Extracting…" : "Extract Pages"}</span>
            </button>

            {downloadUrl && (
              <div className="export-result-card">
                <div className="result-header">
                  <span className="result-check">✓</span>
                  <strong>Extraction Ready!</strong>
                </div>
                <p className="result-meta">{downloadName}</p>
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="btn-download-result text-center"
                >
                  Download {exportMode === "zip" ? "ZIP Archive" : "Extracted PDF"}
                </a>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Mobile Sticky Bottom Action Bar */}
      {file && (
        <div className="mobile-bottom-bar mobile-only">
          <button
            type="button"
            className="btn-mobile-create-pdf"
            onClick={downloadUrl ? () => {
              const a = document.createElement("a");
              a.href = downloadUrl;
              a.download = downloadName;
              a.click();
            } : handleSplit}
            disabled={isProcessing || !rangeInput.trim()}
          >
            <ScissorsIcon className="btn-pdf-icon" />
            <span>
              {isProcessing
                ? "Extracting…"
                : downloadUrl
                ? `Download ${exportMode === "zip" ? "ZIP" : "PDF"}`
                : "Extract Pages"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
