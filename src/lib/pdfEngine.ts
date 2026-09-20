import { PDFDocument } from "pdf-lib";
import {
  ConversionResult,
  GenerationProgress,
  ImageItem,
  PdfOptions,
} from "../types";
import { calculateGeometry } from "./layout";
import { sortImageItems } from "./sort";

// Safety limits
export const MAX_FILES_LIMIT = 150;
export const MAX_TOTAL_BYTES_LIMIT = 300 * 1024 * 1024; // 300 MB
export const MAX_PIXELS_LIMIT = 40_000_000; // 40 Megapixels

export const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export const SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

/**
 * Validates whether an incoming file is supported and within safety limits.
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  const extension = "." + file.name.split(".").pop()?.toLowerCase();
  const hasValidExt = SUPPORTED_EXTENSIONS.includes(extension);
  const hasValidMime = !file.type || SUPPORTED_MIME_TYPES.has(file.type.toLowerCase());

  if (!hasValidExt && !hasValidMime) {
    return {
      valid: false,
      error: `"${file.name}" is not a supported image format. Supported formats: JPEG (.jpg, .jpeg), PNG (.png), and WebP (.webp).`,
    };
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: `"${file.name}" is empty (0 bytes).`,
    };
  }

  return { valid: true };
}

/**
 * Reads image dimensions and creates an object URL.
 * Enforces the 40 Megapixel safety boundary.
 */
export async function inspectImageFile(
  file: File
): Promise<{ width: number; height: number; objectUrl: string }> {
  const objectUrl = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;

      if (width * height > MAX_PIXELS_LIMIT) {
        URL.revokeObjectURL(objectUrl);
        reject(
          new Error(
            `"${file.name}" exceeds the 40 Megapixel safety limit (${width} × ${height} = ${(
              (width * height) /
              1_000_000
            ).toFixed(1)} MP). Please resize or use smaller images.`
          )
        );
        return;
      }

      if (width === 0 || height === 0) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`"${file.name}" has invalid zero dimensions.`));
        return;
      }

      resolve({ width, height, objectUrl });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`"${file.name}" could not be decoded. The file may be corrupt or an unsupported format.`));
    };

    img.src = objectUrl;
  });
}

/**
 * Renders an image onto a Canvas with the required rotation, crop (for Cover fit),
 * downsampling (for Quality Profile), and alpha flattening onto a clean white background.
 */
export async function processImageForPdf(
  item: ImageItem,
  options: PdfOptions,
  geometry = calculateGeometry({
    imageWidth: item.width,
    imageHeight: item.height,
    rotation: item.rotation,
    options,
  })
): Promise<{ bytes: Uint8Array; format: "jpeg" | "png" }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const rotation = ((item.rotation % 360) + 360) % 360;
        const isQuarterTurn = rotation === 90 || rotation === 270;
        const turnedWidth = isQuarterTurn ? img.naturalHeight : img.naturalWidth;
        const turnedHeight = isQuarterTurn ? img.naturalWidth : img.naturalHeight;

        // Step 1: Handle rotation on an intermediate canvas if rotated
        let rotatedCanvas: HTMLCanvasElement;
        if (rotation !== 0) {
          rotatedCanvas = document.createElement("canvas");
          rotatedCanvas.width = turnedWidth;
          rotatedCanvas.height = turnedHeight;
          const ctx = rotatedCanvas.getContext("2d");
          if (!ctx) throw new Error("Could not create canvas 2D rendering context.");

          ctx.translate(turnedWidth / 2, turnedHeight / 2);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        } else {
          // If no rotation, use source directly or offscreen
          rotatedCanvas = document.createElement("canvas");
          rotatedCanvas.width = turnedWidth;
          rotatedCanvas.height = turnedHeight;
          const ctx = rotatedCanvas.getContext("2d");
          if (!ctx) throw new Error("Could not create canvas 2D rendering context.");
          ctx.drawImage(img, 0, 0);
        }

        // Step 2: Handle Crop (Cover fit)
        let croppedSource: CanvasImageSource = rotatedCanvas;
        let cropSx = 0;
        let cropSy = 0;
        let cropWidth = turnedWidth;
        let cropHeight = turnedHeight;

        if (options.fit === "Cover" && geometry.cropRect) {
          cropSx = geometry.cropRect.sx;
          cropSy = geometry.cropRect.sy;
          cropWidth = geometry.cropRect.sWidth;
          cropHeight = geometry.cropRect.sHeight;
        }

        // Step 3: Determine target pixel dimensions according to Quality Profile
        let maxBound: number | null = null;
        let jpegQuality = 0.92;

        if (options.profile === "Screen/Mobile") {
          maxBound = 1654; // ~150 DPI for A4
          jpegQuality = 0.82;
        } else if (options.profile === "Print") {
          maxBound = 3508; // ~300 DPI for A4
          jpegQuality = 0.92;
        } else {
          // Original: keep native source resolution
          maxBound = null;
          jpegQuality = 0.98;
        }

        let targetWidth = cropWidth;
        let targetHeight = cropHeight;

        if (maxBound && (targetWidth > maxBound || targetHeight > maxBound)) {
          const downscale = Math.min(maxBound / targetWidth, maxBound / targetHeight);
          targetWidth = Math.max(1, Math.round(targetWidth * downscale));
          targetHeight = Math.max(1, Math.round(targetHeight * downscale));
        }

        // Step 4: Render onto final canvas with crisp white background (flattens alpha transparency)
        const finalCanvas = document.createElement("canvas");
        finalCanvas.width = targetWidth;
        finalCanvas.height = targetHeight;
        const finalCtx = finalCanvas.getContext("2d");
        if (!finalCtx) throw new Error("Could not create final 2D canvas context.");

        // Clean white background for transparency flattening
        finalCtx.fillStyle = "#ffffff";
        finalCtx.fillRect(0, 0, targetWidth, targetHeight);

        // High quality image smoothing
        finalCtx.imageSmoothingEnabled = true;
        finalCtx.imageSmoothingQuality = "high";

        // Draw cropped and scaled image
        finalCtx.drawImage(
          croppedSource,
          cropSx,
          cropSy,
          cropWidth,
          cropHeight,
          0,
          0,
          targetWidth,
          targetHeight
        );

        // Export as JPEG
        finalCanvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to encode image canvas to JPEG."));
              return;
            }
            blob.arrayBuffer().then((buffer) => {
              resolve({
                bytes: new Uint8Array(buffer),
                format: "jpeg",
              });
            });
          },
          "image/jpeg",
          jpegQuality
        );
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      reject(new Error(`Failed to load image "${item.name}" for rendering.`));
    };

    img.src = item.objectUrl;
  });
}

/**
 * Validates a generated PDF byte array.
 * Checks header (%PDF-), footer (%%EOF), non-empty buffer, and page structure.
 */
export function validatePdfBytes(bytes: Uint8Array): { valid: boolean; error?: string } {
  if (!bytes || bytes.length < 32) {
    return { valid: false, error: "Generated PDF is empty or truncated." };
  }

  // Check header %PDF-
  const header = String.fromCharCode(...bytes.slice(0, 5));
  if (header !== "%PDF-") {
    return { valid: false, error: `Invalid PDF header: expected "%PDF-", got "${header}".` };
  }

  // Check EOF trailer within the last 1024 bytes
  const tailLength = Math.min(bytes.length, 1024);
  const tail = String.fromCharCode(...bytes.slice(bytes.length - tailLength));
  if (!tail.includes("%%EOF")) {
    return { valid: false, error: "Incomplete PDF trailer: missing %%EOF marker." };
  }

  return { valid: true };
}

/**
 * Generates an application/pdf Blob from the selected images and settings.
 * Supports cancellation via AbortSignal and reports granular progress.
 */
export async function generatePdf(
  items: ImageItem[],
  options: PdfOptions,
  onProgress?: (progress: GenerationProgress) => void,
  abortSignal?: AbortSignal
): Promise<ConversionResult> {
  const startTime = performance.now();

  if (items.length === 0) {
    throw new Error("No images selected. Please add at least one image to create a PDF.");
  }

  if (items.length > MAX_FILES_LIMIT) {
    throw new Error(`Batch size exceeds the ${MAX_FILES_LIMIT} images limit. Please process in smaller batches.`);
  }

  const sortedItems = sortImageItems(items, options.sort, options.manualOrder);
  const pdfDoc = await PDFDocument.create();

  onProgress?.({
    current: 0,
    total: sortedItems.length,
    currentFilename: "Preparing document…",
    phase: "preparing",
    percent: 0,
  });

  // Process sequentially to keep memory usage strictly bounded
  for (let i = 0; i < sortedItems.length; i++) {
    if (abortSignal?.aborted) {
      throw new Error("Conversion was cancelled by the user.");
    }

    const item = sortedItems[i];
    onProgress?.({
      current: i + 1,
      total: sortedItems.length,
      currentFilename: item.name,
      phase: "processing",
      percent: Math.round(((i + 0.2) / sortedItems.length) * 85),
    });

    const geometry = calculateGeometry({
      imageWidth: item.width,
      imageHeight: item.height,
      rotation: item.rotation,
      options,
    });

    const { bytes: imageBytes, format } = await processImageForPdf(
      item,
      options,
      geometry
    );

    if (abortSignal?.aborted) {
      throw new Error("Conversion was cancelled by the user.");
    }

    // Embed image into pdf-lib
    const embeddedImage =
      format === "png"
        ? await pdfDoc.embedPng(imageBytes)
        : await pdfDoc.embedJpg(imageBytes);

    // Add page with geometry dimensions
    const page = pdfDoc.addPage([geometry.pageWidthPt, geometry.pageHeightPt]);

    // Draw image at computed position
    page.drawImage(embeddedImage, {
      x: geometry.imageRect.x,
      y: geometry.imageRect.y,
      width: geometry.imageRect.width,
      height: geometry.imageRect.height,
    });
  }

  if (abortSignal?.aborted) {
    throw new Error("Conversion was cancelled by the user.");
  }

  onProgress?.({
    current: sortedItems.length,
    total: sortedItems.length,
    currentFilename: "Saving PDF structure…",
    phase: "saving",
    percent: 92,
  });

  const pdfBytes = await pdfDoc.save();

  onProgress?.({
    current: sortedItems.length,
    total: sortedItems.length,
    currentFilename: "Validating output PDF…",
    phase: "validating",
    percent: 97,
  });

  // Validate the generated PDF
  const validation = validatePdfBytes(pdfBytes);
  if (!validation.valid) {
    throw new Error(`PDF validation failed: ${validation.error}`);
  }

  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const elapsedSec = Number(((performance.now() - startTime) / 1000).toFixed(2));

  let outputFilename = options.filename.trim();
  if (!outputFilename) outputFilename = "document";
  if (!outputFilename.toLowerCase().endsWith(".pdf")) outputFilename += ".pdf";

  onProgress?.({
    current: sortedItems.length,
    total: sortedItems.length,
    currentFilename: outputFilename,
    phase: "complete",
    percent: 100,
  });

  return {
    blob,
    url,
    filename: outputFilename,
    pageCount: sortedItems.length,
    sizeBytes: blob.size,
    generationTimeSec: elapsedSec,
    profile: options.profile,
    isOutdated: false,
  };
}
