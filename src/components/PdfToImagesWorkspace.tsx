import { ExportResult, ProcessingPanel, useToolOutput } from "./ExportFlow";
import { UploadZone } from "./UploadZone";
import React, { useState, useRef } from "react";
import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist";
import { inspectPdfFile, parsePageRange, pageRangeError } from "../lib/pdfEngine";
import { ImageIcon, PdfDocIcon } from "./Icons";

import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PdfToImagesWorkspaceProps {
  onBackToHome: () => void;
}

interface RenderedImage {
  pageNumber: number;
  blob: Blob;
  name: string;
}

export function PdfToImagesWorkspace({ onBackToHome }: PdfToImagesWorkspaceProps) {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [format, setFormat] = useState<"jpeg" | "png">("jpeg");
  const [dpiProfile, setDpiProfile] = useState<150 | 300>(150);
  const [pageRange, setPageRange] = useState<string>("1-5");
  const [targetScope, setTargetScope] = useState<"all" | "custom">("all");

  const [isProcessing, setIsProcessing] = useState(false);
  const [renderProgress, setRenderProgress] = useState<{ completed: number; total: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const { output, finish, edit } = useToolOutput("pdf-to-images");

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
      setPageRange(`1-${Math.min(5, info.pageCount)}`);
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleConvert = async () => {
    if (!file) return;

    setErrorMessage("");
    setIsProcessing(true);

    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | undefined;
    try {
      const buffer = await file.arrayBuffer();
      loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
      const pdf = await loadingTask.promise;

      let targetPages: number[] = [];
      if (targetScope === "all") {
        for (let i = 1; i <= pdf.numPages; i++) targetPages.push(i);
      } else {
        const zeroIndices = parsePageRange(pageRange, pdf.numPages);
        targetPages = zeroIndices.map((idx) => idx + 1);
      }

      const results: RenderedImage[] = [];
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      const scale = dpiProfile / 72;
      setRenderProgress({ completed: 0, total: targetPages.length });

      for (let i = 0; i < targetPages.length; i++) {
        const pageNum = targetPages[i];

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not create canvas context.");

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await (page.render as any)({
          canvasContext: ctx,
          canvas,
          viewport,
        }).promise;

        const mime = format === "png" ? "image/png" : "image/jpeg";
        const ext = format === "png" ? "png" : "jpg";


        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to export image blob"))), mime, 0.9);
        });

        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
        results.push({
          pageNumber: pageNum,
          blob,
          name: `${baseName}_page_${pageNum}.${ext}`,
        });
        setRenderProgress({ completed: i + 1, total: targetPages.length });
      }

      const zip = new JSZip();
      for (const image of results) zip.file(image.name, image.blob);
      const blob = await zip.generateAsync({ type: "blob" });
      finish({ blob, name: baseName + "_images.zip", pages: results.length, parts: results });
    } catch (err) {
      setErrorMessage((err as Error).message || "Failed to render PDF to images.");
    } finally {
      await loadingTask?.destroy().catch(() => {});
      setIsProcessing(false);
      setRenderProgress(null);
    }
  };

  const disabledReason = file && targetScope === "custom" ? pageRangeError(pageRange, pageCount) : "";
  if (isProcessing) {
    if (renderProgress && renderProgress.completed === renderProgress.total) {
      return <ProcessingPanel title="Preparing ZIP" detail="Packaging the converted page images…" />;
    }
    return <ProcessingPanel title="Converting pages"
      detail={renderProgress ? `Rendering page ${renderProgress.completed + 1} of ${renderProgress.total}` : undefined}
      percent={renderProgress ? renderProgress.completed / renderProgress.total * 100 : undefined} />;
  }
  if (output) return <ExportResult output={output} title="Page images ready" onEdit={edit} downloadLabel="Download All Images (ZIP)" />;

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
            <h1 className="document-title">PDF to images</h1>
            <p className="tool-header-subtitle">
              Extract document pages into sharp JPG or PNG images.
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
        <UploadZone tool="pdf-to-images" title="Select a PDF to extract images" action="Choose PDF"
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

          </div>

          <aside className="tool-settings-sidebar">
            <h2 className="sidebar-heading">Export options</h2>

            <div className="setting-group">
              <label className="setting-label">Format</label>
              <div className="segmented-control" role="group" aria-label="Format">
                <button
                  type="button"
                  aria-pressed={format === "jpeg"}
                  className={`segment-btn ${format === "jpeg" ? "active" : ""}`}
                  onClick={() => setFormat("jpeg")}
                >
                  JPG
                </button>
                <button
                  type="button"
                  aria-pressed={format === "png"}
                  className={`segment-btn ${format === "png" ? "active" : ""}`}
                  onClick={() => setFormat("png")}
                >
                  PNG
                </button>
              </div>
            </div>

            <div className="setting-group">
              <label className="setting-label" htmlFor="pdf-to-images-resolution-profile">Resolution profile</label>
              <select id="pdf-to-images-resolution-profile"
                className="setting-select"
                value={dpiProfile}
                onChange={(e) => setDpiProfile(Number(e.target.value) as any)}
              >
                <option value={150}>Standard (150 DPI - faster)</option>
                <option value={300}>High Quality (300 DPI - print sharp)</option>
              </select>
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
                  Range
                </button>
              </div>

              {targetScope === "custom" && (
                <div className="custom-range-input-wrap">
                  <input
                    type="text"
                    aria-label="Page range"
                    className="setting-input"
                    placeholder="e.g. 1-3, 5"
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                  />
                  <span className="setting-hint">Document has {pageCount} pages</span>
                </div>
              )}
            </div>

            {disabledReason && <p className="field-error" role="status">{disabledReason}</p>}
            <button
              type="button"
              className="btn-create-pdf"
              onClick={handleConvert}
              disabled={Boolean(disabledReason)}
            >
              <ImageIcon className="btn-pdf-icon" />
              <span>Convert to Images</span>
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
            onClick={handleConvert}
            disabled={Boolean(disabledReason)}
          >
            <ImageIcon className="btn-pdf-icon" />
            <span>Convert to Images</span>
          </button>
        </div>
      )}
    </div>
  );
}
