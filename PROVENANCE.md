# Project Provenance & Architecture Record

This document provides an honest, transparent record of the codebase's origin, retained design patterns, new code written, third-party libraries, and AI pair-programming assistance.

---

## 1. Project Background & Transformation

The original Folio repository was a multi-tier client-server Python and React application dependent on local servers, databases, and background workers.

In accordance with the **Folio — Paper Studio Master Specification**, the codebase was completely refactored into a **100% browser-only static Vite application**:
- Completely eliminated Python backend, Docker, Celery, and database dependencies.
- Recreated the entire visual interface following the supplied Paper Studio visual references:
  - Reference 1: Desktop & Mobile Homepage.
  - Reference 2: Desktop Overview & Single Page Mode, and Mobile Images-to-PDF Workspace.
- Implemented real browser-only processing for all 8 supported tools using `pdf-lib`, `pdfjs-dist`, and `jszip`.

---

## 2. Paper Studio Design System

- **Palette**: Warm ivory canvas (`#F7F4ED`), Deep teal primary (`#14665B`), Charcoal typography (`#252B2A`), Soft orange accents (`#EFAB73`), Warm peach selection actions (`#FDF2E7`).
- **Typography**: Editorial serif headings (`Fraunces` / `Newsreader` / `Georgia`) paired with clean sans-serif controls (`Plus Jakarta Sans` / `Inter`).
- **Tactile Paper Elements**: Realistic soft paper shadows, natural layered sheet composition, custom SVG icons, and responsive 2-column mobile and 4-5 column desktop grids.

---

## 3. Newly Authored Codebase Components

The following modules were independently authored for this release:

1. **Core Processing Engines**:
   - `src/lib/pdfEngine.ts`: Client-side image-to-PDF compiler, EXIF rotation handling, alpha channel flattening, multi-PDF merger, split range parser and extractor, 90°/180°/270° rotator, page number stamp generator, text watermark generator, and organize page mapper.
   - `src/lib/toolRegistry.ts`: Centralized registry of all supported tools, categories, and routing metadata.
   - `src/lib/sampleImages.ts`: Canvas-based fixture generator reproducing the travel photos shown in Reference Image 2 (`coast.jpg`, `street.jpg`, `mountains.jpg`, `leaves.jpg`, etc.).
   - `src/lib/layout.ts`: Shared pixel-accurate PDF geometry engine.
   - `src/lib/sort.ts`: Natural numeric collation, alphabetical, and date sorting.

2. **User Interface Components**:
   - `src/components/Header.tsx`: Paper Studio header with brandmark, nav links, device-processing indicator, and mobile drawer.
   - `src/components/Footer.tsx`: Paper Studio footer with privacy and help triggers.
   - `src/components/Homepage.tsx`: Exact recreation of Reference Image 1 (hero section, layered paper composition, category pills, featured card, and 3-step process section).
   - `src/components/ImagesToPdfWorkspace.tsx`: Exact recreation of Reference Image 2 (overview mode, selection action bar, dense card grid, single page mode with zoom, document settings sidebar, and dedicated mobile view with slide-up drawer).
   - `src/components/MergePdfWorkspace.tsx`: Multi-document PDF combiner.
   - `src/components/SplitPdfWorkspace.tsx`: Page range splitter with single PDF or ZIP export.
   - `src/components/RotatePdfWorkspace.tsx`: Document and page rotation workspace with live visual angle preview.
   - `src/components/PdfToImagesWorkspace.tsx`: PDF vector rasterizer to JPG/PNG using `pdfjs-dist`.
   - `src/components/OrganizePdfWorkspace.tsx`: Visual reordering, deletion, and rotation grid.
   - `src/components/PageNumbersWorkspace.tsx`: Positioning, formatting, and margin numbering tool.
   - `src/components/WatermarkWorkspace.tsx`: Text watermark stamp tool with live opacity and placement simulation.
   - `src/components/Icons.tsx`: Custom SVG icons for all tools, actions, and status badges.
   - `src/components/Modals.tsx`: Accessible Privacy and Help dialogs.

3. **Automated Vitest Test Suite (44 Tests)**:
   - `src/tests/layout.test.ts` (15 tests)
   - `src/tests/sort.test.ts` (7 tests)
   - `src/tests/validation.test.ts` (10 tests)
   - `src/tests/tools.test.ts` (10 tests)
   - `src/tests/pdfGeneration.test.ts` (2 tests)

---

## 4. AI Assistance Declaration

This release was developed with the assistance of **Antigravity** (Google DeepMind advanced agentic coding assistant). AI assistance was utilized for architectural refactoring, UI recreation matching supplied reference screenshots, Vitest unit test creation, browser subagent visual validation, and documentation generation. No proprietary or unlicensed code was copied from third-party websites or competitors.
