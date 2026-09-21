import React, { useEffect, useRef, useState } from "react";
import { router } from "../lib/router";

interface ExpandedPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewImages: { originalUrl: string; compressedUrl: string } | null;
  isLoading: boolean;
  currentPage: number;
  totalPages: number;
  strength: number;
  onPageChange: (page: number) => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function ExpandedPreviewModal({
  isOpen,
  onClose,
  previewImages,
  isLoading,
  currentPage,
  totalPages,
  strength,
  onPageChange,
  triggerRef,
}: ExpandedPreviewModalProps) {
  const [viewMode, setViewMode] = useState<"split" | "original" | "compressed">("split");
  const [zoom, setZoom] = useState<number>(1);
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousActiveElement = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        if (currentPage > 1) {
          e.preventDefault();
          onPageChange(currentPage - 1);
        }
      } else if (e.key === "ArrowRight") {
        if (currentPage < totalPages) {
          e.preventDefault();
          onPageChange(currentPage + 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    // Focus close button on mount
    const closeBtn = modalRef.current?.querySelector<HTMLButtonElement>(".modal-close-btn");
    closeBtn?.focus();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      if (triggerRef?.current) {
        triggerRef.current.focus();
      } else if (previousActiveElement && typeof previousActiveElement.focus === "function") {
        previousActiveElement.focus();
      }
    };
  }, [isOpen, onClose, currentPage, totalPages, triggerRef]);

  if (!isOpen) return null;

  return (
    <div
      className="folio-modal-backdrop expanded-preview-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Expanded PDF Preview Comparison"
    >
      <div
        className="expanded-preview-container"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="expanded-preview-header">
          <div className="expanded-header-left">
            <h2 className="expanded-preview-title">Preview Comparison</h2>
            <span className="expanded-preview-subtitle">
              Page {currentPage} of {totalPages} · Strength {strength}%
            </span>
          </div>

          <div className="expanded-header-controls">
            {/* View Mode */}
            <div className="segmented-control mode-selector expanded-mode-selector">
              <button
                type="button"
                className={`segment-btn ${viewMode === "split" ? "active" : ""}`}
                onClick={() => setViewMode("split")}
              >
                Side-by-side
              </button>
              <button
                type="button"
                className={`segment-btn ${viewMode === "original" ? "active" : ""}`}
                onClick={() => setViewMode("original")}
              >
                Original
              </button>
              <button
                type="button"
                className={`segment-btn ${viewMode === "compressed" ? "active" : ""}`}
                onClick={() => setViewMode("compressed")}
              >
                Compressed
              </button>
            </div>

            {/* Zoom */}
            <div className="expanded-zoom-controls">
              <button
                type="button"
                className="btn-zoom-action"
                onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                title="Zoom out"
                aria-label="Zoom out"
              >
                −
              </button>
              <span className="zoom-level-text">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                className="btn-zoom-action"
                onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                title="Zoom in"
                aria-label="Zoom in"
              >
                +
              </button>
              {zoom !== 1 && (
                <button
                  type="button"
                  className="btn-zoom-reset"
                  onClick={() => setZoom(1)}
                  title="Reset zoom"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Page navigation */}
            <div className="expanded-page-nav">
              <button
                type="button"
                className="btn-preview-nav"
                disabled={currentPage <= 1}
                onClick={() => onPageChange(currentPage - 1)}
                aria-label="Previous page"
              >
                ← Prev
              </button>
              <span className="preview-page-indicator">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className="btn-preview-nav"
                disabled={currentPage >= totalPages}
                onClick={() => onPageChange(currentPage + 1)}
                aria-label="Next page"
              >
                Next →
              </button>
            </div>

            <button
              type="button"
              className="modal-close-btn expanded-close-btn"
              onClick={onClose}
              aria-label="Close expanded preview"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Comparison body */}
        <div className="expanded-preview-body">
          {isLoading && (
            <div className="preview-loading-overlay">
              <div className="loading-spinner" />
              <span>Updating sample preview…</span>
            </div>
          )}

          <div
            className={`expanded-stage mode-${viewMode}`}
            style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
          >
            {(viewMode === "split" || viewMode === "original") && (
              <div className="expanded-card">
                <div className="comparison-card-badge">Original Page {currentPage}</div>
                <div className="expanded-img-wrap">
                  {previewImages ? (
                    <img
                      src={previewImages.originalUrl}
                      alt={`Original page ${currentPage}`}
                      className="expanded-img"
                    />
                  ) : (
                    <div className="preview-sheet-loading">
                      <div className="loading-spinner" />
                      <span>Loading page…</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(viewMode === "split" || viewMode === "compressed") && (
              <div className="expanded-card">
                <div className="comparison-card-badge badge-compressed">
                  Simulated Output (Strength {strength}%)
                </div>
                <div className="expanded-img-wrap">
                  {previewImages ? (
                    <img
                      src={previewImages.compressedUrl}
                      alt={`Compressed preview page ${currentPage}`}
                      className="expanded-img"
                    />
                  ) : (
                    <div className="preview-sheet-loading">
                      <div className="loading-spinner" />
                      <span>Generating preview…</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="expanded-preview-footer">
          <p className="preview-caption">
            Sample preview page {currentPage} of {totalPages}. This demonstrates estimated raster downsampling at {strength}% strength. Searchable text and vector shapes remain crisp and unrasterized in final output.
          </p>
          <button
            type="button"
            className="btn-modal-primary btn-close-expanded"
            onClick={onClose}
          >
            Done viewing
          </button>
        </div>
      </div>
    </div>
  );
}
