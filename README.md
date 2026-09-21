# Folio — Paper Studio PDF Toolkit

> **100% Client-Side Private PDF Toolkit**  
> Fast, elegant, calm document processing running entirely inside your browser. No Python backend, no database, no accounts, no cloud storage, and zero document uploads.

---

## Privacy Statement

> “Your documents are processed in your browser and are not uploaded by this application.”

All document processing occurs locally using standard browser Web APIs, `pdf-lib`, and `pdfjs-dist`. While the web browser requests static website files (HTML, CSS, JavaScript, and fonts) from the host, your documents and photos never leave your device.

---

## Working Tools

Folio includes a centralized tool registry and full client-side engines for:

1. **Images to PDF (Featured Workspace)**:
   - Inputs: JPEG, PNG, WebP.
   - Dual viewing modes: **Overview Mode** (dense responsive page grid with multi-selection actions) and **Single Page Mode** (large accurate paper preview with zoom and per-page inspection).
   - Natural numeric sorting (1, 2, 10), A → Z, Z → A, date modified ascending/descending.
   - Page sizes: A4 ($210 \times 297\text{ mm}$), US Letter, and Original image dimensions.
   - Page orientation: Portrait, Landscape, and Auto.
   - Image fitting: Contain (letterbox) and Cover (crop overflow).
   - Margins: None ($0\text{ mm}$), Small ($12\text{ mm}$), and Custom ($0-60\text{ mm}$).
   - Quality profiles: Screen / mobile ($150\text{ DPI}$), Print ($300\text{ DPI}$), and Original uncompressed.
   - Multi-page batch rotation, deletion, and ordering.
   - 1-click 20-photo sample travel set loaded for instant evaluation.
2. **Merge PDFs**:
   - Combine multiple PDF documents in chosen order.
   - Reorder with up/down arrows or drag-and-drop.
   - Displays page counts and file sizes.
3. **Split PDF**:
   - Extract individual pages or ranges (e.g. `1-3, 5, 8-10`).
   - Range validation prevents reversed or out-of-bounds page requests.
   - Export as a single extracted PDF or ZIP archive containing individual PDFs.
4. **Rotate Pages**:
   - Rotate pages by 90°, 180°, or 270° clockwise.
   - Apply to all pages or target specific page lists.
   - Live visual angle preview before saving.
5. **PDF to Images**:
   - Render PDF pages to sharp JPG or PNG images using `pdfjs-dist`.
   - Resolution profiles: 150 DPI (standard) or 300 DPI (high-resolution print).
   - Download individual page images or a complete ZIP bundle.
6. **Organize PDF**:
   - Visual grid of pages with original and current page numbers.
   - Reorder pages left and right.
   - Rotate individual pages.
   - Delete and restore individual pages.
7. **Page Numbers**:
   - Add clean numbering across pages.
   - Format: `Page X of Y` or number only (`X`).
   - Positioning: Bottom Center, Bottom Right, Top Center, Top Right.
   - Custom starting numbers and page range selection.
8. **Text Watermark**:
   - Custom watermark text with quick presets (`CONFIDENTIAL`, `DRAFT`, `SAMPLE`, `COPY`).
   - Placement: Diagonal center ($45^\circ$), Center, Header, or Footer.
   - Adjustable opacity ($5\% - 80\%$) and font sizing.

---

## Post-Export Editing

Creating a PDF does **not** destroy or lock your workspace:
- Source images and files are retained in memory.
- Page order, rotations, margins, and settings remain editable.
- Modifying any setting marks previous output as outdated and surfaces a `Create updated PDF` action.
- Clearing the workspace or closing the browser tab completely cleans up all object URLs and allocated memory buffers.

---

## Practical Device Limits

Because document processing occurs in client memory:
- **Max batch size**: 150 files per export
- **Max total memory**: 300 MB total file data
- **Max image resolution**: 40 Megapixels ($40{,}000{,}000\text{ pixels}$) per image
- **Encrypted PDFs**: Password-protected PDFs are detected and rejected honestly; Folio does not bypass PDF encryption.

---

## Windows Local Setup Guide

### 1. Install Node.js
Download and install Node.js (v20.x or v22.x recommended) from [nodejs.org](https://nodejs.org/).

### 2. Extract & Open Project
Extract `Folio_Paper_Studio_Browser_Toolkit.zip` to a folder on your computer.

### 3. Open PowerShell or Command Prompt
In Windows Explorer, hold `Shift` and right-click in the folder, then select **Open PowerShell window here** (or click the address bar, type `powershell`, and press Enter).

### 4. Install Dependencies & Launch
```powershell
# Install exact dependencies
npm ci

# Run development server
npm run dev
```
Open `http://localhost:5173` in your browser.

### 5. Build and Test
```powershell
# Run all automated unit tests
npm test

# Run TypeScript type check
npm run type-check

# Build optimized production bundle
npm run build

# Preview production build locally
npm run preview
```

---

## Deploy to GitHub and Vercel

### GitHub Push Commands
```powershell
git init
git add -A
git commit -m "feat: Folio Paper Studio client-side PDF toolkit"
git branch -M main
git remote add origin https://github.com/<your-username>/folio-pdf-toolkit.git
git push -u origin main
```

### Vercel Deployment Settings
- **Framework Preset**: `Vite`
- **Root Directory**: `./`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**: None required
