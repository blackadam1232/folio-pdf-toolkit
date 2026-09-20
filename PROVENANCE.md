# Project Provenance & Architecture Record

This document provides an honest, transparent record of the codebase's origin, retained design patterns, new code written, and AI pair-programming assistance.

---

## 1. Project Background

The original **Folio PDF Toolkit** was a multi-tier client-server application comprised of:
- A Python FastAPI backend with Celery/background workers, SQLite database, S3 cloud storage, and pypdf/reportlab/pdfium bindings.
- A React frontend designed around remote job polling, JWT/token authentication, admin user management, and local/web server modes.

To achieve frictionless static deployment on Vercel with zero backend hosting costs and 100% client-side privacy, the project was restructured into a standalone, browser-only application.

---

## 2. Retained Design Patterns & Assets

1. **Brand & Visual Identity**:
   - The brand aesthetic ("Folio.", forest green `#23523c`, soft paper canvas `#f6f8f5`, and subtle borders `#dbe3d8`) was retained from the original `style.css` and adapted into a modern, mobile-first responsive layout.
2. **Layout Geometry Principles**:
   - Standard unit conversions ($1\text{ mm} = \frac{72}{25.4}\text{ pt}$) and page dimension standards (ISO A4 $595.28 \times 841.89\text{ pt}$ and US Letter $612 \times 792\text{ pt}$) previously implemented in Python `engine.py` were translated into pure TypeScript functions in `src/lib/layout.ts`.

---

## 3. Removed Server-Dependent Components

All server-dependent code was decoupled and removed from the active application:
- Python API routes (`/api/auth`, `/api/jobs`, `/api/storage`, `/api/browse`).
- Server job queues, Celery workers, and process runners.
- SQLite database, user authentication, and admin screens.
- Server configuration files (`Dockerfile`, `compose.yaml`, `Caddyfile`, `requirements.txt`).
- All original server files were archived in `Folio_Original_Backup.zip` prior to modification.

---

## 4. Newly Written Application Code

The following modules were independently authored for the browser-only release:
- **`src/lib/pdfEngine.ts`**: Client-side PDF generation engine using `pdf-lib` and HTML5 Canvas. Implements sequential image processing, EXIF transposition, quality profile scaling (Screen/Mobile 150 DPI vs Print 300 DPI vs Original), alpha channel flattening, cancellation via `AbortSignal`, and PDF byte validation.
- **`src/lib/layout.ts`**: Synchronized geometry calculations shared identically between interactive preview and PDF compilation.
- **`src/lib/sort.ts`**: Natural numeric collation (`Intl.Collator`), alphabetical sorting, date modified sorting, and manual arrangement.
- **`src/types.ts`**: Complete TypeScript definitions for images, options, geometry, progress, and results.
- **`src/components/ImageList.tsx`**: Mobile-first image collection with touch targets $\ge 44 \times 44\text{ px}$, move up/down controls, 90° clockwise rotation, and confirmation dialogs.
- **`src/components/SettingsPanel.tsx`**: Output configuration panel with custom margin validation, fitting options, and zero-upload reassurance.
- **`src/components/PreviewCanvas.tsx`**: Real-time interactive layout preview reflecting margins, rotation, and fitting.
- **`src/components/ConversionBar.tsx`**: Sticky conversion dock with live progress, download triggers, and post-conversion reactivity for updated settings.
- **`src/App.tsx`**: Central application state management.
- **`vercel.json`**: Static Vite configuration with production Content Security Policy and security headers.
- **Automated Test Suite**:
  - `src/tests/layout.test.ts`
  - `src/tests/sort.test.ts`
  - `src/tests/validation.test.ts`
  - `src/tests/pdfGeneration.test.ts`

---

## 5. AI Assistance Declaration

This project was developed with the assistance of **Antigravity** (Google DeepMind advanced agentic coding assistant). AI assistance was used for architectural analysis, modular code generation, Vitest test suite creation, performance measurement, and documentation drafting. No code was copied from proprietary or unlicensed repositories.
