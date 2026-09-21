import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import { CompressionPreset, CompressionResult, CompressionSettings } from "../types";
import { renderPdfPage } from "./pdfRenderer";

/**
 * Maps compression strength (1-100%) to image quality and resolution limits.
 * Bounded monotonic mapping:
 * - Strength 1%: Quality 0.95, Max Dimension 2600px
 * - Strength 20% (High Quality preset): Quality 0.82, Max Dimension 2280px
 * - Strength 50% (Balanced preset): Quality 0.615, Max Dimension 1800px
 * - Strength 85% (Smallest file preset): Quality 0.38, Max Dimension 1240px
 * - Strength 100%: Quality 0.28, Max Dimension 1000px
 */
export function mapStrengthToSettings(strength: number): {
  quality: number;
  maxDimension: number;
} {
  const s = Math.max(1, Math.min(100, strength));
  const factor = (s - 1) / 99; // 0.0 at 1%, 1.0 at 100%

  const quality = Number((0.95 - factor * 0.67).toFixed(3));
  const maxDimension = Math.round(2600 - factor * 1600);

  return { quality, maxDimension };
}

/**
 * Returns preset name for a given strength position if it matches standard positions.
 */
export function getPresetForStrength(strength: number): CompressionPreset {
  if (strength === 20) return "high-quality";
  if (strength === 50) return "balanced";
  if (strength === 85) return "smallest";
  return "custom";
}

/**
 * Converts a data URL to a Uint8Array.
 */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Loads an image from Uint8Array bytes using HTML Image.
 */
function loadImageFromBytes(bytes: Uint8Array, mimeType: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image: " + e));
    };
    img.src = url;
  });
}

/**
 * Re-encodes and downsamples an image via canvas.
 */
async function compressImageBytes(
  rawBytes: Uint8Array,
  quality: number,
  maxDimension: number
): Promise<{ compressedBytes: Uint8Array; width: number; height: number } | null> {
  // Check if bytes resemble JPEG or PNG
  let mimeType = "image/jpeg";
  if (
    rawBytes.length > 4 &&
    rawBytes[0] === 0x89 &&
    rawBytes[1] === 0x50 &&
    rawBytes[2] === 0x4e &&
    rawBytes[3] === 0x47
  ) {
    mimeType = "image/png";
  }

  try {
    const img = await loadImageFromBytes(rawBytes, mimeType);
    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;
    if (origW <= 0 || origH <= 0) return null;

    let targetW = origW;
    let targetH = origH;
    if (origW > maxDimension || origH > maxDimension) {
      if (origW >= origH) {
        targetW = maxDimension;
        targetH = Math.max(1, Math.round((origH * maxDimension) / origW));
      } else {
        targetH = maxDimension;
        targetW = Math.max(1, Math.round((origW * maxDimension) / origH));
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Fill white background for transparent areas
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const compressedBytes = dataUrlToBytes(dataUrl);

    return {
      compressedBytes,
      width: targetW,
      height: targetH,
    };
  } catch {
    return null;
  }
}

/**
 * Compresses an existing PDF file by optimizing its embedded raster images
 * while preserving text, fonts, vector paths, and document structure intact.
 */
export async function compressPdf(
  file: File,
  strength: number,
  onProgress?: (progress: { percent: number; status: string }) => void,
  abortSignal?: AbortSignal
): Promise<CompressionResult> {
  const originalBytes = file.size;
  const { quality, maxDimension } = mapStrengthToSettings(strength);
  const preset = getPresetForStrength(strength);

  onProgress?.({ percent: 5, status: "Loading PDF structure…" });
  const arrayBuffer = await file.arrayBuffer();

  if (abortSignal?.aborted) {
    throw new Error("Compression cancelled by user.");
  }

  const pdfDoc = await PDFDocument.load(arrayBuffer, {
    ignoreEncryption: true,
  });

  const pageCount = pdfDoc.getPageCount();
  onProgress?.({ percent: 15, status: "Inspecting embedded assets…" });

  // Identify all image XObjects
  const imageRefs: any[] = [];
  for (const [ref, obj] of pdfDoc.context.enumerateIndirectObjects()) {
    if (obj && (obj as any).dict && typeof (obj as any).dict.get === "function") {
      const subtype = (obj as any).dict.get(PDFName.of("Subtype"));
      if (subtype === PDFName.of("Image")) {
        imageRefs.push({ ref, obj });
      }
    }
  }

  const totalImages = imageRefs.length;
  let optimizedCount = 0;

  for (let i = 0; i < totalImages; i++) {
    if (abortSignal?.aborted) {
      throw new Error("Compression cancelled by user.");
    }

    const { ref, obj } = imageRefs[i];
    const currentPercent = Math.round(15 + ((i + 1) / totalImages) * 65);
    onProgress?.({
      percent: currentPercent,
      status: `Optimizing image ${i + 1} of ${totalImages}…`,
    });

    try {
      let rawBytes: Uint8Array | null = null;
      const filter = obj.dict.get(PDFName.of("Filter"));

      if (filter === PDFName.of("DCTDecode")) {
        // Raw JPEG stream
        rawBytes = obj.asUint8Array();
      } else if (filter === PDFName.of("FlateDecode")) {
        // Flate-compressed stream
        try {
          rawBytes = decodePDFRawStream(obj).decode();
        } catch {
          rawBytes = obj.asUint8Array();
        }
      } else {
        rawBytes = obj.asUint8Array();
      }

      if (!rawBytes || rawBytes.length < 500) {
        continue;
      }

      const result = await compressImageBytes(rawBytes, quality, maxDimension);
      if (result && result.compressedBytes.length < rawBytes.length) {
        // Safe replacement: update dimensions and filter to DCTDecode
        obj.dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
        obj.dict.set(PDFName.of("Width"), PDFNumber.of(result.width));
        obj.dict.set(PDFName.of("Height"), PDFNumber.of(result.height));
        obj.dict.set(PDFName.of("Length"), PDFNumber.of(result.compressedBytes.length));
        obj.dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
        obj.dict.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));

        const newStream = PDFRawStream.of(obj.dict, result.compressedBytes);
        pdfDoc.context.assign(ref, newStream);
        optimizedCount++;
      }
    } catch (err) {
      console.warn("Could not optimize image stream:", err);
    }
  }

  onProgress?.({ percent: 85, status: "Saving compressed document…" });

  if (abortSignal?.aborted) {
    throw new Error("Compression cancelled by user.");
  }

  // Save with cross-reference and object stream optimization
  const outputPdfBytes = await pdfDoc.save({
    useObjectStreams: true,
  });

  onProgress?.({ percent: 95, status: "Verifying output integrity…" });

  // Self-verification: verify that the resulting bytes can be reopened
  const verifiedDoc = await PDFDocument.load(outputPdfBytes);
  if (verifiedDoc.getPageCount() !== pageCount) {
    throw new Error("Output verification failed: page count mismatch.");
  }

  const outputBytes = outputPdfBytes.length;
  const isReduced = outputBytes < originalBytes;
  const percentSaved = isReduced
    ? Number((((originalBytes - outputBytes) / originalBytes) * 100).toFixed(1))
    : 0;

  const blob = new Blob([outputPdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const filename = `${baseName}_compressed.pdf`;

  onProgress?.({ percent: 100, status: "Complete!" });

  return {
    blob,
    url,
    originalBytes,
    outputBytes,
    percentSaved,
    isReduced,
    filename,
    pageCount,
    preset,
    strength,
  };
}

/**
 * Generates a fast, debounced before-and-after preview for a specific page.
 */
export async function generateCompressionPreview(
  file: File,
  pageNumber: number,
  strength: number
): Promise<{ originalUrl: string; compressedUrl: string }> {
  // 1. Render original high-resolution page
  const original = await renderPdfPage(file, pageNumber, 1.5);
  const { quality, maxDimension } = mapStrengthToSettings(strength);

  // 2. Simulate compression on the rendered page
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Preview image load failed"));
    img.src = original.dataUrl;
  });

  const scaleFactor = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const targetW = Math.max(1, Math.round(img.naturalWidth * scaleFactor));
  const targetH = Math.max(1, Math.round(img.naturalHeight * scaleFactor));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { originalUrl: original.dataUrl, compressedUrl: original.dataUrl };
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const compressedUrl = canvas.toDataURL("image/jpeg", quality);

  return {
    originalUrl: original.dataUrl,
    compressedUrl,
  };
}
