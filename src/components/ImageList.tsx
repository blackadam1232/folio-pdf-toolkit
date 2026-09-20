import React, { useRef, useState } from "react";
import { ImageItem, SortMode } from "../types";

interface ImageListProps {
  items: ImageItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAddFiles: (files: FileList | File[]) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onRotate: (id: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  isProcessing: boolean;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const ImageList: React.FC<ImageListProps> = ({
  items,
  selectedId,
  onSelect,
  onAddFiles,
  onRemove,
  onClearAll,
  onRotate,
  onMove,
  sortMode,
  onSortChange,
  isProcessing,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isDragOverDropzone, setIsDragOverDropzone] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const totalSize = items.reduce((sum, item) => sum + item.size, 0);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverDropzone(false);
    if (isProcessing) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAddFiles(e.dataTransfer.files);
    }
  };

  return (
    <section className="panel images-panel">
      <div className="section-head">
        <div>
          <h2>Images ({items.length})</h2>
          <p className="panel-subtitle">
            {items.length === 0
              ? "No images added yet"
              : `${items.length} file${items.length === 1 ? "" : "s"} · ${formatBytes(totalSize)}`}
          </p>
        </div>
        <span className="step-badge">01</span>
      </div>

      {/* Upload Dropzone */}
      <div
        className={`dropzone ${isDragOverDropzone ? "dropzone-active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOverDropzone(true);
        }}
        onDragLeave={() => setIsDragOverDropzone(false)}
        onDrop={handleDrop}
        role="region"
        aria-label="Image drop zone"
      >
        <div className="dropzone-icon">⇪</div>
        <h3>Drag & drop images here</h3>
        <p className="hint">Supports JPEG, PNG, and WebP (up to 150 images)</p>

        <div className="dropzone-actions">
          <button
            type="button"
            className="primary select-btn"
            disabled={isProcessing}
            onClick={() => fileInputRef.current?.click()}
          >
            {items.length === 0 ? "Select Images" : "+ Add More Images"}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          hidden
          multiple
          accept="image/jpeg,image/jpg,image/png,image/webp"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onAddFiles(e.target.files);
            }
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <>
          {/* Toolbar for Sorting & Clearing */}
          <div className="list-toolbar">
            <label className="sort-label">
              <span>Sort:</span>
              <select
                value={sortMode}
                disabled={isProcessing}
                onChange={(e) => onSortChange(e.target.value as SortMode)}
                className="sort-select"
                aria-label="Sort images by"
              >
                <option value="natural-asc">Natural (1, 2, 10)</option>
                <option value="natural-desc">Natural descending (10, 2, 1)</option>
                <option value="name-asc">Filename A–Z</option>
                <option value="name-desc">Filename Z–A</option>
                <option value="date-oldest">Oldest first</option>
                <option value="date-newest">Newest first</option>
                <option value="manual">Manual arrangement</option>
              </select>
            </label>

            <button
              type="button"
              className="clear-btn"
              disabled={isProcessing}
              onClick={() => setShowClearConfirm(true)}
              title="Clear all images"
            >
              Clear all
            </button>
          </div>

          {/* List of images */}
          <div className="image-items-list" role="list">
            {items.map((item, index) => {
              const isSelected = item.id === selectedId;

              return (
                <div
                  key={item.id}
                  className={`image-row ${isSelected ? "image-row-selected" : ""}`}
                  role="listitem"
                  draggable={!isProcessing}
                  onDragStart={() => setDraggedIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedIndex !== null && draggedIndex !== index) {
                      onMove(draggedIndex, index);
                    }
                    setDraggedIndex(null);
                  }}
                >
                  {/* Position number */}
                  <span className="row-index">{index + 1}</span>

                  {/* Thumbnail preview */}
                  <div
                    className="row-thumb"
                    onClick={() => onSelect(item.id)}
                    title="Click to view in preview"
                  >
                    <img
                      src={item.objectUrl}
                      alt={`Thumbnail of ${item.name}`}
                      loading="lazy"
                      style={{
                        transform: `rotate(${item.rotation}deg)`,
                      }}
                    />
                  </div>

                  {/* File Info */}
                  <div
                    className="row-info"
                    onClick={() => onSelect(item.id)}
                    title={`Click to preview: ${item.name}`}
                  >
                    <div className="row-filename">{item.name}</div>
                    <div className="row-meta">
                      {formatBytes(item.size)} · {item.width} × {item.height}
                      {item.rotation > 0 && ` · ${item.rotation}°`}
                    </div>
                  </div>

                  {/* Reorder Buttons (Move Up / Down) */}
                  <div className="row-reorder-group">
                    <button
                      type="button"
                      className="touch-btn reorder-btn"
                      disabled={isProcessing || index === 0}
                      onClick={() => onMove(index, index - 1)}
                      aria-label={`Move ${item.name} up`}
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="touch-btn reorder-btn"
                      disabled={isProcessing || index === items.length - 1}
                      onClick={() => onMove(index, index + 1)}
                      aria-label={`Move ${item.name} down`}
                      title="Move down"
                    >
                      ▼
                    </button>
                  </div>

                  {/* Direct Position Jump */}
                  <input
                    type="number"
                    min={1}
                    max={items.length}
                    placeholder="#"
                    className="position-input"
                    disabled={isProcessing}
                    aria-label={`Move ${item.name} to position`}
                    title="Enter position number and press Enter"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const targetPos = parseInt(e.currentTarget.value, 10);
                        if (!isNaN(targetPos) && targetPos >= 1 && targetPos <= items.length) {
                          onMove(index, targetPos - 1);
                          e.currentTarget.value = "";
                        }
                      }
                    }}
                  />

                  {/* Rotate 90° button */}
                  <button
                    type="button"
                    className="touch-btn rotate-btn"
                    disabled={isProcessing}
                    onClick={() => onRotate(item.id)}
                    aria-label={`Rotate ${item.name} 90 degrees`}
                    title="Rotate 90° clockwise"
                  >
                    ↻
                  </button>

                  {/* Remove Button */}
                  <button
                    type="button"
                    className="touch-btn remove-btn"
                    disabled={isProcessing}
                    onClick={() => onRemove(item.id)}
                    aria-label={`Remove ${item.name}`}
                    title="Remove this image"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          <p className="hint reorder-hint">
            Drag items, use the ▲/▼ buttons, or type a position number and press Enter to rearrange.
          </p>
        </>
      )}

      {/* Confirmation modal for Clear All */}
      {showClearConfirm && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="clear-title">
          <div className="modal-box">
            <h3 id="clear-title">Clear all images?</h3>
            <p>
              This will remove all {items.length} selected images from your current workspace. Original
              files on your computer are never altered.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={() => {
                  setShowClearConfirm(false);
                  onClearAll();
                }}
              >
                Clear Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
