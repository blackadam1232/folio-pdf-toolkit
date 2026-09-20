let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export async function request(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<Response> {
  const form = body instanceof FormData;
  const response = await fetch("/api" + path, {
    method,
    headers: {
      "x-csrf-token": csrf,
      ...(!form && body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = await response.json();
      message =
        typeof data.detail === "string"
          ? data.detail
          : JSON.stringify(data.detail);
    } catch {
      /* HTTP status is sufficient when no JSON is returned. */
    }
    throw new Error(message);
  }
  return response;
}
export async function api(path: string, method = "GET", body?: unknown) {
  return (await request(path, method, body)).json();
}
export const bytes = (n = 0) =>
  n >= 1073741824
    ? `${(n / 1073741824).toFixed(2)} GB`
    : `${(n / 1048576).toFixed(1)} MB`;
export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  active: number;
  quota_mb: number;
  retention: number;
};
export type Options = {
  page_size: string;
  orientation: string;
  fit: string;
  quality: string;
  profile?: string;
  margin: number;
  margins: number[] | null;
  sort: string;
  order: string[];
  rotations: Record<string, number>;
  filename: string;
  ranges: string;
  groups: string;
  pages: { page: number; rotation: number }[];
  dpi: number;
  image_format: string;
  compression: string;
  text: string;
  font_size: number;
  opacity: number;
  angle: number;
  color: string;
  position: string;
  start_number: number;
  numbering: string;
};
export type Job = {
  id: string;
  tool: string;
  state: string;
  options: Options;
  parent: string | null;
  created: number;
  detail: {
    processed?: number;
    total?: number;
    current?: string;
    phase?: string;
    message?: string;
    outputs?: string[];
    bytes?: number;
    elapsed?: number;
    skipped?: number;
    saved_bytes?: number;
    note?: string;
    errors?: unknown[];
  };
};
export type Asset = {
  id: string;
  name: string;
  size: number;
  modified: number;
};
export const tools = [
  ["images", "Image to PDF", "Your image collection, beautifully bound.", "▧"],
  ["merge", "Merge PDFs", "Bring documents together in order.", "⊕"],
  ["extract", "Extract pages", "Keep exactly the pages you need.", "↗"],
  ["split", "Split PDF", "Divide a document into useful parts.", "⋈"],
  [
    "organize",
    "Organize pages",
    "Reorder, rotate, remove, and duplicate.",
    "▦",
  ],
  ["render", "PDF to images", "Export crisp JPG or PNG pages.", "▣"],
  ["compress", "Compress PDF", "Reduce size with clear quality choices.", "↙"],
  ["numbers", "Page numbers", "Give every page its place.", "#"],
  ["watermark", "Watermark", "Add a subtle or unmistakable label.", "W"],
  ["protect", "Protect PDF", "Encrypt a document with a password.", "⌑"],
  ["unlock", "Unlock PDF", "Remove encryption using its password.", "⌔"],
];
