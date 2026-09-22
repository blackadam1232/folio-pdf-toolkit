import React, { useEffect, useState, useRef } from "react";
import { renderPdfPage, RenderedPageResult } from "../lib/pdfRenderer";

interface PdfPageThumbnailProps {
  file: File;
  pageNumber: number;
  rotation?: number;
  scale?: number;
  className?: string;
  alt?: string;
}

export const PdfPageThumbnail: React.FC<PdfPageThumbnailProps> = ({
  file,
  pageNumber,
  rotation = 0,
  scale = 0.65,
  className = "",
  alt,
}) => {
  const [rendered, setRendered] = useState<RenderedPageResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setHasError(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    renderPdfPage(file, pageNumber, scale, controller.signal)
      .then((res) => {
        if (isMounted) {
          setRendered(res);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted && !controller.signal.aborted) {
          console.warn(`Thumbnail render failed for page ${pageNumber}:`, err);
          setHasError(true);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [file, pageNumber, scale, retryCount]);

  if (hasError) {
    return (
      <div className={`pdf-thumb-error ${className}`}>
        <span className="error-icon">⚠</span>
        <span className="error-text">Page {pageNumber}</span>
        <button
          type="button"
          className="btn-retry-thumb"
          onClick={(e) => {
            e.stopPropagation();
            setRetryCount((c) => c + 1);
          }}
          title="Retry rendering this page"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading && !rendered) {
    return (
      <div className={`pdf-thumb-skeleton ${className}`}>
        <div className="skeleton-shimmer" />
        <span className="skeleton-page-badge">{pageNumber}</span>
      </div>
    );
  }

  if (!rendered) {
    return null;
  }

  return (
    <div className={`pdf-thumb-sheet-wrap ${className}`}>
      <img
        src={rendered.dataUrl}
        alt={alt || `Page ${pageNumber}`}
        className="pdf-thumb-img"
        style={{
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
          aspectRatio: `${rendered.width} / ${rendered.height}`,
        }}
        loading="lazy"
      />
    </div>
  );
};
