export type PageSizeOption = "A4" | "Letter" | "Original";
export type OrientationOption = "Auto" | "Portrait" | "Landscape";
export type FitOption = "Contain" | "Cover" | "Original";
export type ProfileOption = "Screen/Mobile" | "Print" | "Original";
export type MarginPresetOption = "None" | "Small" | "Medium" | "Large" | "Custom";

export type SortMode =
  | "natural-asc"
  | "natural-desc"
  | "name-asc"
  | "name-desc"
  | "date-oldest"
  | "date-newest"
  | "manual";

export interface ImageItem {
  id: string;
  file: File;
  name: string;
  size: number;
  modified: number;
  objectUrl: string;
  width: number;
  height: number;
  rotation: number; // 0, 90, 180, 270
}

export interface PdfOptions {
  pageSize: PageSizeOption;
  orientation: OrientationOption;
  fit: FitOption;
  profile: ProfileOption;
  marginPreset: MarginPresetOption;
  marginMm: number; // 0, 5, 10, 20
  customMargins: [number, number, number, number]; // [top, right, bottom, left] in mm
  filename: string;
  sort: SortMode;
  manualOrder: string[];
}

export interface MarginsPt {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PageGeometry {
  pageWidthPt: number;
  pageHeightPt: number;
  printableWidthPt: number;
  printableHeightPt: number;
  marginsPt: MarginsPt;
  imageRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  cropRect?: {
    sx: number;
    sy: number;
    sWidth: number;
    sHeight: number;
  };
}

export interface GenerationProgress {
  current: number;
  total: number;
  currentFilename: string;
  phase: "preparing" | "processing" | "saving" | "validating" | "complete";
  percent: number;
}

export interface ConversionResult {
  blob: Blob;
  url: string;
  filename: string;
  pageCount: number;
  sizeBytes: number;
  generationTimeSec: number;
  profile: ProfileOption;
  isOutdated: boolean;
}
