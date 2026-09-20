import React from "react";
import { ConversionResult, GenerationProgress } from "../types";
import { formatBytes } from "./ImageList";

interface ConversionBarProps {
  isProcessing: boolean;
  progress: GenerationProgress | null;
  result: ConversionResult | null;
  hasImages: boolean;
  hasValidationError: boolean;
  onGenerate: () => void;
  onCancel: () => void;
  onDownload: () => void;
}

export const ConversionBar: React.FC<ConversionBarProps> = ({
  isProcessing,
  progress,
  result,
  hasImages,
  hasValidationError,
  onGenerate,
  onCancel,
  onDownload,
}) => {
  return (
    <aside className="conversion-dock" role="region" aria-label="PDF Conversion Actions">
      {/* Active Processing State */}
      {isProcessing && progress && (
        <div className="dock-progress-panel">
          <div className="dock-progress-header">
            <span className="dock-spinner" aria-hidden="true" />
            <div className="dock-progress-info">
              <strong>Processing document…</strong>
              <span className="dock-progress-detail">
                {progress.current} of {progress.total} · {progress.currentFilename}
              </span>
            </div>
            <button
              type="button"
              className="cancel-btn"
              onClick={onCancel}
              title="Stop processing"
            >
              Cancel
            </button>
          </div>

          <div className="dock-progress-bar-wrap">
            <div
              className="dock-progress-bar-fill"
              style={{ width: `${progress.percent}%` }}
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      )}

      {/* Completed Result State */}
      {!isProcessing && result && (
        <div className={`dock-result-panel ${result.isOutdated ? "result-outdated" : ""}`}>
          <div className="result-info">
            <div className="result-title-row">
              <span className="result-badge">
                {result.isOutdated ? "Settings Changed" : "Ready to Download"}
              </span>
              <strong className="result-filename">{result.filename}</strong>
            </div>
            <div className="result-meta">
              <span>{result.pageCount} page{result.pageCount === 1 ? "" : "s"}</span>
              <span>·</span>
              <span>{formatBytes(result.sizeBytes)}</span>
              <span>·</span>
              <span>{result.generationTimeSec}s</span>
              <span>·</span>
              <span>{result.profile}</span>
            </div>
            {result.isOutdated && (
              <p className="outdated-hint">
                Settings or image order changed since this PDF was created. Download this version or
                regenerate to apply updates.
              </p>
            )}
          </div>

          <div className="dock-actions">
            <button
              type="button"
              className="primary download-btn"
              onClick={onDownload}
              title="Save PDF to your computer"
            >
              ⬇ Download PDF
            </button>

            <button
              type="button"
              className="secondary regenerate-btn"
              onClick={onGenerate}
              disabled={!hasImages || hasValidationError}
              title="Create an updated PDF with current settings"
            >
              ↻ Update PDF
            </button>
          </div>
        </div>
      )}

      {/* Default State: Ready to Generate */}
      {!isProcessing && !result && (
        <div className="dock-ready-panel">
          <div className="dock-ready-text">
            <strong>Ready to build your PDF</strong>
            <p className="hint">All processing happens privately on your device.</p>
          </div>

          <button
            type="button"
            className="primary generate-btn"
            disabled={!hasImages || hasValidationError}
            onClick={onGenerate}
          >
            Create PDF →
          </button>
        </div>
      )}
    </aside>
  );
};
