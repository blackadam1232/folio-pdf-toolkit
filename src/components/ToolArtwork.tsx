import { ToolId } from "../types";
import { CompressIcon, GridIcon, ImageIcon, MergeIcon, NumberIcon, RotateIcon, ScissorsIcon, StampIcon, PdfDocIcon } from "./Icons";

const icons = {
  "images-to-pdf": ImageIcon, "merge-pdf": MergeIcon, "split-pdf": ScissorsIcon,
  "rotate-pdf": RotateIcon, "pdf-to-images": PdfDocIcon, "organize-pdf": GridIcon,
  "page-numbers": NumberIcon, watermark: StampIcon, "compress-pdf": CompressIcon,
};

export function ToolIcon({ tool }: { tool: ToolId }) {
  const Icon = icons[tool];
  return <Icon className="tool-glyph" />;
}

export function PaperArtwork({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? "paper-art compact-art" : "paper-art"} aria-hidden="true">
    <div className="art-orbit" /><div className="art-stack">
      <div className="art-sheet back-sheet" /><div className="art-sheet middle-sheet" />
      <div className="art-sheet front-sheet">
        <div className="art-fold" /><div className="art-lines"><i /><i /><i /></div>
        <div className="art-landscape"><b /><i /></div><strong>PDF</strong>
      </div>
    </div>
    <span className="art-seal">✓</span>
  </div>;
}
