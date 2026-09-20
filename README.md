# Folio — Private Browser PDF Toolkit

> **100% Client-Side Image-to-PDF Application**  
> Fast, private document binding running entirely inside your browser. No Python backend, no database, no cloud storage, and zero server uploads.

---

## Key Features

- **Zero-Upload Privacy Guarantee**: All image processing and PDF compilation happens on the visitor's device using standard Web APIs and `pdf-lib`. No files or metadata leave the browser.
- **Complete Image-to-PDF Workflow**:
  - Multi-image selection, desktop drag-and-drop, and mobile file picker.
  - Adding more images without losing the current selection.
  - Live preview canvas showing exact page geometry, margins, and fitting before exporting.
  - Touch-friendly arrangement: Move Up (▲) / Move Down (▼) buttons, direct position entry, desktop drag-and-drop.
  - Natural numeric sorting (1, 2, 10 vs 10, 2, 1), alphabetical (A–Z, Z–A), and date modified (oldest/newest).
  - Per-image 90° clockwise rotation.
- **Customizable PDF Settings**:
  - Page sizes: **A4**, **US Letter**, and **Original** (image-sized pages).
  - Orientations: **Auto** (matches image shape), **Portrait**, and **Landscape**.
  - Fitting: **Contain** (letterbox), **Cover** (crop overflow), and **Original** (1:1 native resolution).
  - Margin presets: None (0 mm), Small (5 mm), Medium (10 mm), Large (20 mm), or Custom top/right/bottom/left in millimeters with bounds validation.
  - Quality profiles: **Screen/Mobile** (150 DPI · compact), **Print** (300 DPI · high quality), and **Original** (source pixels).
  - Editable output filename.
- **Post-Conversion Reactivity**:
  - Downloading does **not** lock settings or clear selected files.
  - Changing settings flags previous outputs as "Settings Changed" and surfaces a 1-click "Update PDF" button.
  - Real `application/pdf` Blob download verified with standard PDF headers and trailers.
- **Mobile-First Responsive Design**:
  - Touch targets $\ge 44 \times 44\text{ px}$.
  - Zero horizontal overflow across 320px, 360px, 390px, 430px, 768px, 1024px, and 1440px viewports.
  - Bottom conversion bar respects phone safe areas (`env(safe-area-inset-bottom)`).

---

## Supported Formats & Device Safety Limits

### Supported Formats
- **JPEG** (`.jpg`, `.jpeg`, `image/jpeg`)
- **PNG** (`.png`, `image/png`) — with automatic alpha channel flattening onto white for clean PDF output
- **WebP** (`.webp`, `image/webp`)

*Unsupported formats (e.g. BMP, TIFF, GIF, HEIC) are rejected gracefully with helpful guidance.*

### Device Limits
- **Maximum files per batch**: 150 images
- **Maximum total input bytes**: 300 MB
- **Maximum resolution per image**: 40 Megapixels ($40{,}000{,}000\text{ pixels}$)

---

## Beginner-Friendly Windows Setup Guide

### 1. Extract the ZIP
Extract `Folio_Browser_PDF_Toolkit.zip` to a folder on your computer (e.g., `C:\Projects\Folio`).

### 2. Install Node.js
Ensure Node.js is installed (Node.js v20.x or newer is recommended).  
Download Node.js from [nodejs.org](https://nodejs.org/) if not already installed.

### 3. Open Command Prompt or PowerShell
1. Open the project folder in Windows Explorer.
2. Click on the address bar, type `cmd` or `powershell`, and press **Enter**.

### 4. Install Dependencies and Run Locally
```bash
# 1. Install dependencies
npm install

# 2. Run the local development server
npm run dev
```
Open your browser to `http://localhost:5173`. You can now select images, adjust settings, preview the layout, and generate PDFs!

### 5. Other Useful Commands
```bash
# Run automated tests
npm test

# Run TypeScript type check
npm run type-check

# Build for production
npm run build

# Preview production build locally
npm run preview
```

---

## Vercel Static Deployment Guide

Folio is designed to deploy to Vercel as a pure static frontend with **zero configuration, zero API keys, and zero serverless functions**.

### Exact Deployment Settings
- **Framework Preset**: `Vite`
- **Root Directory**: `./` (project root)
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**: *None required*

### Step-by-Step Vercel Deployment

1. **Push to GitHub**:
   Initialize a git repository and push the project to your GitHub account:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Browser-only Folio PDF Toolkit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

2. **Import into Vercel**:
   - Log into your [Vercel Dashboard](https://vercel.com).
   - Click **Add New…** → **Project**.
   - Select your GitHub repository.

3. **Confirm Settings & Deploy**:
   - Vercel automatically detects the **Vite** framework preset.
   - Confirm Build Command is `npm run build` and Output Directory is `dist`.
   - Click **Deploy**.

4. **Verify Live Deployment**:
   - Once deployed, visit the production URL provided by Vercel.
   - Select multiple photos, adjust settings, and download the resulting PDF. All conversion runs client-side in your browser!

---

## Production Security & Headers

The included `vercel.json` applies strict security headers:
- `Content-Security-Policy`: Restricts scripts and connections to origin only.
- `X-Frame-Options: DENY`: Prevents clickjacking.
- `X-Content-Type-Options: nosniff`: Prevents MIME-sniffing.
- `Referrer-Policy: strict-origin-when-cross-origin`: Protects referrer headers.
- `Permissions-Policy`: Disables camera, microphone, and geolocation.
