# Folio — Performance & Memory Profile

## Architectural Strategy

Folio is designed to process documents directly in browser memory without crashing client tabs or accumulating memory leaks.

### 1. Sequential Image Processing
Instead of decoding 50–150 images simultaneously into full-resolution memory canvases (which would consume several gigabytes and crash mobile browsers), Folio processes images **sequentially**:
1. Allocate an offscreen Canvas for image $i$.
2. Apply rotation, cropping (for Cover fit), and scaling (based on selected Quality Profile).
3. Encode to JPEG byte buffer and embed into the PDF structure.
4. Immediately dereference the Canvas and intermediate buffers before proceeding to image $i+1$.

### 2. Bounded Canvas Limits
- **Max Image Resolution**: 40 Megapixels ($40{,}000{,}000\text{ pixels}$). High-resolution phone photos (e.g. 12 MP – 48 MP) are validated and bounded to ensure canvas allocation never exceeds browser memory limits.
- **Max Batch Count**: 150 images per export job.
- **Max Batch Payload**: 300 MB total file data.

### 3. Quality Profiles & Output Sizing

| Quality Profile | Max Dimension | Quality Parameter | Intended Use Case |
| :--- | :---: | :---: | :--- |
| **Screen / Mobile** | 1,654 px (~150 DPI) | 0.82 | Email attachments, web sharing, compact documents. |
| **Print** | 3,508 px (~300 DPI) | 0.92 | High-resolution physical printing and document archival. |
| **Original** | Native resolution | 0.98 | Uncompressed reproduction retaining exact camera pixels. |

### 4. Memory Lifecycle Cleanup
- Object URLs created with `URL.createObjectURL()` are tracked and explicitly revoked with `URL.revokeObjectURL()` upon file removal, clear workspace, or component unmount.
- PDF generation supports `AbortSignal` for instant cancellation without orphaned worker threads.

### 5. Production Bundle Chunking

| Chunk Name | Size (Raw) | Size (Gzip) | Content |
| :--- | :---: | :---: | :--- |
| `vendor-react` | 12.35 kB | 4.34 kB | React 19 & React DOM runtime |
| `vendor-zip` | 97.27 kB | 30.16 kB | JSZip client archive generator |
| `vendor-pdf` | 436.78 kB | 180.75 kB | pdf-lib document manipulation engine |
| `vendor-pdfjs` | 481.91 kB | 143.90 kB | pdfjs-dist vector renderer |
| `index` (App) | 309.00 kB | 89.25 kB | Folio application UI and tool components |
| `style` (CSS) | 33.62 kB | 6.66 kB | Paper Studio design system stylesheet |
