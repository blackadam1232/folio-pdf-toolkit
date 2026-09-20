# Application Provenance

The application-specific Python backend, React/TypeScript frontend, CSS design system, PDF generation algorithms, and project documentation in this package were independently designed and developed with AI coding assistance.

- **No Proprietary Code Reused**: No code, design assets, branding, or proprietary scripts from third-party services (e.g. iLovePDF, Smallpdf, Adobe Document Cloud) were used. All PDF manipulation, queue management, storage drivers, and UI components are independent implementations.
- **Standards Compliance**: The PDF generation engine implements standard ISO 32000-1 specification structures, including indirect object streams, 64-bit cross-reference streams (`/Type /XRef`), balanced page trees (`/Type /Pages` with branching factor 32), and JPEG `DCTDecode` / Flate compression filters.
- **Third-Party Libraries**: Maintained open-source third-party dependencies (`pypdf`, `pypdfium2`, `pillow`, `fastapi`, `uvicorn`, `boto3`, `argon2-cffi`, `psycopg2-binary`, `react`, `vite`) are used under their respective open-source licenses (MIT, Apache-2.0, BSD-3-Clause). See `THIRD_PARTY_NOTICES.md` for license texts.
- **Authorship & Customization**: The codebase is cleanly structured and ready for private enterprise deployment or open-source release under your chosen license.
