import { ExportResult, ProcessingPanel, useToolOutput } from "./ExportFlow";
import { UploadZone } from "./UploadZone";
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
  const { output, finish, edit } = useToolOutput("merge-pdf");
  const [mergedFilename, setMergedFilename] = useState("merged-document.pdf");

  const dragging = useRef<number | null>(null);
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
    }
  };

  const handleMove = (index: number, targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= files.length) return;
    const updated = [...files];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    setFiles(updated);
  };

  const handleRemove = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
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
      const name = mergedFilename.trim() || "merged-document";
      finish({ blob, name: /\.pdf$/i.test(name) ? name : name + ".pdf", pages: pageCount });
    } catch (err) {
      setErrorMessage((err as Error).message || "Failed to merge PDF files.");
    } finally {
      setIsProcessing(false);
    }
  };


  const totalPages = files.reduce((sum, f) => sum + f.pageCount, 0);

  const disabledReason = files.length < 2 ? "Add at least two PDFs to merge." : "";
  if (isProcessing) return <ProcessingPanel title="Merging PDFs" />;
  if (output) return <ExportResult output={output} title="Merged PDF ready" onEdit={edit} />;

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
          <button type="button" aria-label="Dismiss error" onClick={() => setErrorMessage("")}>✕</button>
        </div>
      )}

      {files.length === 0 ? (
        <UploadZone tool="merge-pdf" title="Select PDFs to combine" action="Add PDFs"
          onChoose={() => fileInputRef.current?.click()} onFiles={handleAddFiles} />
      ) : (
        <div className="tool-content-layout">
          <div className="tool-items-list" role="list">
            {files.map((item, idx) => (
              <div key={item.id} className="pdf-list-item" role="listitem" draggable
                onDragStart={() => { dragging.current = idx; }} onDragEnd={() => { dragging.current = null; }}
                onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (dragging.current !== null) handleMove(dragging.current, idx); }}>
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
                    onClick={() => handleMove(idx, idx - 1)}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn-order-arrow"
                    disabled={idx === files.length - 1}
                    onClick={() => handleMove(idx, idx + 1)}
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
              <label className="setting-label" htmlFor="merge-pdf-output-filename">Output filename</label>
              <input id="merge-pdf-output-filename"
                type="text"
                className="setting-input"
                value={mergedFilename}
                onChange={(e) => setMergedFilename(e.target.value)}
              />
            </div>

            {disabledReason && <p className="field-error" role="status">{disabledReason}</p>}
            <button
              type="button"
              className="btn-create-pdf"
              onClick={handleMerge}
              disabled={Boolean(disabledReason)}
            >
              <MergeIcon className="btn-pdf-icon" />
              <span>Merge PDFs</span>
            </button>
          </aside>
        </div>
      )}

      {/* Mobile Sticky Bottom Action Bar */}
      {files.length > 0 && (
        <div className="mobile-bottom-bar mobile-only">
          <button
            type="button"
            className="btn-mobile-create-pdf"
            onClick={handleMerge}
            disabled={Boolean(disabledReason)}
          >
            <MergeIcon className="btn-pdf-icon" />
            <span>Merge PDFs</span>
          </button>
        </div>
      )}
    </div>
  );
}
