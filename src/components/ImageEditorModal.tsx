import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { CropRect, ImageItem } from "../types";
import {
  RotateCcwIcon,
  RotateCwIcon,
  FlipHIcon,
  FlipVIcon,
  CropIcon,
  ResetIcon,
  CheckIcon,
} from "./Icons";

interface ImageEditorModalProps {
  item: ImageItem | null;
  pageIndex: number;
  totalPages: number;
  isOpen: boolean;
  onClose: () => void;
  onApply: (edits: {
    rotation: number;
    flipH: boolean;
    flipV: boolean;
    crop?: CropRect;
  }) => void;
}

type AspectPreset = "free" | "1:1" | "4:3" | "16:9" | "3:2" | "a4";
type DragHandle = "move" | "nw" | "ne" | "se" | "sw" | "n" | "s" | "e" | "w" | null;

interface DragState {
  handle: DragHandle;
  startClientX: number;
  startClientY: number;
  startCrop: CropRect;
  containerRect: DOMRect;
}

export const ImageEditorModal: React.FC<ImageEditorModalProps> = ({
  item,
  pageIndex,
  totalPages,
  isOpen,
  onClose,
  onApply,
}) => {
  if (!isOpen || !item) return null;

  // Initial draft states
  const [draftRotation, setDraftRotation] = useState<number>(item.rotation || 0);
  const [draftFlipH, setDraftFlipH] = useState<boolean>(item.flipH || false);
  const [draftFlipV, setDraftFlipV] = useState<boolean>(item.flipV || false);
  const [draftCrop, setDraftCrop] = useState<CropRect>(() => {
    if (item.crop) return { ...item.crop };
    return { x: 0, y: 0, width: 1, height: 1 };
  });

  const [aspectPreset, setAspectPreset] = useState<AspectPreset>("free");
  const [dragState, setDragState] = useState<DragState | null>(null);

  // Undo/Redo stack for edits within the modal
  const [undoStack, setUndoStack] = useState<
    Array<{ rotation: number; flipH: boolean; flipV: boolean; crop: CropRect }>
  >([]);
  const [redoStack, setRedoStack] = useState<
    Array<{ rotation: number; flipH: boolean; flipV: boolean; crop: CropRect }>
  >([]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);

  // Push state to undo stack before changes
  const recordHistory = useCallback(() => {
    setUndoStack((prev) => [
      ...prev.slice(-15),
      {
        rotation: draftRotation,
        flipH: draftFlipH,
        flipV: draftFlipV,
        crop: { ...draftCrop },
      },
    ]);
    setRedoStack([]);
  }, [draftRotation, draftFlipH, draftFlipV, draftCrop]);

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [
      ...prev,
      {
        rotation: draftRotation,
        flipH: draftFlipH,
        flipV: draftFlipV,
        crop: { ...draftCrop },
      },
    ]);
    setUndoStack((prev) => prev.slice(0, prev.length - 1));
    setDraftRotation(previous.rotation);
    setDraftFlipH(previous.flipH);
    setDraftFlipV(previous.flipV);
    setDraftCrop(previous.crop);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [
      ...prev,
      {
        rotation: draftRotation,
        flipH: draftFlipH,
        flipV: draftFlipV,
        crop: { ...draftCrop },
      },
    ]);
    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    setDraftRotation(next.rotation);
    setDraftFlipH(next.flipH);
    setDraftFlipV(next.flipV);
    setDraftCrop(next.crop);
  };

  // Dimensions of the rotated image
  const isQuarterTurn = draftRotation === 90 || draftRotation === 270;
  const orientedWidth = isQuarterTurn ? item.height : item.width;
  const orientedHeight = isQuarterTurn ? item.width : item.height;
  const imageAspectRatio = orientedWidth / orientedHeight;

  // Load source image
  useEffect(() => {
    const img = new Image();
    img.src = item.objectUrl;
    imageElementRef.current = img;
  }, [item.objectUrl]);

  // Render transformed image preview on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isMounted = true;
    const img = imageElementRef.current || new Image();

    const render = () => {
      if (!isMounted) return;
      // Use max display resolution for buttery smooth interaction
      const maxDim = 1200;
      let targetW = orientedWidth;
      let targetH = orientedHeight;
      if (targetW > maxDim || targetH > maxDim) {
        const scale = Math.min(maxDim / targetW, maxDim / targetH);
        targetW = Math.round(targetW * scale);
        targetH = Math.round(targetH * scale);
      }

      canvas.width = targetW;
      canvas.height = targetH;

      ctx.clearRect(0, 0, targetW, targetH);
      ctx.save();
      ctx.translate(targetW / 2, targetH / 2);

      if (draftFlipH) ctx.scale(-1, 1);
      if (draftFlipV) ctx.scale(1, -1);
      if (draftRotation !== 0) {
        ctx.rotate((draftRotation * Math.PI) / 180);
      }

      const drawW = isQuarterTurn ? targetH : targetW;
      const drawH = isQuarterTurn ? targetW : targetH;
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    };

    if (img.complete) {
      render();
    } else {
      img.onload = render;
    }

    return () => {
      isMounted = false;
    };
  }, [item.objectUrl, draftRotation, draftFlipH, draftFlipV, orientedWidth, orientedHeight, isQuarterTurn]);

  // Rotation: Rotate 90° CCW (-90°)
  const handleRotateCcw = () => {
    recordHistory();
    const newRot = (((draftRotation - 90) % 360) + 360) % 360;
    setDraftRotation(newRot);

    // Transform crop rectangle CCW
    setDraftCrop((c) => ({
      x: Math.max(0, Math.min(1 - c.height, c.y)),
      y: Math.max(0, Math.min(1 - c.width, 1 - (c.x + c.width))),
      width: c.height,
      height: c.width,
    }));
  };

  // Rotation: Rotate 90° CW (+90°)
  const handleRotateCw = () => {
    recordHistory();
    const newRot = (((draftRotation + 90) % 360) + 360) % 360;
    setDraftRotation(newRot);

    // Transform crop rectangle CW
    setDraftCrop((c) => ({
      x: Math.max(0, Math.min(1 - c.height, 1 - (c.y + c.height))),
      y: Math.max(0, Math.min(1 - c.width, c.x)),
      width: c.height,
      height: c.width,
    }));
  };

  // Flip Horizontal
  const handleFlipHorizontal = () => {
    recordHistory();
    setDraftFlipH((f) => !f);
    setDraftCrop((c) => ({
      ...c,
      x: Math.max(0, Math.min(1 - c.width, 1 - (c.x + c.width))),
    }));
  };

  // Flip Vertical
  const handleFlipVertical = () => {
    recordHistory();
    setDraftFlipV((f) => !f);
    setDraftCrop((c) => ({
      ...c,
      y: Math.max(0, Math.min(1 - c.height, 1 - (c.y + c.height))),
    }));
  };

  // Apply Aspect Ratio Preset
  const applyPreset = (preset: AspectPreset) => {
    recordHistory();
    setAspectPreset(preset);
    if (preset === "free") return;

    let targetRatio = 1;
    switch (preset) {
      case "1:1":
        targetRatio = 1;
        break;
      case "4:3":
        targetRatio = 4 / 3;
        break;
      case "16:9":
        targetRatio = 16 / 9;
        break;
      case "3:2":
        targetRatio = 3 / 2;
        break;
      case "a4":
        targetRatio = orientedWidth >= orientedHeight ? 297 / 210 : 210 / 297;
        break;
    }

    // Ratio in normalized coords: (w * orientedWidth) / (h * orientedHeight) = targetRatio
    const R = targetRatio / imageAspectRatio;
    let newW = 1;
    let newH = 1;
    if (R <= 1) {
      newW = Math.max(0.05, Math.min(1, R));
      newH = 1;
    } else {
      newW = 1;
      newH = Math.max(0.05, Math.min(1, 1 / R));
    }

    const newX = (1 - newW) / 2;
    const newY = (1 - newH) / 2;

    setDraftCrop({
      x: Math.max(0, Math.min(1 - newW, newX)),
      y: Math.max(0, Math.min(1 - newH, newY)),
      width: newW,
      height: newH,
    });
  };

  // Reset Image Edits
  const handleResetImageEdits = () => {
    recordHistory();
    setDraftRotation(0);
    setDraftFlipH(false);
    setDraftFlipV(false);
    setDraftCrop({ x: 0, y: 0, width: 1, height: 1 });
    setAspectPreset("free");
  };

  // Drag interaction with Pointer Events
  const handlePointerDown = (handle: DragHandle, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;

    recordHistory();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    setDragState({
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCrop: { ...draftCrop },
      containerRect: containerRef.current.getBoundingClientRect(),
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState || !containerRef.current) return;
    e.preventDefault();

    const { handle, startClientX, startClientY, startCrop, containerRect } = dragState;
    if (containerRect.width === 0 || containerRect.height === 0) return;

    const dx = (e.clientX - startClientX) / containerRect.width;
    const dy = (e.clientY - startClientY) / containerRect.height;

    const minSize = 0.05; // 5% minimum crop box size

    if (handle === "move") {
      let nx = startCrop.x + dx;
      let ny = startCrop.y + dy;
      nx = Math.max(0, Math.min(1 - startCrop.width, nx));
      ny = Math.max(0, Math.min(1 - startCrop.height, ny));
      setDraftCrop({
        ...startCrop,
        x: nx,
        y: ny,
      });
      return;
    }

    // Corner and edge resizes
    let left = startCrop.x;
    let top = startCrop.y;
    let right = startCrop.x + startCrop.width;
    let bottom = startCrop.y + startCrop.height;

    if (handle === "nw" || handle === "w" || handle === "sw") {
      left = Math.max(0, Math.min(right - minSize, startCrop.x + dx));
    }
    if (handle === "ne" || handle === "e" || handle === "se") {
      right = Math.min(1, Math.max(left + minSize, startCrop.x + startCrop.width + dx));
    }
    if (handle === "nw" || handle === "n" || handle === "ne") {
      top = Math.max(0, Math.min(bottom - minSize, startCrop.y + dy));
    }
    if (handle === "sw" || handle === "s" || handle === "se") {
      bottom = Math.min(1, Math.max(top + minSize, startCrop.y + startCrop.height + dy));
    }

    let newWidth = right - left;
    let newHeight = bottom - top;

    // Apply aspect preset constraint during resize if preset is active
    if (aspectPreset !== "free") {
      let targetRatio = 1;
      if (aspectPreset === "1:1") targetRatio = 1;
      else if (aspectPreset === "4:3") targetRatio = 4 / 3;
      else if (aspectPreset === "16:9") targetRatio = 16 / 9;
      else if (aspectPreset === "3:2") targetRatio = 3 / 2;
      else if (aspectPreset === "a4") targetRatio = orientedWidth >= orientedHeight ? 297 / 210 : 210 / 297;

      const normTargetRatio = targetRatio / imageAspectRatio;
      // Adjust width or height to preserve ratio
      if (handle === "w" || handle === "e" || handle === "nw" || handle === "ne") {
        newHeight = Math.max(minSize, Math.min(1 - top, newWidth / normTargetRatio));
      } else {
        newWidth = Math.max(minSize, Math.min(1 - left, newHeight * normTargetRatio));
      }
    }

    setDraftCrop({
      x: Math.max(0, Math.min(1 - minSize, left)),
      y: Math.max(0, Math.min(1 - minSize, top)),
      width: Math.max(minSize, Math.min(1 - left, newWidth)),
      height: Math.max(minSize, Math.min(1 - top, newHeight)),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragState) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Safe release
      }
      setDragState(null);
    }
  };

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        handleApply();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [draftRotation, draftFlipH, draftFlipV, draftCrop]);

  // Apply Changes
  const handleApply = () => {
    // Check if crop covers practically 100% of the image
    const isFullCrop =
      draftCrop.x <= 0.005 &&
      draftCrop.y <= 0.005 &&
      draftCrop.width >= 0.99 &&
      draftCrop.height >= 0.99;

    onApply({
      rotation: draftRotation,
      flipH: draftFlipH,
      flipV: draftFlipV,
      crop: isFullCrop ? undefined : draftCrop,
    });
    onClose();
  };

  return (
    <div
      className="folio-modal-backdrop image-editor-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-editor-title"
    >
      <div className="image-editor-modal">
        {/* Modal Header */}
        <header className="image-editor-header">
          <div className="header-meta">
            <h2 id="image-editor-title" className="editor-title">
              Edit image
            </h2>
            <span className="editor-subtitle">
              Page {pageIndex + 1} of {totalPages} — {item.name}
            </span>
          </div>

          <div className="header-actions">
            {undoStack.length > 0 && (
              <button
                type="button"
                className="btn-editor-ghost"
                onClick={handleUndo}
                title="Undo edit"
                aria-label="Undo edit"
              >
                ↶ Undo
              </button>
            )}
            {redoStack.length > 0 && (
              <button
                type="button"
                className="btn-editor-ghost"
                onClick={handleRedo}
                title="Redo edit"
                aria-label="Redo edit"
              >
                ↷ Redo
              </button>
            )}
            <button
              type="button"
              className="btn-editor-close"
              onClick={onClose}
              aria-label="Cancel editing and close"
            >
              ✕
            </button>
          </div>
        </header>

        {/* Center Viewport Stage */}
        <div className="image-editor-viewport">
          <div
            ref={containerRef}
            className="image-canvas-container"
            style={{
              aspectRatio: `${orientedWidth} / ${orientedHeight}`,
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {/* The Transformed Canvas */}
            <canvas ref={canvasRef} className="image-editor-canvas" />

            {/* Translucent Dim Mask Outside Crop */}
            <div
              className="crop-mask crop-mask-top"
              style={{
                top: 0,
                left: 0,
                right: 0,
                height: `${draftCrop.y * 100}%`,
              }}
            />
            <div
              className="crop-mask crop-mask-bottom"
              style={{
                bottom: 0,
                left: 0,
                right: 0,
                height: `${Math.max(0, 1 - draftCrop.y - draftCrop.height) * 100}%`,
              }}
            />
            <div
              className="crop-mask crop-mask-left"
              style={{
                top: `${draftCrop.y * 100}%`,
                bottom: `${Math.max(0, 1 - draftCrop.y - draftCrop.height) * 100}%`,
                left: 0,
                width: `${draftCrop.x * 100}%`,
              }}
            />
            <div
              className="crop-mask crop-mask-right"
              style={{
                top: `${draftCrop.y * 100}%`,
                bottom: `${Math.max(0, 1 - draftCrop.y - draftCrop.height) * 100}%`,
                right: 0,
                width: `${Math.max(0, 1 - draftCrop.x - draftCrop.width) * 100}%`,
              }}
            />

            {/* Interactive Draggable Crop Rectangle */}
            <div
              className="crop-rect-box"
              style={{
                left: `${draftCrop.x * 100}%`,
                top: `${draftCrop.y * 100}%`,
                width: `${draftCrop.width * 100}%`,
                height: `${draftCrop.height * 100}%`,
              }}
              onPointerDown={(e) => handlePointerDown("move", e)}
            >
              {/* 3x3 Rule-of-Thirds Grid */}
              <div className="crop-grid-line crop-grid-h1" />
              <div className="crop-grid-line crop-grid-h2" />
              <div className="crop-grid-line crop-grid-v1" />
              <div className="crop-grid-line crop-grid-v2" />

              {/* Corner Handles */}
              <div
                className="crop-handle crop-handle-nw"
                onPointerDown={(e) => handlePointerDown("nw", e)}
                aria-label="Resize crop top-left"
              />
              <div
                className="crop-handle crop-handle-ne"
                onPointerDown={(e) => handlePointerDown("ne", e)}
                aria-label="Resize crop top-right"
              />
              <div
                className="crop-handle crop-handle-se"
                onPointerDown={(e) => handlePointerDown("se", e)}
                aria-label="Resize crop bottom-right"
              />
              <div
                className="crop-handle crop-handle-sw"
                onPointerDown={(e) => handlePointerDown("sw", e)}
                aria-label="Resize crop bottom-left"
              />

              {/* Edge Handles */}
              <div
                className="crop-handle crop-handle-n"
                onPointerDown={(e) => handlePointerDown("n", e)}
                aria-label="Resize crop top"
              />
              <div
                className="crop-handle crop-handle-e"
                onPointerDown={(e) => handlePointerDown("e", e)}
                aria-label="Resize crop right"
              />
              <div
                className="crop-handle crop-handle-s"
                onPointerDown={(e) => handlePointerDown("s", e)}
                aria-label="Resize crop bottom"
              />
              <div
                className="crop-handle crop-handle-w"
                onPointerDown={(e) => handlePointerDown("w", e)}
                aria-label="Resize crop left"
              />
            </div>
          </div>
        </div>

        {/* Toolbar & Controls */}
        <div className="image-editor-toolbar">
          {/* Transform Actions: Rotate & Flip */}
          <div className="toolbar-section">
            <span className="toolbar-section-label">Transform</span>
            <div className="toolbar-button-group">
              <button
                type="button"
                className="btn-toolbar-tool"
                onClick={handleRotateCcw}
                title="Rotate 90° counter-clockwise"
                aria-label="Rotate left 90 degrees"
              >
                <RotateCcwIcon className="tool-icon-svg" />
                <span>Rotate left</span>
              </button>

              <button
                type="button"
                className="btn-toolbar-tool"
                onClick={handleRotateCw}
                title="Rotate 90° clockwise"
                aria-label="Rotate right 90 degrees"
              >
                <RotateCwIcon className="tool-icon-svg" />
                <span>Rotate right</span>
              </button>

              <button
                type="button"
                className={`btn-toolbar-tool ${draftFlipH ? "active-tool" : ""}`}
                onClick={handleFlipHorizontal}
                title="Flip horizontally"
                aria-label="Flip horizontally"
              >
                <FlipHIcon className="tool-icon-svg" />
                <span>Flip H</span>
              </button>

              <button
                type="button"
                className={`btn-toolbar-tool ${draftFlipV ? "active-tool" : ""}`}
                onClick={handleFlipVertical}
                title="Flip vertically"
                aria-label="Flip vertically"
              >
                <FlipVIcon className="tool-icon-svg" />
                <span>Flip V</span>
              </button>
            </div>
          </div>

          {/* Aspect Ratio Presets */}
          <div className="toolbar-section">
            <span className="toolbar-section-label">Crop Aspect Ratio</span>
            <div className="toolbar-button-group aspect-presets-group">
              <button
                type="button"
                className={`btn-aspect-chip ${aspectPreset === "free" ? "active" : ""}`}
                onClick={() => applyPreset("free")}
              >
                Free
              </button>
              <button
                type="button"
                className={`btn-aspect-chip ${aspectPreset === "1:1" ? "active" : ""}`}
                onClick={() => applyPreset("1:1")}
              >
                1:1
              </button>
              <button
                type="button"
                className={`btn-aspect-chip ${aspectPreset === "4:3" ? "active" : ""}`}
                onClick={() => applyPreset("4:3")}
              >
                4:3
              </button>
              <button
                type="button"
                className={`btn-aspect-chip ${aspectPreset === "16:9" ? "active" : ""}`}
                onClick={() => applyPreset("16:9")}
              >
                16:9
              </button>
              <button
                type="button"
                className={`btn-aspect-chip ${aspectPreset === "3:2" ? "active" : ""}`}
                onClick={() => applyPreset("3:2")}
              >
                3:2
              </button>
              <button
                type="button"
                className={`btn-aspect-chip ${aspectPreset === "a4" ? "active" : ""}`}
                onClick={() => applyPreset("a4")}
              >
                A4
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer Bar */}
        <footer className="image-editor-footer">
          <div className="footer-left">
            <button
              type="button"
              className="btn-editor-reset"
              onClick={handleResetImageEdits}
              title="Reset crop, rotation, and flip"
            >
              <ResetIcon className="reset-icon-svg" />
              <span>Reset image edits</span>
            </button>
          </div>

          <div className="footer-right">
            <button
              type="button"
              className="btn-editor-cancel"
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              type="button"
              className="btn-editor-apply"
              onClick={handleApply}
            >
              <CheckIcon className="apply-check-svg" />
              <span>Apply changes</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
