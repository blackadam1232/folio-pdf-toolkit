import React, { useState, useRef } from "react";
import { inspectPdfFile, organizePdfPages } from "../lib/pdfEngine";
import { GridIcon, RotateIcon, TrashIcon, PdfDocIcon } from "./Icons";

interface OrganizePdfWorkspaceProps {
  onBackToHome: () => void;
}

interface PageState {
  id: string;
  originalIndex: number;
  rotation: number;
  isDeleted: boolean;
}

export function OrganizePdfWorkspace({ onBackToHome }: OrganizePdfWorkspaceProps) {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [pages, setPages] = useState<PageState[]>([]);
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

      const initialPages: PageState[] = [];
      for (let i = 0; i < info.pageCount; i++) {
        initialPages.push({
          id: `page_${i}_${Date.now()}`,
          originalIndex: i,
          rotation: 0,
          isDeleted: false,
        });
      }
      setPages(initialPages);
      setDownloadUrl(null);
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleMove = (index: number, direction: "left" | "right") => {
    const target = direction === "left" ? index - 1 : index + 1;
    if (target < 0 || target >= pages.length) return;
    const updated = [...pages];
    const [item] = updated.splice(index, 1);
    updated.splice(target, 0, item);
    setPages(updated);
    setDownloadUrl(null);
  };

  const handleRotate = (id: string) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, rotation: (p.rotation + 90) % 360 } : p
      )
    );
    setDownloadUrl(null);
  };

  const handleToggleDelete = (id: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isDeleted: !p.isDeleted } : p))
    );
    setDownloadUrl(null);
  };

  const handleExport = async () => {
    if (!file) return;

    setErrorMessage("");
    setIsProcessing(true);

    try {
      const activePages = pages.filter((p) => !p.isDeleted);
      if (activePages.length === 0) {
        throw new Error("You have deleted all pages. Please keep at least one page.");
      }

      const bytes = await organizePdfPages(
        file,
        pages.map((p) => ({
          pageIndex: p.originalIndex,
          rotation: p.rotation,
          isDeleted: p.isDeleted,
        }))
      );

      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadName(`${file.name.replace(/\.[^/.]+$/, "")}_organized.pdf`);
    } catch (err) {
      setErrorMessage((err as Error).message || "Failed to organize PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  const activeCount = pages.filter((p) => !p.isDeleted).length;

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
          <h1 className="document-title">Organize PDF</h1>
          <p className="tool-header-subtitle">
            Rearrange, rotate, or remove pages from your document.
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
            <GridIcon className="dropzone-icon" />
          </div>
          <h3>Select a PDF to organize</h3>
          <p>Drag and drop a PDF file here, or click to choose from your device.</p>
        </div>
      ) : (
        <div className="tool-content-layout">
          <div className="tool-inspect-panel">
            <div className="organize-grid" role="list">
              {pages.map((p, idx) => (
                <div
                  key={p.id}
                  className={`organize-card ${p.isDeleted ? "deleted" : ""}`}
                  role="listitem"
                >
                  <div className="organize-card-top">
                    <span className="organize-page-tag">
                      Page {p.originalIndex + 1}
                    </span>
                    {p.isDeleted && <span className="deleted-tag">Deleted</span>}
                  </div>

                  <div
                    className="organize-card-sheet"
                    style={{ transform: `rotate(${p.rotation}deg)` }}
                  >
                    <div className="organize-sheet-header" />
                    <div className="organize-sheet-line line-1" />
                    <div className="organize-sheet-line line-2" />
                    <span className="organize-sheet-num">{idx + 1}</span>
                  </div>

                  <div className="organize-card-actions">
                    <button
                      type="button"
                      className="btn-card-action"
                      disabled={idx === 0}
                      onClick={() => handleMove(idx, "left")}
                      title="Move left"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="btn-card-action"
                      onClick={() => handleRotate(p.id)}
                      title="Rotate 90°"
                    >
                      <RotateIcon className="icon-tiny" />
                    </button>
                    <button
                      type="button"
                      className={`btn-card-action ${p.isDeleted ? "btn-restore" : "btn-trash"}`}
                      onClick={() => handleToggleDelete(p.id)}
                      title={p.isDeleted ? "Restore page" : "Delete page"}
                    >
                      {p.isDeleted ? "↩" : <TrashIcon className="icon-tiny" />}
                    </button>
                    <button
                      type="button"
                      className="btn-card-action"
                      disabled={idx === pages.length - 1}
                      onClick={() => handleMove(idx, "right")}
                      title="Move right"
                    >
                      →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="tool-settings-sidebar">
            <h2 className="sidebar-heading">Organize settings</h2>

            <div className="setting-group">
              <span className="setting-label">Document overview</span>
              <p className="summary-stat-text">
                <strong>{activeCount}</strong> of {pageCount} pages will be exported.
              </p>
            </div>

            <button
              type="button"
              className="btn-create-pdf"
              onClick={handleExport}
              disabled={isProcessing || activeCount === 0}
            >
              <GridIcon className="btn-pdf-icon" />
              <span>{isProcessing ? "Saving…" : "Save Organized PDF"}</span>
            </button>

            {downloadUrl && (
              <div className="export-result-card">
                <div className="result-header">
                  <span className="result-check">✓</span>
                  <strong>Organized PDF Ready!</strong>
                </div>
                <p className="result-meta">{downloadName} ({activeCount} pages)</p>
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="btn-download-result text-center"
                >
                  Download PDF
                </a>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
