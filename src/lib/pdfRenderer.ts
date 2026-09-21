import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

if (typeof window !== "undefined") {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
  } catch (e) {
    console.warn("Could not set local workerSrc:", e);
  }
}

export interface RenderedPageResult {
  dataUrl: string;
  width: number;
  height: number;
  aspectRatio: number;
}

// In-memory cache for rendered pages
const pageRenderCache = new Map<string, RenderedPageResult>();

/**
 * Generates a cache key based on file/buffer metadata and requested page number.
 */
function getCacheKey(
  source: File | Uint8Array,
  pageNumber: number,
  scale: number
): string {
  if (source instanceof File) {
    return `file_${source.name}_${source.size}_${source.lastModified}_p${pageNumber}_s${scale}`;
  }
  return `bytes_${source.length}_${source[0] || 0}_p${pageNumber}_s${scale}`;
}

/**
 * Renders an exact PDF page to a canvas and returns a high-quality data URL along with dimensions.
 */
export async function renderPdfPage(
  source: File | Uint8Array,
  pageNumber: number = 1,
  scale: number = 1.5
): Promise<RenderedPageResult> {
  const cacheKey = getCacheKey(source, pageNumber, scale);
  const cached = pageRenderCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let data: Uint8Array;
  if (source instanceof File) {
    const arrayBuffer = await source.arrayBuffer();
    data = new Uint8Array(arrayBuffer);
  } else {
    data = source;
  }

  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const clampedPage = Math.max(1, Math.min(pageNumber, pdf.numPages));
  const page = await pdf.getPage(clampedPage);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    throw new Error("Failed to acquire 2D canvas context for PDF rendering.");
  }

  // Draw crisp white background first
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await (page.render as any)({
    canvasContext: ctx,
    canvas,
    viewport,
  }).promise;

  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const result: RenderedPageResult = {
    dataUrl,
    width: viewport.width,
    height: viewport.height,
    aspectRatio: viewport.width / viewport.height,
  };

  // Cache up to 100 entries
  if (pageRenderCache.size > 100) {
    const firstKey = pageRenderCache.keys().next().value;
    if (firstKey) pageRenderCache.delete(firstKey);
  }
  pageRenderCache.set(cacheKey, result);

  return result;
}

/**
 * Clears the PDF page rendering cache (useful when memory needs freeing).
 */
export function clearPdfRenderCache(): void {
  pageRenderCache.clear();
}
