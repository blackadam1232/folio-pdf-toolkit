import React from "react";
import { ImageItem, PdfOptions } from "../types";
import { CheckIcon, RotateIcon } from "./Icons";

interface ThumbnailSheetProps {
  item: ImageItem;
  pageIndex: number;
  options: PdfOptions;
  isSelected: boolean;
  isActiveInspect: boolean;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  onInspect: (id: string) => void;
  onRotate?: (id: string, e: React.MouseEvent) => void;
}

export const ThumbnailSheet: React.FC<ThumbnailSheetProps> = ({
  item,
  pageIndex,
  options,
  isSelected,
  isActiveInspect,
  onToggleSelect,
  onInspect,
  onRotate,
}) => {
  const itemOptions: PdfOptions = {
    ...options,
    ...(item.customOptions || {}),
  };

  // Determine sheet aspect ratio based on page size and orientation
  let isLandscape = false;
  const rotation = ((item.rotation % 360) + 360) % 360;
  const isQuarterTurn = rotation === 90 || rotation === 270;
  const effectiveWidth = isQuarterTurn ? item.height : item.width;
  const effectiveHeight = isQuarterTurn ? item.width : item.height;

  if (itemOptions.orientation === "Landscape") {
    isLandscape = true;
  } else if (itemOptions.orientation === "Auto") {
    isLandscape = effectiveWidth > effectiveHeight;
  }

  let sheetAspect = 210 / 297; // Default A4 portrait (~0.707)
  if (itemOptions.pageSize === "Letter") {
    sheetAspect = 8.5 / 11; // ~0.773
  } else if (itemOptions.pageSize === "Original") {
    sheetAspect = effectiveWidth / effectiveHeight;
  }

  if (isLandscape && itemOptions.pageSize !== "Original") {
    sheetAspect = 1 / sheetAspect;
  }

  // Margin percentage relative to sheet width
  let marginPercent = 4; // none / default
  if (itemOptions.marginPreset === "Small") marginPercent = 6;
  if (itemOptions.marginPreset === "Medium") marginPercent = 10;
  if (itemOptions.marginPreset === "Large") marginPercent = 14;
  if (itemOptions.marginPreset === "None") marginPercent = 0;
  if (itemOptions.marginPreset === "Custom") {
    const avgMm =
      (itemOptions.customMargins[0] +
        itemOptions.customMargins[1] +
        itemOptions.customMargins[2] +
        itemOptions.customMargins[3]) /
      4;
    marginPercent = Math.min(25, Math.max(0, (avgMm / 210) * 100));
  }

  const pageNumStr = String(pageIndex + 1).padStart(2, "0");

  return (
    <div
      id={`page-card-${item.id}`}
      role="listitem"
      className={`page-card ${isSelected ? "selected" : ""} ${
        isActiveInspect ? "active-inspect" : ""
      }`}
      onClick={() => onInspect(item.id)}
      title={`Page ${pageIndex + 1}: ${item.name} (Click to open full view)`}
    >
      {/* Selection Checkbox with visible checkmark and accessible touch target */}
      <button
        type="button"
        role="checkbox"
        aria-checked={isSelected}
        className={`selection-check-circle ${isSelected ? "checked" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(item.id, e);
        }}
        aria-label={`Select page ${pageIndex + 1}`}
      >
        {isSelected ? (
          <CheckIcon className="check-svg" />
        ) : (
          <span className="uncheck-dot" />
        )}
      </button>

      {/* Quick Rotate button on card hover/focus */}
      {onRotate && (
        <button
          type="button"
          className="card-quick-rotate"
          onClick={(e) => {
            e.stopPropagation();
            onRotate(item.id, e);
          }}
          aria-label={`Rotate page ${pageIndex + 1} clockwise`}
          title="Rotate 90° clockwise"
        >
          <RotateIcon className="rotate-icon-svg" />
        </button>
      )}

      {/* Miniature Paper Sheet container */}
      <div className="sheet-backdrop">
        <div
          className="sheet-paper"
          style={{
            aspectRatio: `${sheetAspect}`,
          }}
        >
          {/* Printable area guideline with margins */}
          <div
            className="sheet-printable-area"
            style={{
              padding: `${marginPercent}%`,
            }}
          >
            <div className="sheet-image-wrap">
              <img
                src={item.objectUrl}
                alt={item.name}
                className="sheet-img"
                style={{
                  objectFit: itemOptions.fit === "Cover" ? "cover" : "contain",
                  transform: `rotate(${item.rotation}deg)`,
                }}
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Card bottom metadata: 01 filename.jpg */}
      <div className="card-meta">
        <span className="card-page-num">{pageNumStr}</span>
        <span className="card-filename" title={item.name}>
          {item.name}
        </span>
        {item.customOptions && Object.keys(item.customOptions).length > 0 && (
          <span
            className="card-custom-badge"
            title="Custom per-page settings applied"
          >
            {item.customOptions.orientation
              ? item.customOptions.orientation === "Landscape"
                ? "Land."
                : "Port."
              : item.customOptions.pageSize || "Custom"}
          </span>
        )}
      </div>
    </div>
  );
};
