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

export type ToolId =
  | "images-to-pdf"
  | "merge-pdf"
  | "split-pdf"
  | "rotate-pdf"
  | "pdf-to-images"
  | "organize-pdf"
  | "page-numbers"
  | "watermark";

export type ToolCategory = "all" | "create" | "organize" | "export";

export interface ToolMetadata {
  id: ToolId;
  title: string;
  description: string;
  category: "create" | "organize" | "export";
  isFeatured?: boolean;
}

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

// Tool Specific Types
export interface PdfFileInfo {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount: number;
}

export interface SplitOptions {
  rangeStr: string;
  exportZip: boolean;
}

export interface RotatePdfOptions {
  angle: 90 | 180 | 270;
  target: "all" | "custom";
  customPages: number[];
}

export interface PdfToImagesOptions {
  format: "jpeg" | "png";
  dpi: 72 | 150 | 300;
  pageSelection: "all" | "custom";
  customPages: number[];
}

export type PageNumberPosition = "bottom-center" | "bottom-right" | "top-center" | "top-right";

export interface PageNumberOptions {
  position: PageNumberPosition;
  format: "number" | "page-x-of-y";
  startNumber: number;
  fontSize: number;
  pageRange: string;
}

export type WatermarkPosition = "diagonal" | "center" | "header" | "footer";

export interface WatermarkOptions {
  text: string;
  fontSize: number;
  color: string;
  opacity: number;
  angleDeg: number;
  position: WatermarkPosition;
  pageRange: string;
}

export interface OrganizePageItem {
  id: string;
  pageIndex: number; // 0-based
  pageNumber: number; // 1-based display
  rotation: number;
  isDeleted: boolean;
  thumbnailUrl?: string;
}
