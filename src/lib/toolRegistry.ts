import { ToolMetadata } from "../types";

export const TOOL_REGISTRY: ToolMetadata[] = [
  {
    id: "images-to-pdf",
    title: "Images to PDF",
    description: "Turn your pictures into neatly arranged pages.",
    category: "create",
    isFeatured: true,
  },
  {
    id: "merge-pdf",
    title: "Merge PDFs",
    description: "Combine multiple PDFs into one.",
    category: "organize",
  },
  {
    id: "split-pdf",
    title: "Split PDF",
    description: "Split a PDF into separate files.",
    category: "organize",
  },
  {
    id: "rotate-pdf",
    title: "Rotate pages",
    description: "Rotate pages to the right orientation.",
    category: "organize",
  },
  {
    id: "pdf-to-images",
    title: "PDF to images",
    description: "Extract pages as image files.",
    category: "export",
  },
  {
    id: "organize-pdf",
    title: "Organize PDF",
    description: "Rearrange, rotate or remove pages.",
    category: "organize",
  },
  {
    id: "page-numbers",
    title: "Page numbers",
    description: "Add consistent numbering to your PDF.",
    category: "create",
  },
  {
    id: "watermark",
    title: "Watermark",
    description: "Add a text watermark to selected pages.",
    category: "create",
  },
  {
    id: "compress-pdf",
    title: "Compress PDF",
    description: "Reduce file size while preserving quality.",
    category: "export",
  },
];

export function getToolById(id: string): ToolMetadata | undefined {
  return TOOL_REGISTRY.find((t) => t.id === id);
}

export function getToolsByCategory(category: string): ToolMetadata[] {
  if (!category || category === "all") {
    return TOOL_REGISTRY;
  }
  return TOOL_REGISTRY.filter((t) => t.category === category);
}
