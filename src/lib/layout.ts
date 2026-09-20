import { MarginsPt, PageGeometry, PdfOptions } from "../types";

export const MM_TO_PT = 72 / 25.4; // 1 mm ~ 2.834645669 points

// Standard ISO A4 and US Letter page sizes in points
export const PAGE_SIZES_PT = {
  A4: { width: 595.276, height: 841.89 },
  Letter: { width: 612.0, height: 792.0 },
} as const;

/**
 * Converts millimeters to PDF points.
 */
export function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}

/**
 * Converts PDF points to millimeters.
 */
export function ptToMm(pt: number): number {
  return pt / MM_TO_PT;
}

/**
 * Resolves active margin values into points: [top, right, bottom, left].
 */
export function resolveMarginsPt(options: PdfOptions): MarginsPt {
  if (options.marginPreset === "Custom") {
    const [topMm, rightMm, bottomMm, leftMm] = options.customMargins;
    return {
      top: Math.max(0, mmToPt(topMm)),
      right: Math.max(0, mmToPt(rightMm)),
      bottom: Math.max(0, mmToPt(bottomMm)),
      left: Math.max(0, mmToPt(leftMm)),
    };
  }

  const marginPt = Math.max(0, mmToPt(options.marginMm));
  return {
    top: marginPt,
    right: marginPt,
    bottom: marginPt,
    left: marginPt,
  };
}

export interface GeometryInput {
  imageWidth: number;
  imageHeight: number;
  rotation?: number; // 0, 90, 180, 270
  dpi?: number;
  options: PdfOptions;
}

/**
 * Shared layout calculation used identically by both the UI preview and the PDF exporter.
 * Throws a descriptive error if the margin configuration is impossible (leaves <= 0 printable area).
 */
export function calculateGeometry(input: GeometryInput): PageGeometry {
  const { imageWidth, imageHeight, rotation = 0, dpi = 96, options } = input;

  if (imageWidth <= 0 || imageHeight <= 0) {
    throw new Error("Invalid image dimensions: width and height must be positive numbers.");
  }

  // Handle rotation: 90 and 270 swap effective width and height
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const isQuarterTurn = normalizedRotation === 90 || normalizedRotation === 270;
  const effectiveWidth = isQuarterTurn ? imageHeight : imageWidth;
  const effectiveHeight = isQuarterTurn ? imageWidth : imageHeight;

  const marginsPt = resolveMarginsPt(options);
  const horizontalMargins = marginsPt.left + marginsPt.right;
  const verticalMargins = marginsPt.top + marginsPt.bottom;

  let pw: number;
  let ph: number;

  if (options.pageSize === "Original") {
    // Original Sizing Rule:
    // Page dimensions match the unscaled point dimensions of the image (at detected/default DPI),
    // plus configured margins so the image preserves 100% native resolution.
    const nativePtWidth = (effectiveWidth * 72) / dpi;
    const nativePtHeight = (effectiveHeight * 72) / dpi;
    pw = nativePtWidth + horizontalMargins;
    ph = nativePtHeight + verticalMargins;
  } else {
    const standard = PAGE_SIZES_PT[options.pageSize];
    pw = standard.width;
    ph = standard.height;

    // Apply orientation:
    // Auto: Landscape if image effective width > effective height, else Portrait
    let isLandscape = false;
    if (options.orientation === "Landscape") {
      isLandscape = true;
    } else if (options.orientation === "Auto") {
      isLandscape = effectiveWidth > effectiveHeight;
    }

    if (isLandscape) {
      pw = Math.max(standard.width, standard.height);
      ph = Math.min(standard.width, standard.height);
    } else {
      pw = Math.min(standard.width, standard.height);
      ph = Math.max(standard.width, standard.height);
    }
  }

  const printableWidthPt = pw - horizontalMargins;
  const printableHeightPt = ph - verticalMargins;

  // Margin validation
  if (printableWidthPt <= 0 || printableHeightPt <= 0) {
    throw new Error(
      `Margins (${ptToMm(horizontalMargins).toFixed(1)}mm H × ${ptToMm(verticalMargins).toFixed(1)}mm V) exceed page size (${ptToMm(pw).toFixed(1)}mm × ${ptToMm(ph).toFixed(1)}mm). Reduce margin values.`
    );
  }

  let rectWidth = printableWidthPt;
  let rectHeight = printableHeightPt;
  let cropRect: PageGeometry["cropRect"] | undefined = undefined;

  if (options.fit === "Original") {
    // 1:1 points centered
    rectWidth = (effectiveWidth * 72) / dpi;
    rectHeight = (effectiveHeight * 72) / dpi;
  } else if (options.fit === "Contain") {
    const scale = Math.min(
      printableWidthPt / effectiveWidth,
      printableHeightPt / effectiveHeight
    );
    rectWidth = effectiveWidth * scale;
    rectHeight = effectiveHeight * scale;
  } else if (options.fit === "Cover") {
    // In Cover mode, the image fills the entire printable area.
    // The imageRect occupies the entire printable area.
    rectWidth = printableWidthPt;
    rectHeight = printableHeightPt;

    // Calculate the source crop region (in effective pixel coordinates)
    const coverScale = Math.max(
      printableWidthPt / effectiveWidth,
      printableHeightPt / effectiveHeight
    );
    const visibleSourceWidth = printableWidthPt / coverScale;
    const visibleSourceHeight = printableHeightPt / coverScale;
    const sx = Math.max(0, (effectiveWidth - visibleSourceWidth) / 2);
    const sy = Math.max(0, (effectiveHeight - visibleSourceHeight) / 2);

    cropRect = {
      sx,
      sy,
      sWidth: visibleSourceWidth,
      sHeight: visibleSourceHeight,
    };
  }

  // Center the image rect inside the printable area
  // In PDF coordinates, y=0 is at the bottom, so bottom margin is the base offset
  const x = marginsPt.left + (printableWidthPt - rectWidth) / 2;
  const y = marginsPt.bottom + (printableHeightPt - rectHeight) / 2;

  return {
    pageWidthPt: pw,
    pageHeightPt: ph,
    printableWidthPt,
    printableHeightPt,
    marginsPt,
    imageRect: {
      x,
      y,
      width: rectWidth,
      height: rectHeight,
    },
    cropRect,
  };
}
