import React, { useState, useRef } from "react";
import { inspectPdfFile, mergePdfs } from "../lib/pdfEngine";
import { MergeIcon, TrashIcon, PdfDocIcon } from "./Icons";

interface MergePdfWorkspaceProps {
  onBackToHome: () => void;
}

interface PdfItem {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount: number;
}

export function MergePdfWorkspace({ onBackToHome }: MergePdfWorkspaceProps) {
  const [files, setFiles] = useState<PdfItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [mergedBlobUrl, setMergedBlobUrl] = useState<string | null>(null);
  const [mergedFilename, setMergedFilename] = useState("merged-document.pdf");
  const [outputSize, setOutputSize] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleAddFiles = async (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    if (!incoming.length) return;

    setErrorMessage("");
    const newItems: PdfItem[] = [];

    for (const file of incoming) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setErrorMessage(`"${file.name}" is not a PDF file.`);
        continue;
      }
      try {
        const info = await inspectPdfFile(file);
        newItems.push({
          id: `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          file,
          name: file.name,
          size: file.size,
          pageCount: info.pageCount,
        });
      } catch (err) {
        setErrorMessage((err as Error).message);
      }
    }

    if (newItems.length > 0) {
      setFiles((prev) => [...prev, ...newItems]);
      setMergedBlobUrl(null);
    }
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= files.length) return;
    const updated = [...files];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    setFiles(updated);
    setMergedBlobUrl(null);
  };

  const handleRemove = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setMergedBlobUrl(null);
  };

  const handleMerge = async () => {
    if (files.length < 2) {
      setErrorMessage("Please select at least 2 PDF files to combine.");
      return;
    }

    setErrorMessage("");
    setIsProcessing(true);

    try {
      const { bytes, pageCount } = await mergePdfs(files.map((f) => f.file));
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setMergedBlobUrl(url);
      setOutputSize(blob.size);
    } catch (err) {
      setErrorMessage((err as Error).message || "Failed to merge PDF files.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!mergedBlobUrl) return;
    const a = document.createElement("a");
    a.href = mergedBlobUrl;
    a.download = mergedFilename.endsWith(".pdf") ? mergedFilename : `${mergedFilename}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const totalPages = files.reduce((sum, f) => sum + f.pageCount, 0);

  return (
    <div className="folio-workspace tool-generic-workspace">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="application/pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files) handleAddFiles(e.target.files);
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
            <h1 className="document-title">Merge PDFs</h1>
            <p className="tool-header-subtitle">
              Combine multiple documents into one in your chosen order.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn-add-images"
          onClick={() => fileInputRef.current?.click()}
        >
          + Add PDFs
        </button>
      </div>

      {errorMessage && (
        <div className="error-banner" role="alert">
          <span>⚠ {errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage("")}>✕</button>
        </div>
      )}

      {files.length === 0 ? (
        <div
          className="empty-dropzone"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files) handleAddFiles(e.dataTransfer.files);
          }}
        >
          <div className="dropzone-art">
            <MergeIcon className="dropzone-icon" />
          </div>
          <h3>Select PDFs to combine</h3>
          <p>Drag and drop PDF files here, or click to choose from your device.</p>
        </div>
      ) : (
        <div className="tool-content-layout">
          <div className="tool-items-list" role="list">
            {files.map((item, idx) => (
              <div key={item.id} className="pdf-list-item" role="listitem">
                <div className="pdf-item-index">{idx + 1}</div>
                <div className="pdf-item-icon">
                  <PdfDocIcon className="doc-icon-small" />
                </div>
                <div className="pdf-item-info">
                  <span className="pdf-item-name">{item.name}</span>
                  <span className="pdf-item-meta">
                    {item.pageCount} {item.pageCount === 1 ? "page" : "pages"} · {(item.size / 1024).toFixed(0)} KB
                  </span>
                </div>
                <div className="pdf-item-actions">
                  <button
                    type="button"
                    className="btn-order-arrow"
                    disabled={idx === 0}
                    onClick={() => handleMove(idx, "up")}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn-order-arrow"
                    disabled={idx === files.length - 1}
                    onClick={() => handleMove(idx, "down")}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn-remove-item"
                    onClick={() => handleRemove(item.id)}
                    aria-label="Remove"
                  >
                    <TrashIcon className="trash-icon-small" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <aside className="tool-settings-sidebar">
            <h2 className="sidebar-heading">Merge settings</h2>
            <div className="setting-group">
              <span className="setting-label">Document summary</span>
              <p className="summary-stat-text">
                <strong>{files.length}</strong> files · <strong>{totalPages}</strong> total pages
              </p>
            </div>

            <div className="setting-group">
              <label className="setting-label">Output filename</label>
              <input
                type="text"
                className="setting-input"
                value={mergedFilename}
                onChange={(e) => setMergedFilename(e.target.value)}
              />
            </div>

            <button
              type="button"
              className="btn-create-pdf"
              onClick={handleMerge}
              disabled={isProcessing || files.length < 2}
            >
              <MergeIcon className="btn-pdf-icon" />
              <span>{isProcessing ? "Merging PDFs…" : "Merge PDFs"}</span>
            </button>

            {mergedBlobUrl && (
              <div className="export-result-card">
                <div className="result-header">
                  <span className="result-check">✓</span>
                  <strong>Merged PDF Ready!</strong>
                </div>
                <p className="result-meta">
                  {(outputSize / (1024 * 1024)).toFixed(2)} MB · {totalPages} pages
                </p>
                <button
                  type="button"
                  className="btn-download-result"
                  onClick={handleDownload}
                >
                  Download Merged PDF
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
