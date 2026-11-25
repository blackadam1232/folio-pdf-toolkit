import React, { useEffect, useRef } from "react";
import { ImageItem, PdfOptions } from "../types";
import { calculateGeometry } from "../lib/layout";
import { CopyIcon, EditIcon, RotateIcon, TrashIcon } from "./Icons";

interface ThumbnailSheetProps {
  item: ImageItem;
  pageIndex: number;
  options: PdfOptions;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onInspect: (id: string) => void;
  onEdit: (id: string) => void;
  total: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onDuplicate: (id: string) => void;
  onRotate: (id: string) => void;
}

export const ThumbnailSheet: React.FC<ThumbnailSheetProps> = ({
  item,
  pageIndex,
  options,
  isSelected,
  onToggleSelect,
  onInspect,
  onEdit,
  onDuplicate,
  onRotate, total, onMove, onRemove,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const itemOptions = React.useMemo((): PdfOptions => ({
    ...options,
    ...(item.customOptions || {}),
  }), [options, item.customOptions]);

  // Calculate layout geometry using the exact shared engine
  const geometry = React.useMemo(() => {
    try {
      return calculateGeometry({ imageWidth: item.width, imageHeight: item.height, rotation: item.rotation, crop: item.crop, options: itemOptions });
    } catch { return null; }
  }, [item.width, item.height, item.rotation, item.crop, itemOptions]);
  const layoutError = !geometry;
  const sheetAspect = geometry
    ? geometry.pageWidthPt / geometry.pageHeightPt
    : 210 / 297;

  const [isVisible, setIsVisible] = React.useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Render miniature sheet onto canvas for 100% faithful preview
  useEffect(() => {
    if (!isVisible) return;
    const canvas = canvasRef.current;
    if (!canvas || !geometry) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isMounted = true;
    const img = new Image();

    img.onload = () => {
      if (!isMounted) return;

      const { pageWidthPt, pageHeightPt, marginsPt, imageRect, cropRect } = geometry!;

      // Display dimensions of thumbnail canvas
      const displayW = 200;
      const scale = displayW / pageWidthPt;
      const displayH = Math.round(pageHeightPt * scale);

      canvas.width = displayW * 2; // 2x for sharp retina rendering
      canvas.height = displayH * 2;
      canvas.style.width = "100%";
      canvas.style.height = "100%";

      const cScale = (displayW * 2) / pageWidthPt;

      // 1. Clean white paper sheet background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. Faint dashed printable area margins
      const printableX = marginsPt.left * cScale;
      const printableY = marginsPt.top * cScale;
      const printableW = (pageWidthPt - marginsPt.left - marginsPt.right) * cScale;
      const printableH = (pageHeightPt - marginsPt.top - marginsPt.bottom) * cScale;

      ctx.save();
      ctx.strokeStyle = "rgba(79, 110, 84, 0.28)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(printableX, printableY, printableW, printableH);
      ctx.restore();

      // 3. Render rotated and flipped image on intermediate canvas
      const rotation = ((item.rotation % 360) + 360) % 360;
      const isQuarterTurn = rotation === 90 || rotation === 270;
      const turnedWidth = isQuarterTurn ? img.naturalHeight : img.naturalWidth;
      const turnedHeight = isQuarterTurn ? img.naturalWidth : img.naturalHeight;

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = turnedWidth;
      tempCanvas.height = turnedHeight;
      const tempCtx = tempCanvas.getContext("2d");

      if (tempCtx) {
        tempCtx.translate(turnedWidth / 2, turnedHeight / 2);
        if (item.flipH) tempCtx.scale(-1, 1);
        if (item.flipV) tempCtx.scale(1, -1);
        if (rotation !== 0) {
          tempCtx.rotate((rotation * Math.PI) / 180);
        }
        tempCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

        let sx = 0;
        let sy = 0;
        let sWidth = turnedWidth;
        let sHeight = turnedHeight;

        if (cropRect) {
          sx = cropRect.sx;
          sy = cropRect.sy;
          sWidth = cropRect.sWidth;
          sHeight = cropRect.sHeight;
        }

        // Convert PDF coordinates (y=0 bottom) to Canvas coordinates (y=0 top)
        const canvasImageX = imageRect.x * cScale;
        const canvasImageY = (pageHeightPt - imageRect.y - imageRect.height) * cScale;
        const canvasImageW = imageRect.width * cScale;
        const canvasImageH = imageRect.height * cScale;

        // Clip to printable area
        ctx.save();
        ctx.beginPath();
        ctx.rect(printableX, printableY, printableW, printableH);
        ctx.clip();

        // Draw image
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "medium";
        ctx.drawImage(
          tempCanvas,
          sx,
          sy,
          sWidth,
          sHeight,
          canvasImageX,
          canvasImageY,
          canvasImageW,
          canvasImageH
        );
        ctx.restore();
      }
    };

    img.src = item.objectUrl;

    return () => {
      isMounted = false;
    };
  }, [
    item.objectUrl,
    item.rotation,
    item.flipH,
    item.flipV,
    item.crop,
    item.customOptions,
    options,
    geometry,
    isVisible,
  ]);

  const pageNumStr = String(pageIndex + 1).padStart(2, "0");
  const hasCustomSettings =
    item.customOptions && Object.keys(item.customOptions).length > 0;
  const isImageEdited =
    !!item.crop || item.rotation !== 0 || !!item.flipH || !!item.flipV;

  return (
    <div
      ref={containerRef}
      id={`page-card-${item.id}`}
      role="listitem"
      className={`page-card${isSelected ? " selected" : ""}`}
      aria-label={`Page ${pageIndex + 1}, ${item.name}`}
    >
      <label className="thumbnail-select">
        <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(item.id)}
          aria-label={`Select page ${pageIndex + 1}`} />
      </label>

      <details className="page-options"
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}
        onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
        <summary aria-label={`Actions for page ${pageIndex + 1}`} title="More page actions">⋮</summary>
        <div className="page-options-list" onClick={event => {
          const menu = event.currentTarget.closest("details");
          if (menu) { menu.open = false; menu.querySelector("summary")?.focus(); }
        }}>
          <button onClick={() => onInspect(item.id)}>Inspect page</button>
          <button disabled={pageIndex === 0} onClick={() => onMove(-1)}>Move earlier</button>
          <button disabled={pageIndex + 1 === total} onClick={() => onMove(1)}>Move later</button>
          <button type="button" className="page-action-delete" onClick={onRemove}><TrashIcon /> Delete page</button>
        </div>
      </details>

      {/* Miniature Paper Sheet container */}
      <button type="button" className="sheet-backdrop thumbnail-preview" onClick={() => onInspect(item.id)}
        aria-label={`Inspect page ${pageIndex + 1}, ${item.name}`}>
        <span
          className="sheet-paper"
          style={{
            aspectRatio: `${sheetAspect}`,
          }}
        >
          {layoutError ? (
            <span className="sheet-error-notice">Margins exceed page</span>
          ) : (
            <canvas ref={canvasRef} className="sheet-canvas" />
          )}
        </span>
      </button>

      {/* Card bottom metadata */}
      <div className="card-meta">
        <span className="card-page-num">{pageNumStr}</span>
        <span className="card-filename" title={item.name}>
          {item.name}
        </span>

        {/* Badges */}
        {hasCustomSettings && (
          <span
            className="card-custom-badge"
            title="Custom per-page document settings applied"
          >
            Custom settings
          </span>
        )}
        {isImageEdited && !hasCustomSettings && (
          <span className="card-edit-badge" title="Image cropped, rotated, or flipped">
            Edited
          </span>
        )}
      </div>
      <div className="thumbnail-action-row">
        <button type="button" onClick={() => onEdit(item.id)} aria-label={`Edit page ${pageIndex + 1}`}>
          <EditIcon /><span>Edit</span>
        </button>
        <button type="button" onClick={() => onDuplicate(item.id)} aria-label={`Copy page ${pageIndex + 1}`} title="Duplicate this page">
          <CopyIcon /><span>Copy</span>
        </button>
        <button type="button" onClick={() => onRotate(item.id)} aria-label={`Rotate page ${pageIndex + 1} clockwise 90 degrees`}>
          <RotateIcon /><span>Rotate</span>
        </button>
      </div>
    </div>
  );
};
