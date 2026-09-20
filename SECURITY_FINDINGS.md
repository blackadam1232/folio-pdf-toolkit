# Folio PDF Toolkit — Security Audit & Risk Mitigation Report

## 1. Threat Model & Architecture Overview

Folio PDF Toolkit processes potentially untrusted user documents (images, PDFs) and handles user authentication, session state, and document storage across both single-tenant local operation and multi-tenant hosted Vercel deployments.

---

## 2. Identified Vulnerability Classes & Implemented Mitigations

### 2.1 Pre-Signed S3 Upload & Direct Storage Security
- **Risk**: Malicious users could attempt arbitrary file writes, overwrite existing user documents, bypass upload size restrictions, or upload executable polyglots.
- **Mitigation**:
  1. **Isolated Storage Keys**: Upload keys are formatted as `uuid.uuid4().hex + extension`, completely separating user-provided filenames from physical storage keys.
  2. **Magic Byte Verification**: `verify_upload` inspects the initial 16 bytes of every uploaded file to verify that the file begins with standard magic headers (`%PDF-`, `\xFF\xD8\xFF`, `\x89PNG\r\n\x1a\n`, `RIFF....WEBP`, `BM`, `II*\x00`, `MM\x00*`). Executable binaries, scripts, or non-image payloads are immediately rejected.
  3. **Strict Quota Enforcement**: Storage quotas are evaluated before issuing upload URLs and re-verified upon confirmation.
  4. **Expiring Signed URLs**: Pre-signed upload URLs expire after 15 minutes (900 seconds), and pre-signed download URLs expire after 60 minutes (3600 seconds).

### 2.2 Serverless Request Body Limit (4.5 MB Vercel Edge Limit)
- **Risk**: Direct file uploads through serverless functions on Vercel fail with HTTP 413 Payload Too Large whenever files exceed 4.5 MB.
- **Mitigation**:
  - The client requests a signed upload URL via `POST /api/jobs/{id}/upload-url` and directly streams the file to S3/R2 using an HTTP PUT request.
  - The file never transits through the serverless function runtime, entirely circumventing the 4.5 MB payload limit while reducing serverless execution costs to negligible levels.

### 2.3 Account Security, Session Tokens & Rate Limiting
- **Password Hashing**: Passwords are hashed using Argon2id (`argon2-cffi`) with secure parameters.
- **Timing Attack Mitigation**: In `auth.py`, dummy password verification (`DUMMY`) is performed when an email is not found, ensuring constant-time responses to thwart timing-based email enumeration attacks.
- **Rate Limiting**: Authentication endpoints enforce strict in-memory rate limits both per account (`login:<email>`) and per IP address (`ip:<host>`), preventing credential stuffing and brute force attempts.
- **Single-Use Expiring Tokens**: Password reset tokens and invitation tokens are cryptographically generated (32 bytes url-safe), stored with creation timestamps, and invalidated immediately upon first use or expiry.
- **CSRF Protection**: All state-modifying requests (`POST`, `PATCH`, `DELETE`) require a valid `X-CSRF-Token` header matching the user's active session. Cross-origin requests from untrusted origins are rejected with HTTP 403.

### 2.4 Document Isolation & Ownership
- **Authorization Checks**: Every job, asset, and revision query enforces `WHERE owner = ?`. Users cannot read, download, modify, or delete another user's files even if they know the UUID.
- **Temporary File Sandboxing**: Scratch directories are created inside temporary paths with restricted permissions and cleaned up in `finally` blocks, ensuring no intermediate artifacts linger on disk.

### 2.5 Image Processing & Resource Exhaustion (DoS)
- **Decompression Bomb Defense**: `Image.MAX_IMAGE_PIXELS` is strictly constrained to 40,000,000 pixels (40 MP). Images exceeding this limit fail fast with a `ValueError` before memory allocation occurs.
- **No In-Memory PDF Buffers**: `PDFWriter` streams indirect objects and image streams directly to disk in 1 MB chunks without buffering the full document in RAM.
- **Process Memory Limits**: On POSIX worker nodes, `resource.setrlimit` bounds `RLIMIT_AS` (virtual memory) to 2048 MB, `RLIMIT_CPU` to 1800 seconds, and file descriptors to 256.

---

## 3. Recommended Production Environment Configuration

When deploying to production on Vercel with AWS S3 / Cloudflare R2:

1. **Bucket Privacy**: Set the S3 bucket policy to **Block all public access**. All access must use pre-signed URLs.
2. **CORS Configuration**: Configure CORS on the S3 bucket to allow `PUT` and `GET` requests only from your verified custom domain (`https://your-domain.vercel.app`).
3. **Database SSL**: Set `DATABASE_URL` with `sslmode=require` (e.g. Neon, Supabase, or AWS RDS).
4. **Environment Variables**: Never commit `.env` or credentials. Set `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `DATABASE_URL`, and `FOLIO_ORIGIN` directly in the Vercel Project Settings and Worker Container environment.
