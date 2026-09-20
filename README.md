# Folio PDF Toolkit

An independently authored, mobile-first PDF and image workspace deployable to **Vercel** with S3-compatible cloud storage, or runnable as a standalone offline desktop application with zero cloud dependencies.

---

## Key Highlights & User Priorities

1. **Correct Vercel Deployment**:
   - Static React / Vite edge frontend with serverless FastAPI API (`api/index.py`).
   - S3-compatible pre-signed direct upload and download flow (Cloudflare R2 / AWS S3) to bypass Vercel's 4.5 MB request limit.
   - Dual-mode database: SQLite for local desktop mode (`start.bat` / `start.sh`) and PostgreSQL (Neon / Supabase) for hosted cloud deployments.
2. **Fast PDF Opening & Smooth 60fps Scrolling**:
   - **Quality Profiles**:
     - `Screen/Mobile` (Default): ~150 DPI target resolution, bound 1800px, JPEG quality 82 with 4:2:0 subsampling. File size is reduced by **68%**, and viewer memory footprint drops from 36 MB to ~3–5 MB per page, ensuring smooth scrolling on mobile devices and laptops without crashes.
     - `Print`: ~300 DPI target resolution, bound 3600px, JPEG quality 92 with 4:2:2 subsampling.
     - `Original`: Preserves exact pixels and original quality.
   - **Balanced Page Tree**: Replaces flat `/Kids` arrays with hierarchical B-Trees (branching factor 32) for documents with >32 pages, enabling instant seek and navigation in PDF readers (Adobe Acrobat, Chrome PDFium, Apple Preview).
   - **SHA-256 Resource Deduplication**: Repeated or duplicate images share the same internal PDF `/XObject` stream, eliminating redundant megabytes from final documents.
   - **Elimination of Raw Flate RGB Bloat**: Eliminates decompression memory spikes in PDF viewers.
3. **Mobile-First Responsive Interface**:
   - Tested and fully responsive from **320px to 1440px** (320, 360, 390, 430, 768, 1024, 1440px).
   - Touch-friendly controls: Move Up (▲) / Move Down (▼) buttons and numerical position jump inputs in addition to drag-and-drop.
   - Safe-area insets (`env(safe-area-inset-bottom)`) for modern mobile browsers.
   - 16px minimum font size on mobile inputs to prevent iOS Safari auto-zoom.
   - Virtualized file lists and cancelable on-demand preview generation.
4. **Secure User Accounts & Document Privacy**:
   - Invitation-only account creation, Argon2id password hashing, single-use expiring reset/invite tokens.
   - Strict owner authorization (`WHERE owner = ?`) on every asset, job, and download.
   - Magic byte header inspection on uploads (`%PDF-`, PNG, JPEG, WebP) to block malicious polyglots.
   - Rate limiting on authentication routes (both by IP and email).
5. **Preserved PDF Tooling**:
   - All 11 tools preserved: Images to PDF, Merge, Extract, Split, Organize, Render to PNG/JPEG, Compress, Page Numbers, Watermark, Password Protect, and Password Unlock.
   - Multi-directional sorting (Natural filename, Natural descending, Filename A-Z, Filename Z-A, Date modified, Newest first, Manual).
   - Post-completion margin and settings adjustments creating clean new revisions.

---

## Quick Start: Local Mode (Windows / macOS / Linux)

### Windows
```bat
start.bat
```
The first launch automatically creates `.venv` and installs dependencies. Later launches work completely offline.

### Linux / macOS
```bash
bash start.sh
```

---

## Cloud Deployment (Vercel + S3 + PostgreSQL)

See [DEPLOYMENT.md](DEPLOYMENT.md) for full instructions:
1. Push to GitHub.
2. Import repository into [Vercel](https://vercel.com/new).
3. Set environment variables (`FOLIO_MODE=web`, `FOLIO_ORIGIN`, `DATABASE_URL`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`).
4. Run the dedicated worker daemon (`python -m backend.worker_service`) on Railway, Fly.io, or Docker.

---

## Performance & Security Documentation

- **[BENCHMARK_REPORT.md](BENCHMARK_REPORT.md)**: Empirical measurements of file size, peak memory, and scrolling times.
- **[SECURITY_FINDINGS.md](SECURITY_FINDINGS.md)**: Security audit, risk assessment, and threat mitigation details.
- **[DEPLOYMENT.md](DEPLOYMENT.md)**: Production deployment architecture and step-by-step setup.
- **[PROVENANCE.md](PROVENANCE.md)**: Authorship, architecture decisions, and third-party license notices.
