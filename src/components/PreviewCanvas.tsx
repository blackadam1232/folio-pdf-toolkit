import React, { useEffect, useRef } from "react";
import { ImageItem, PdfOptions } from "../types";
import { calculateGeometry, ptToMm } from "../lib/layout";

interface PreviewCanvasProps {
  item: ImageItem | null;
  options: PdfOptions;
  pageIndex: number;
  totalPages: number;
  onPageChange: (index: number) => void;
}

export const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  item,
  options,
  pageIndex,
  totalPages,
  onPageChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !item) return;

    let isMounted = true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      // Calculate geometry using the exact shared function
      const geometry = calculateGeometry({
        imageWidth: item.width,
        imageHeight: item.height,
        rotation: item.rotation,
        options,
      });

      const { pageWidthPt, pageHeightPt, marginsPt, imageRect, cropRect } = geometry;

      // Scale canvas for high-DPI displays
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = 440;
      const scale = displayWidth / pageWidthPt;
      const displayHeight = pageHeightPt * scale;

      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
      canvas.style.width = "100%";
      canvas.style.maxWidth = `${displayWidth}px`;
      canvas.style.aspectRatio = `${pageWidthPt} / ${pageHeightPt}`;

      ctx.scale(dpr * scale, dpr * scale);

      // 1. Draw page paper background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageWidthPt, pageHeightPt);

      // 2. Draw faint printable area guideline (margins)
      const printableX = marginsPt.left;
      const printableY = marginsPt.top;
      const printableW = pageWidthPt - marginsPt.left - marginsPt.right;
      const printableH = pageHeightPt - marginsPt.top - marginsPt.bottom;

      ctx.save();
      ctx.strokeStyle = "rgba(79, 110, 84, 0.25)";
      ctx.lineWidth = 1 / scale;
      ctx.setLineDash([4 / scale, 4 / scale]);
      ctx.strokeRect(printableX, printableY, printableW, printableH);
      ctx.restore();

      // 3. Render the image
      const img = new Image();
      img.onload = () => {
        if (!isMounted) return;

        const rotation = ((item.rotation % 360) + 360) % 360;
        const isQuarterTurn = rotation === 90 || rotation === 270;
        const turnedWidth = isQuarterTurn ? img.naturalHeight : img.naturalWidth;
        const turnedHeight = isQuarterTurn ? img.naturalWidth : img.naturalHeight;

        // In PDF coordinates, y=0 is bottom; in Canvas, y=0 is top.
        // Convert geometry.imageRect.y from PDF (bottom-origin) to Canvas (top-origin):
        const canvasImageY = pageHeightPt - imageRect.y - imageRect.height;
        const canvasImageX = imageRect.x;

        // Create temporary canvas for rotated image
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = turnedWidth;
        tempCanvas.height = turnedHeight;
        const tempCtx = tempCanvas.getContext("2d");
        if (tempCtx) {
          if (rotation !== 0) {
            tempCtx.translate(turnedWidth / 2, turnedHeight / 2);
            tempCtx.rotate((rotation * Math.PI) / 180);
            tempCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
          } else {
            tempCtx.drawImage(img, 0, 0);
          }

          let sx = 0;
          let sy = 0;
          let sWidth = turnedWidth;
          let sHeight = turnedHeight;

          if (options.fit === "Cover" && cropRect) {
            sx = cropRect.sx;
            sy = cropRect.sy;
            sWidth = cropRect.sWidth;
            sHeight = cropRect.sHeight;
          }

          // Clip to printable area if Contain/Cover
          ctx.save();
          ctx.beginPath();
          ctx.rect(printableX, printableY, printableW, printableH);
          ctx.clip();

          ctx.drawImage(
            tempCanvas,
            sx,
            sy,
            sWidth,
            sHeight,
            canvasImageX,
            canvasImageY,
            imageRect.width,
            imageRect.height
          );
          ctx.restore();
        }
      };

      img.src = item.objectUrl;
    } catch {
      // Geometry error (e.g. excessive margins) will be displayed by the settings panel
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fce8e6";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#c5221f";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Margins exceed page size", canvas.width / 2, canvas.height / 2);
    }

    return () => {
      isMounted = false;
    };
  }, [item, options, item?.rotation]);

  if (!item) {
    return (
      <div className="preview-empty">
        <div className="preview-empty-icon">▦</div>
        <h3>Live Layout Preview</h3>
        <p>Select or upload images to preview page geometry, margins, and fitting.</p>
      </div>
    );
  }

  // Calculate current page geometry for metadata display
  let dimensionsText = "";
  try {
    const geo = calculateGeometry({
      imageWidth: item.width,
      imageHeight: item.height,
      rotation: item.rotation,
      options,
    });
    dimensionsText = `${ptToMm(geo.pageWidthPt).toFixed(0)} × ${ptToMm(geo.pageHeightPt).toFixed(0)} mm (${options.pageSize})`;
  } catch {
    dimensionsText = "Invalid layout";
  }

  return (
    <div className="preview-container">
      <div className="preview-meta">
        <div>
          <span className="preview-page-badge">
            Page {pageIndex + 1} of {totalPages}
          </span>
          <span className="preview-filename" title={item.name}>
            {item.name}
          </span>
        </div>
        <span className="preview-dims">{dimensionsText}</span>
      </div>

      <div className="preview-canvas-wrapper">
        <canvas ref={canvasRef} className="preview-canvas" />
      </div>

      {totalPages > 1 && (
        <div className="preview-pagination">
          <button
            type="button"
            className="pagination-btn"
            disabled={pageIndex === 0}
            onClick={() => onPageChange(pageIndex - 1)}
            aria-label="Previous preview page"
          >
            ← Prev
          </button>
          <span className="pagination-text">
            {pageIndex + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="pagination-btn"
            disabled={pageIndex === totalPages - 1}
            onClick={() => onPageChange(pageIndex + 1)}
            aria-label="Next preview page"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};
