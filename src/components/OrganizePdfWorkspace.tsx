import { ExportResult, ProcessingPanel, useToolOutput } from "./ExportFlow";
import { UploadZone } from "./UploadZone";
import React, { useState, useRef } from "react";
import { inspectPdfFile, organizePdfPages } from "../lib/pdfEngine";
import { GridIcon, RotateIcon, TrashIcon, PdfDocIcon } from "./Icons";
import { PdfPageThumbnail } from "./PdfPageThumbnail";

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
  const [selected, setSelected] = useState<string[]>([]);
  const dragging = useRef<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const { output, finish, edit } = useToolOutput("organize-pdf");

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
      setSelected([]);
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleMove = (index: number, target: number) => {
    if (target < 0 || target >= pages.length) return;
    const updated = [...pages];
    const [item] = updated.splice(index, 1);
    updated.splice(target, 0, item);
    setPages(updated);
  };

  const handleRotate = (id: string) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, rotation: (p.rotation + 90) % 360 } : p
      )
    );
  };

  const handleToggleDelete = (id: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isDeleted: !p.isDeleted } : p))
    );
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
      finish({ blob, name: `${file.name.replace(/\.[^/.]+$/, "")}_organized.pdf`, pages: activePages.length });
    } catch (err) {
      setErrorMessage((err as Error).message || "Failed to organize PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  const activeCount = pages.filter((p) => !p.isDeleted).length;

  const disabledReason = activeCount === 0 ? "Restore at least one page to export." : "";
  if (isProcessing) return <ProcessingPanel title="Saving changes" />;
  if (output) return <ExportResult output={output} title="Organized PDF ready" onEdit={edit} />;

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
            <h1 className="document-title">Organize PDF</h1>
            <p className="tool-header-subtitle">
              Rearrange, rotate, or remove pages from your document.
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
        <UploadZone tool="organize-pdf" title="Select a PDF to organize" action="Choose PDF"
          onChoose={() => fileInputRef.current?.click()} onFiles={files => { if (files[0]) handleSelectFile(files[0]); }} />
      ) : (
        <div className="tool-content-layout">
          <div className="tool-inspect-panel">
            {selected.length > 0 && <div className="organize-toolbar" aria-label="Selected page actions">
              <strong>{selected.length} selected</strong>
              <button onClick={() => setPages(pages.map(page => selected.includes(page.id) ? { ...page, rotation: (page.rotation + 90) % 360 } : page))}>Rotate</button>
              <button onClick={() => setPages(pages.map(page => selected.includes(page.id) ? { ...page, isDeleted: true } : page))}>Delete</button>
              <button onClick={() => setPages(pages.map(page => selected.includes(page.id) ? { ...page, isDeleted: false } : page))}>Restore</button>
              <button onClick={() => setSelected([])}>Clear selection</button>
            </div>}
            <div className="organize-grid" role="list">
              {pages.map((p, idx) => (
                <div
                  key={p.id}
                  className={`organize-card ${p.isDeleted ? "deleted" : ""} ${selected.includes(p.id) ? "is-selected" : ""}`}
                  draggable onDragStart={() => { dragging.current = idx; }} onDragEnd={() => { dragging.current = null; }}
                  onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (dragging.current !== null) handleMove(dragging.current, idx); }}
                  role="listitem"
                >
                  <div className="organize-card-top">
                    <label className="organize-page-tag"><input type="checkbox" checked={selected.includes(p.id)}
                      onChange={event => setSelected(event.target.checked ? [...selected, p.id] : selected.filter(id => id !== p.id))} />Page {p.originalIndex + 1}</label>
                    {p.isDeleted && <span className="deleted-tag">Deleted</span>}
                  </div>

                  <div className="organize-card-sheet">
                    {file && (
                      <PdfPageThumbnail
                        file={file}
                        pageNumber={p.originalIndex + 1}
                        rotation={p.rotation}
                        scale={0.5}
                        alt={`Page ${p.originalIndex + 1}`}
                      />
                    )}
                    <span className="organize-sheet-num">{idx + 1}</span>
                  </div>

                  <div className="organize-card-actions">
                    <button
                      type="button"
                      className="btn-card-action"
                      disabled={idx === 0}
                      onClick={() => handleMove(idx, idx - 1)}
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
                      onClick={() => handleMove(idx, idx + 1)}
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

            {disabledReason && <p className="field-error" role="status">{disabledReason}</p>}
            <button
              type="button"
              className="btn-create-pdf"
              onClick={handleExport}
              disabled={Boolean(disabledReason)}
            >
              <GridIcon className="btn-pdf-icon" />
              <span>Save Changes</span>
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
            onClick={handleExport}
            disabled={Boolean(disabledReason)}
          >
            <GridIcon className="btn-pdf-icon" />
            <span>Save Changes</span>
          </button>
        </div>
      )}
    </div>
  );
}
