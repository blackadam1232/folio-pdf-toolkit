import { ExportResult, ProcessingPanel, useToolOutput } from "./ExportFlow";
import { UploadZone } from "./UploadZone";
import React, { useState, useRef } from "react";
import JSZip from "jszip";
import { inspectPdfFile, splitPdf, parsePageRange, pageRangeError } from "../lib/pdfEngine";
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
  const { output, finish, edit } = useToolOutput("split-pdf");

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
        finish({ blob, name: `${file.name.replace(/\.[^/.]+$/, "")}_extracted.pdf`, pages: indices.length });
      } else {
        // Zip mode
        const zip = new JSZip();
        splitFiles.forEach((sf) => {
          zip.file(sf.name, sf.bytes);
        });
        const zipBlob = await zip.generateAsync({ type: "blob" });
        finish({ blob: zipBlob, name: `${file.name.replace(/\.[^/.]+$/, "")}_split_pages.zip`, pages: indices.length,
          parts: splitFiles.map(part => ({ name: part.name, blob: new Blob([part.bytes.buffer as ArrayBuffer], { type: "application/pdf" }) })) });
      }
    } catch (err) {
      setErrorMessage((err as Error).message || "Failed to split PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  const disabledReason = file ? pageRangeError(rangeInput, pageCount) : "";
  if (isProcessing) return <ProcessingPanel title="Extracting pages" />;
  if (output) return <ExportResult output={output} title="Extraction ready" onEdit={edit} />;

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
          <button type="button" aria-label="Dismiss error" onClick={() => setErrorMessage("")}>✕</button>
        </div>
      )}

      {!file ? (
        <UploadZone tool="split-pdf" title="Select a PDF to split" action="Choose PDF"
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

            <div className="split-helper-box">
              <h4>Range Syntax Examples</h4>
              <p><code>1-3, 5, 8-10</code> — Extracts pages 1, 2, 3, 5, 8, 9, and 10.</p>
              <p><code>1</code> — Extracts only page 1.</p>
              {pageCount > 2 && <p><code>2-{pageCount}</code> — Extracts from page 2 to the end of the document.</p>}
            </div>
          </div>

          <aside className="tool-settings-sidebar">
            <h2 className="sidebar-heading">Split options</h2>

            <div className="setting-group">
              <label className="setting-label" htmlFor="split-pdf-pages-to-extract">Pages to extract</label>
              <input id="split-pdf-pages-to-extract"
                type="text"
                className="setting-input"
                placeholder="e.g. 1-3, 5"
                value={rangeInput}
                onChange={(e) => {
                  setRangeInput(e.target.value);
                }}
              />
              <span className="setting-hint">Document has {pageCount} pages total.</span>
            </div>

            <div className="setting-group">
              <label className="setting-label">Export format</label>
              <div className="segmented-control" role="group" aria-label="Export format">
                <button
                  type="button"
                  aria-pressed={exportMode === "single"}
                  className={`segment-btn ${exportMode === "single" ? "active" : ""}`}
                  onClick={() => setExportMode("single")}
                >
                  Single PDF
                </button>
                <button
                  type="button"
                  aria-pressed={exportMode === "zip"}
                  className={`segment-btn ${exportMode === "zip" ? "active" : ""}`}
                  onClick={() => setExportMode("zip")}
                >
                  ZIP (Individual)
                </button>
              </div>
            </div>

            {disabledReason && <p className="field-error" role="status">{disabledReason}</p>}
            <button
              type="button"
              className="btn-create-pdf"
              onClick={handleSplit}
              disabled={Boolean(disabledReason)}
            >
              <ScissorsIcon className="btn-pdf-icon" />
              <span>Split PDF</span>
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
            onClick={handleSplit}
            disabled={Boolean(disabledReason)}
          >
            <ScissorsIcon className="btn-pdf-icon" />
            <span>Split PDF</span>
          </button>
        </div>
      )}
    </div>
  );
}
