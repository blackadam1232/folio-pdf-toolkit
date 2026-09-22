import React, { useState, useRef } from "react";
import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist";
import { inspectPdfFile, parsePageRange } from "../lib/pdfEngine";
import { ImageIcon, PdfDocIcon } from "./Icons";

// Set worker source
if (typeof window !== "undefined") {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  } catch (e) {
    console.warn("Could not set external workerSrc, will fallback to inline worker if available.", e);
  }
}

interface PdfToImagesWorkspaceProps {
  onBackToHome: () => void;
}

interface RenderedImage {
  pageNumber: number;
  dataUrl: string;
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
  const [renderProgress, setRenderProgress] = useState<{ current: number; total: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [renderedImages, setRenderedImages] = useState<RenderedImage[]>([]);
  const [zipUrl, setZipUrl] = useState<string | null>(null);

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
      setRenderedImages([]);
      setZipUrl(null);
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleConvert = async () => {
    if (!file) return;

    setErrorMessage("");
    setIsProcessing(true);
    setRenderedImages([]);
    setZipUrl(null);

    try {
      const buffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
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
      const scale = dpiProfile === 300 ? 2.5 : 1.5;

      for (let i = 0; i < targetPages.length; i++) {
        const pageNum = targetPages[i];
        setRenderProgress({ current: i + 1, total: targetPages.length });

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
        const dataUrl = canvas.toDataURL(mime, 0.9);

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to export image blob"))), mime, 0.9);
        });

        results.push({
          pageNumber: pageNum,
          dataUrl,
          blob,
          name: `${baseName}_page_${pageNum}.${ext}`,
        });
      }

      setRenderedImages(results);

      // Also generate a zip archive if more than 1 image
      if (results.length > 1) {
        const zip = new JSZip();
        results.forEach((img) => {
          zip.file(img.name, img.blob);
        });
        const zipBlob = await zip.generateAsync({ type: "blob" });
        setZipUrl(URL.createObjectURL(zipBlob));
      }
    } catch (err) {
      setErrorMessage((err as Error).message || "Failed to render PDF to images.");
    } finally {
      setIsProcessing(false);
      setRenderProgress(null);
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
            <ImageIcon className="dropzone-icon" />
          </div>
          <h3>Select a PDF to extract images</h3>
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

            {renderedImages.length > 0 && (
              <div className="extracted-images-grid">
                {renderedImages.map((img) => (
                  <div key={img.pageNumber} className="extracted-image-card">
                    <img src={img.dataUrl} alt={`Page ${img.pageNumber}`} className="extracted-thumb" />
                    <div className="extracted-card-footer">
                      <span>Page {img.pageNumber}</span>
                      <a href={img.dataUrl} download={img.name} className="btn-save-single">
                        Save
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="tool-settings-sidebar">
            <h2 className="sidebar-heading">Export options</h2>

            <div className="setting-group">
              <label className="setting-label">Format</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segment-btn ${format === "jpeg" ? "active" : ""}`}
                  onClick={() => setFormat("jpeg")}
                >
                  JPG
                </button>
                <button
                  type="button"
                  className={`segment-btn ${format === "png" ? "active" : ""}`}
                  onClick={() => setFormat("png")}
                >
                  PNG
                </button>
              </div>
            </div>

            <div className="setting-group">
              <label className="setting-label">Resolution profile</label>
              <select
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
                  Range
                </button>
              </div>

              {targetScope === "custom" && (
                <div className="custom-range-input-wrap">
                  <input
                    type="text"
                    className="setting-input"
                    placeholder="e.g. 1-3, 5"
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                  />
                  <span className="setting-hint">Document has {pageCount} pages</span>
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn-create-pdf"
              onClick={handleConvert}
              disabled={isProcessing}
            >
              <ImageIcon className="btn-pdf-icon" />
              <span>
                {isProcessing
                  ? `Rendering ${renderProgress?.current || 0}/${renderProgress?.total || pageCount}…`
                  : "Convert to Images"}
              </span>
            </button>

            {zipUrl && (
              <div className="export-result-card">
                <div className="result-header">
                  <span className="result-check">✓</span>
                  <strong>{renderedImages.length} Images Ready!</strong>
                </div>
                <a
                  href={zipUrl}
                  download={`${file.name.replace(/\.[^/.]+$/, "")}_images.zip`}
                  className="btn-download-result text-center"
                >
                  Download All as ZIP
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
            onClick={zipUrl ? () => {
              const a = document.createElement("a");
              a.href = zipUrl;
              a.download = `${file.name.replace(/\.[^/.]+$/, "")}_images.zip`;
              a.click();
            } : handleConvert}
            disabled={isProcessing}
          >
            <ImageIcon className="btn-pdf-icon" />
            <span>
              {isProcessing
                ? "Rendering…"
                : zipUrl
                ? "Download ZIP"
                : "Convert to Images"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
