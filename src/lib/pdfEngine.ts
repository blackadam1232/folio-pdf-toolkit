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

    const itemOptions: PdfOptions = {
      ...options,
      ...(item.customOptions || {}),
    };

    const geometry = calculateGeometry({
      imageWidth: item.width,
      imageHeight: item.height,
      rotation: item.rotation,
      options: itemOptions,
    });

    const { bytes: imageBytes, format } = await processImageForPdf(
      item,
      itemOptions,
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

/**
 * Inspects a PDF file and returns page count and metadata.
 */
export async function inspectPdfFile(file: File): Promise<{ pageCount: number; title?: string }> {
  const buffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  if (pdfDoc.isEncrypted) {
    throw new Error(`"${file.name}" is password protected or encrypted. Folio does not bypass PDF encryption.`);
  }
  return {
    pageCount: pdfDoc.getPageCount(),
    title: pdfDoc.getTitle(),
  };
}

/**
 * Merges multiple PDF files in order into a single PDF document.
 */
export async function mergePdfs(files: File[]): Promise<{ bytes: Uint8Array; pageCount: number }> {
  if (files.length < 2) {
    throw new Error("Please select at least 2 PDF files to merge.");
  }

  const mergedDoc = await PDFDocument.create();

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const sourceDoc = await PDFDocument.load(buffer);
    if (sourceDoc.isEncrypted) {
      throw new Error(`"${file.name}" is encrypted and cannot be merged.`);
    }
    const pageIndices = sourceDoc.getPageIndices();
    const copiedPages = await mergedDoc.copyPages(sourceDoc, pageIndices);
    copiedPages.forEach((page) => mergedDoc.addPage(page));
  }

  const bytes = await mergedDoc.save();
  return {
    bytes,
    pageCount: mergedDoc.getPageCount(),
  };
}

/**
 * Parses and validates a page range expression like "1-3, 5, 8-10".
 * Returns 0-based unique page indices.
 */
export function parsePageRange(rangeStr: string, totalPages: number): number[] {
  if (!rangeStr.trim()) {
    throw new Error("Page range expression cannot be empty.");
  }

  const parts = rangeStr.split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) {
    throw new Error("Invalid page range expression.");
  }

  const resultIndices = new Set<number>();

  for (const part of parts) {
    if (part.includes("-")) {
      const bounds = part.split("-").map((b) => b.trim());
      if (bounds.length !== 2) {
        throw new Error(`Invalid range segment "${part}". Use format: "start-end" (e.g. 1-5).`);
      }
      const start = parseInt(bounds[0], 10);
      const end = parseInt(bounds[1], 10);

      if (isNaN(start) || isNaN(end)) {
        throw new Error(`Non-numeric page range "${part}".`);
      }
      if (start < 1) {
        throw new Error(`Page numbers must start at 1 or greater (got ${start}).`);
      }
      if (start > end) {
        throw new Error(`Reversed page range "${part}": start (${start}) cannot be greater than end (${end}).`);
      }
      if (end > totalPages) {
        throw new Error(`Page ${end} exceeds total document pages (${totalPages}).`);
      }

      for (let p = start; p <= end; p++) {
        resultIndices.add(p - 1);
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (isNaN(pageNum)) {
        throw new Error(`Invalid page specification "${part}". Expected a number or range.`);
      }
      if (pageNum < 1 || pageNum > totalPages) {
        throw new Error(`Page ${pageNum} is out of bounds (document has ${totalPages} pages).`);
      }
      resultIndices.add(pageNum - 1);
    }
  }

  return Array.from(resultIndices).sort((a, b) => a - b);
}

/**
 * Splits a PDF by page ranges into a single extracted PDF or multiple individual PDFs.
 */
export async function splitPdf(
  file: File,
  rangeStr: string
): Promise<{ singlePdf: Uint8Array; splitFiles: { name: string; bytes: Uint8Array }[] }> {
  const buffer = await file.arrayBuffer();
  const sourceDoc = await PDFDocument.load(buffer);
  const totalPages = sourceDoc.getPageCount();

  const selectedIndices = parsePageRange(rangeStr, totalPages);
  if (selectedIndices.length === 0) {
    throw new Error("No valid pages selected for extraction.");
  }

  // Generate single extracted PDF
  const combinedDoc = await PDFDocument.create();
  const copiedPages = await combinedDoc.copyPages(sourceDoc, selectedIndices);
  copiedPages.forEach((p) => combinedDoc.addPage(p));
  const singlePdf = await combinedDoc.save();

  // Generate individual split files for zip / multi-download
  const splitFiles: { name: string; bytes: Uint8Array }[] = [];
  const baseName = file.name.replace(/\.[^/.]+$/, "");

  for (let i = 0; i < selectedIndices.length; i++) {
    const pageIndex = selectedIndices[i];
    const indDoc = await PDFDocument.create();
    const [page] = await indDoc.copyPages(sourceDoc, [pageIndex]);
    indDoc.addPage(page);
    const bytes = await indDoc.save();
    splitFiles.push({
      name: `${baseName}_page_${pageIndex + 1}.pdf`,
      bytes,
    });
  }

  return { singlePdf, splitFiles };
}

/**
 * Rotates pages in a PDF document by 90, 180, or 270 degrees.
 */
export async function rotatePdf(
  file: File,
  angleDeg: 90 | 180 | 270,
  pageIndices?: number[]
): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  const doc = await PDFDocument.load(buffer);
  const totalPages = doc.getPageCount();

  const targets = pageIndices && pageIndices.length > 0 ? pageIndices : doc.getPageIndices();

  for (const idx of targets) {
    if (idx >= 0 && idx < totalPages) {
      const page = doc.getPage(idx);
      const currentRotation = page.getRotation().angle;
      page.setRotation({ type: "degrees", angle: (currentRotation + angleDeg) % 360 } as any);
    }
  }

  return await doc.save();
}

/**
 * Adds page numbers to a PDF document with customizable formatting and positioning.
 */
export async function addPageNumbersToPdf(
  file: File,
  options: {
    position: "bottom-center" | "bottom-right" | "top-center" | "top-right";
    format: "number" | "page-x-of-y";
    startNumber: number;
    fontSize: number;
    pageRange?: string;
  }
): Promise<Uint8Array> {
  const { rgb, StandardFonts } = await import("pdf-lib");
  const buffer = await file.arrayBuffer();
  const doc = await PDFDocument.load(buffer);
  const totalPages = doc.getPageCount();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const targetIndices = options.pageRange?.trim()
    ? parsePageRange(options.pageRange, totalPages)
    : doc.getPageIndices();

  for (let i = 0; i < targetIndices.length; i++) {
    const pageIdx = targetIndices[i];
    const page = doc.getPage(pageIdx);
    const { width, height } = page.getSize();
    const currentNum = options.startNumber + i;
    const text =
      options.format === "page-x-of-y"
        ? `Page ${currentNum} of ${totalPages}`
        : `${currentNum}`;

    const textWidth = font.widthOfTextAtSize(text, options.fontSize);
    const textHeight = font.heightAtSize(options.fontSize);

    let x = width / 2 - textWidth / 2;
    let y = 30;

    switch (options.position) {
      case "bottom-center":
        x = (width - textWidth) / 2;
        y = 28;
        break;
      case "bottom-right":
        x = width - textWidth - 36;
        y = 28;
        break;
      case "top-center":
        x = (width - textWidth) / 2;
        y = height - textHeight - 28;
        break;
      case "top-right":
        x = width - textWidth - 36;
        y = height - textHeight - 28;
        break;
    }

    page.drawText(text, {
      x,
      y,
      size: options.fontSize,
      font,
      color: rgb(0.2, 0.22, 0.22),
    });
  }

  return await doc.save();
}

/**
 * Adds a customizable text watermark to a PDF document.
 */
export async function addWatermarkToPdf(
  file: File,
  options: {
    text: string;
    fontSize: number;
    color: string;
    opacity: number;
    angleDeg: number;
    position: "diagonal" | "center" | "header" | "footer";
    pageRange?: string;
  }
): Promise<Uint8Array> {
  const { rgb, degrees, StandardFonts } = await import("pdf-lib");
  const buffer = await file.arrayBuffer();
  const doc = await PDFDocument.load(buffer);
  const totalPages = doc.getPageCount();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  const targetIndices = options.pageRange?.trim()
    ? parsePageRange(options.pageRange, totalPages)
    : doc.getPageIndices();

  // Parse color hex or fallback to charcoal
  let r = 0.3, g = 0.3, b = 0.3;
  if (options.color.startsWith("#") && options.color.length === 7) {
    r = parseInt(options.color.slice(1, 3), 16) / 255;
    g = parseInt(options.color.slice(3, 5), 16) / 255;
    b = parseInt(options.color.slice(5, 7), 16) / 255;
  }

  for (const pageIdx of targetIndices) {
    const page = doc.getPage(pageIdx);
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(options.text, options.fontSize);
    const textHeight = font.heightAtSize(options.fontSize);

    let x = (width - textWidth) / 2;
    let y = (height - textHeight) / 2;
    let rot = options.angleDeg;

    if (options.position === "header") {
      y = height - textHeight - 40;
      rot = 0;
    } else if (options.position === "footer") {
      y = 40;
      rot = 0;
    } else if (options.position === "diagonal") {
      rot = 45;
      x = width / 2 - textWidth / 3;
      y = height / 2 - textHeight / 3;
    }

    page.drawText(options.text, {
      x,
      y,
      size: options.fontSize,
      font,
      color: rgb(r, g, b),
      opacity: Math.max(0.05, Math.min(1, options.opacity)),
      rotate: degrees(rot),
    });
  }

  return await doc.save();
}

/**
 * Organizes pages: reorder, delete, and rotate pages in an existing PDF.
 */
export async function organizePdfPages(
  file: File,
  pageOps: { pageIndex: number; rotation: number; isDeleted: boolean }[]
): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  const sourceDoc = await PDFDocument.load(buffer);
  const newDoc = await PDFDocument.create();

  const activeOps = pageOps.filter((p) => !p.isDeleted);
  if (!activeOps.length) {
    throw new Error("Cannot create a PDF with 0 pages. Please keep at least one page.");
  }

  const indicesToCopy = activeOps.map((p) => p.pageIndex);
  const copiedPages = await newDoc.copyPages(sourceDoc, indicesToCopy);

  for (let i = 0; i < copiedPages.length; i++) {
    const page = copiedPages[i];
    const op = activeOps[i];
    if (op.rotation !== 0) {
      const current = page.getRotation().angle;
      page.setRotation({ type: "degrees", angle: (current + op.rotation) % 360 } as any);
    }
    newDoc.addPage(page);
  }

  return await newDoc.save();
}
