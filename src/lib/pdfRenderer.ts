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

// Bounded Concurrency Limiter
export class ConcurrencyLimiter {
  private running = 0;
  private queue: (() => void)[] = [];

  constructor(private limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
}

const renderLimiter = new ConcurrencyLimiter(3);

// Document LRU Cache
interface CachedDocument {
  doc: any;
  lastUsed: number;
}
const documentCache = new Map<string, CachedDocument>();
const MAX_CACHED_DOCS = 5;

// In-memory cache for rendered pages
const pageRenderCache = new Map<string, RenderedPageResult>();
const MAX_CACHED_PAGES = 120;

function getDocKey(source: File | Uint8Array): string {
  if (source instanceof File) {
    return `doc_file_${source.name}_${source.size}_${source.lastModified}`;
  }
  return `doc_bytes_${source.length}_${source[0] || 0}_${source[source.length - 1] || 0}`;
}

function getCacheKey(
  source: File | Uint8Array,
  pageNumber: number,
  scale: number
): string {
  return `${getDocKey(source)}_p${pageNumber}_s${scale.toFixed(2)}`;
}

async function getOrLoadPdfDocument(source: File | Uint8Array): Promise<any> {
  const docKey = getDocKey(source);
  const existing = documentCache.get(docKey);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.doc;
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

  const doc = await loadingTask.promise;

  // Evict oldest if cache is full
  if (documentCache.size >= MAX_CACHED_DOCS) {
    let oldestKey = "";
    let oldestTime = Infinity;
    for (const [key, item] of documentCache.entries()) {
      if (item.lastUsed < oldestTime) {
        oldestTime = item.lastUsed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      const evicted = documentCache.get(oldestKey);
      documentCache.delete(oldestKey);
      try {
        evicted?.doc?.destroy?.();
      } catch (e) {
        // ignore destroy errors
      }
    }
  }

  documentCache.set(docKey, { doc, lastUsed: Date.now() });
  return doc;
}

/**
 * Renders an exact PDF page to a canvas and returns a high-quality data URL along with dimensions.
 * Uses bounded concurrency and LRU caching for performance.
 */
export async function renderPdfPage(
  source: File | Uint8Array,
  pageNumber: number = 1,
  scale: number = 1.5,
  signal?: AbortSignal
): Promise<RenderedPageResult> {
  const cacheKey = getCacheKey(source, pageNumber, scale);
  const cached = pageRenderCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  return renderLimiter.run(async () => {
    if (signal?.aborted) {
      throw new Error("Render aborted");
    }

    // Check cache again after waiting in queue
    const cachedAfterQueue = pageRenderCache.get(cacheKey);
    if (cachedAfterQueue) {
      return cachedAfterQueue;
    }

    const pdf = await getOrLoadPdfDocument(source);
    if (signal?.aborted) {
      throw new Error("Render aborted");
    }

    const clampedPage = Math.max(1, Math.min(pageNumber, pdf.numPages));
    const page = await pdf.getPage(clampedPage);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("Failed to acquire 2D canvas context for PDF rendering.");
    }

    // Draw crisp white background first
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderTask = (page.render as any)({
      canvasContext: ctx,
      canvas,
      viewport,
    });

    const onAbort = () => {
      try {
        renderTask.cancel();
      } catch (e) {
        // ignore
      }
    };

    if (signal) {
      signal.addEventListener("abort", onAbort);
    }

    try {
      await renderTask.promise;
    } finally {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.90);
    const result: RenderedPageResult = {
      dataUrl,
      width: viewport.width,
      height: viewport.height,
      aspectRatio: viewport.width / viewport.height,
    };

    // Cache management
    if (pageRenderCache.size >= MAX_CACHED_PAGES) {
      const firstKey = pageRenderCache.keys().next().value;
      if (firstKey) pageRenderCache.delete(firstKey);
    }
    pageRenderCache.set(cacheKey, result);

    return result;
  });
}

/**
 * Clears the PDF page rendering cache and closes cached documents.
 */
export function clearPdfRenderCache(): void {
  pageRenderCache.clear();
  for (const item of documentCache.values()) {
    try {
      item.doc?.destroy?.();
    } catch (e) {
      // ignore
    }
  }
  documentCache.clear();
}
