import { ImageItem } from "../types";

export interface SampleImageDef {
  name: string;
  width: number;
  height: number;
  bgGrad: [string, string];
  accent: string;
  category: "coastal" | "street" | "mountain" | "nature" | "architecture";
  detail: string;
}

export const SAMPLE_DEFINITIONS: SampleImageDef[] = [
  {
    name: "coast.jpg",
    width: 1200,
    height: 900,
    bgGrad: ["#4A7C92", "#97B8C4"],
    accent: "#E2B081",
    category: "coastal",
    detail: "Pacific Coastline",
  },
  {
    name: "street.jpg",
    width: 900,
    height: 1200,
    bgGrad: ["#A89278", "#E6DCBE"],
    accent: "#685040",
    category: "street",
    detail: "Old Town Passage",
  },
  {
    name: "mountains.jpg",
    width: 1400,
    height: 950,
    bgGrad: ["#2B4C5F", "#8CA6B4"],
    accent: "#E6F0F7",
    category: "mountain",
    detail: "Alpine Horizon",
  },
  {
    name: "leaves.jpg",
    width: 1000,
    height: 1000,
    bgGrad: ["#264429", "#56814E"],
    accent: "#A7C98C",
    category: "nature",
    detail: "Foliage Pattern",
  },
  {
    name: "architecture.jpg",
    width: 1050,
    height: 1050,
    bgGrad: ["#795548", "#CBB59B"],
    accent: "#D66A46",
    category: "architecture",
    detail: "Cathedral Dome",
  },
  {
    name: "cliffs.jpg",
    width: 1100,
    height: 850,
    bgGrad: ["#3D5A6C", "#8FA9BA"],
    accent: "#E6BA8B",
    category: "coastal",
    detail: "Seaside Cliffs",
  },
  {
    name: "alley.jpg",
    width: 900,
    height: 1200,
    bgGrad: ["#8D7B68", "#C8B6A6"],
    accent: "#F1DEC9",
    category: "street",
    detail: "Cobblestone Lane",
  },
  {
    name: "lake.jpg",
    width: 1200,
    height: 800,
    bgGrad: ["#1B3A4B", "#4D7C8A"],
    accent: "#C5D8A4",
    category: "mountain",
    detail: "Mountain Lake",
  },
  {
    name: "door.jpg",
    width: 950,
    height: 1250,
    bgGrad: ["#4E3629", "#8C6A50"],
    accent: "#8FA382",
    category: "architecture",
    detail: "Rustic Portal",
  },
  {
    name: "village.jpg",
    width: 1300,
    height: 850,
    bgGrad: ["#3A506B", "#8FA2B8"],
    accent: "#E09F67",
    category: "street",
    detail: "Terraced Hills",
  },
  {
    name: "stones.jpg",
    width: 1100,
    height: 800,
    bgGrad: ["#495057", "#ADB5BD"],
    accent: "#6C757D",
    category: "nature",
    detail: "River Pebbles",
  },
  {
    name: "church.jpg",
    width: 900,
    height: 1200,
    bgGrad: ["#854D27", "#DD8E58"],
    accent: "#5C6B73",
    category: "architecture",
    detail: "Bell Tower",
  },
  {
    name: "coast2.jpg",
    width: 1200,
    height: 800,
    bgGrad: ["#1E555C", "#489FB5"],
    accent: "#F4D06F",
    category: "coastal",
    detail: "Mediterranean Inlet",
  },
  {
    name: "flowers.jpg",
    width: 1000,
    height: 1000,
    bgGrad: ["#704A5E", "#BA7999"],
    accent: "#E2A9BE",
    category: "nature",
    detail: "Spring Blossoms",
  },
  {
    name: "arch.jpg",
    width: 950,
    height: 1250,
    bgGrad: ["#6B5B4E", "#A4907C"],
    accent: "#C8B6A6",
    category: "architecture",
    detail: "Stone Archway",
  },
  {
    name: "palm.jpg",
    width: 1000,
    height: 1000,
    bgGrad: ["#2B4C38", "#4A7C59"],
    accent: "#C8D5B9",
    category: "nature",
    detail: "Palm Fronds",
  },
  {
    name: "rooftops.jpg",
    width: 1200,
    height: 800,
    bgGrad: ["#9B4832", "#C97053"],
    accent: "#688B97",
    category: "street",
    detail: "Terra Cotta Views",
  },
  {
    name: "path.jpg",
    width: 900,
    height: 1200,
    bgGrad: ["#283D3B", "#496965"],
    accent: "#A2C5AC",
    category: "nature",
    detail: "Cypress Avenue",
  },
  {
    name: "harbor.jpg",
    width: 1250,
    height: 850,
    bgGrad: ["#164E63", "#0891B2"],
    accent: "#F97316",
    category: "coastal",
    detail: "Fishing Port",
  },
  {
    name: "succulent.jpg",
    width: 1000,
    height: 1000,
    bgGrad: ["#234E43", "#457B6E"],
    accent: "#8EAF9D",
    category: "nature",
    detail: "Agave Geometry",
  },
];

/**
 * Creates a synthetic File object for a sample photo
 */
export async function createSampleImageFile(def: SampleImageDef): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = def.width;
  canvas.height = def.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

  // Draw background gradient
  const grad = ctx.createLinearGradient(0, 0, def.width, def.height);
  grad.addColorStop(0, def.bgGrad[0]);
  grad.addColorStop(1, def.bgGrad[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, def.width, def.height);

  // Add decorative soft horizon / landscape elements
  ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
  ctx.beginPath();
  ctx.arc(def.width * 0.5, def.height * 0.9, def.width * 0.6, 0, Math.PI, true);
  ctx.fill();

  // Draw soft accent shape
  ctx.fillStyle = def.accent;
  ctx.beginPath();
  ctx.arc(def.width * 0.75, def.height * 0.35, def.width * 0.12, 0, Math.PI * 2);
  ctx.fill();

  // Overlay subtle vignette
  const vignette = ctx.createRadialGradient(
    def.width / 2,
    def.height / 2,
    def.width * 0.2,
    def.width / 2,
    def.height / 2,
    def.width * 0.7
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, def.width, def.height);

  // Detail text
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.font = `600 ${Math.round(def.height * 0.045)}px sans-serif`;
  ctx.fillText(def.detail, def.width * 0.08, def.height * 0.9);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to create blob for sample image"));
          return;
        }
        const file = new File([blob], def.name, {
          type: "image/jpeg",
          lastModified: Date.now() - Math.floor(Math.random() * 86400000 * 10),
        });
        resolve(file);
      },
      "image/jpeg",
      0.88
    );
  });
}

/**
 * Generates a collection of Sample Images ready for Images-to-PDF workspace.
 */
export async function loadSampleSet(count = 20): Promise<ImageItem[]> {
  const selectedDefs = SAMPLE_DEFINITIONS.slice(0, count);
  const items: ImageItem[] = [];

  for (let i = 0; i < selectedDefs.length; i++) {
    const def = selectedDefs[i];
    const file = await createSampleImageFile(def);
    const objectUrl = URL.createObjectURL(file);
    items.push({
      id: `sample_${i + 1}_${Date.now()}`,
      file,
      name: def.name,
      size: file.size,
      modified: file.lastModified,
      objectUrl,
      width: def.width,
      height: def.height,
      rotation: 0,
    });
  }

  return items;
}
