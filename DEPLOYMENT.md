# Folio PDF Toolkit — Deployment Guide

Folio PDF Toolkit supports two deployment architectures:
1. **Local Desktop / Self-Hosted Mode**: Single-node zero-cloud operation using local SQLite, local filesystem, and local process scheduler (`start.bat` on Windows or `start.sh` on Linux/macOS).
2. **Modern Cloud Deployment with Vercel**: Static Frontend + Serverless API on Vercel, serverless PostgreSQL (Neon / Supabase), S3-compatible private object storage (AWS S3 / Cloudflare R2), and a dedicated asynchronous background worker.

---

## Architecture Diagram (Vercel Cloud Deployment)

```
                     ┌────────────────────────────────────────────────────────┐
                     │                     VERCEL EDGE                        │
                     │  - React / Vite Static Frontend (Edge CDN)             │
                     │  - Serverless API (`api/index.py` via FastAPI ASGI)   │
                     │    * Auth, sessions, CSRF, rate-limits                │
                     │    * Job metadata & revision tracking                  │
                     │    * Pre-signed direct upload & download generation   │
                     └───────────────────┬────────────────┬───────────────────┘
                                         │                │
            Direct Uploads / Downloads   │                │ Database Queries
       (Bypasses Vercel 4.5MB Limit)     │                │ (Pool-safe)
                                         ▼                ▼
                     ┌────────────────────────┐       ┌────────────────────────┐
                     │  S3 / R2 Private Bucket│       │  PostgreSQL / Supabase │
                     │  - Assets & PDF outputs│       │  - Users, Sessions     │
                     │  - Private by default  │       │  - Jobs, Queue state   │
                     └───────────┬────────────┘       └───────────┬────────────┘
                                 │                                │
                                 │   Reads/Writes Files           │ Polls Queue / Updates
                                 │   via S3 API                   │ Status & Progress
                                 └────────────────┬───────────────┘
                                                  │
                                     ┌────────────▼──────────────┐
                                     │  DEDICATED WORKER RUNTIME │
                                     │  (Docker / VPS / Railway) │
                                     │  - Worker daemon (`run`)  │
                                     │  - Bounded concurrency    │
                                     │  - PDF processing & memory│
                                     │  - Idempotent execution   │
                                     └───────────────────────────┘
```

---

## 1. Deploying Frontend & Serverless API to Vercel

### Step 1: Push Repository to GitHub / GitLab
```bash
git init
git add .
git commit -m "Deploy Folio PDF Toolkit to Vercel"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/folio-pdf-toolkit.git
git push -u origin main
```

### Step 2: Import Project into Vercel
1. Go to [vercel.com/new](https://vercel.com/new) and select your imported Git repository.
2. Vercel automatically detects `vercel.json`:
   - **Framework Preset**: Other / Vite
   - **Build Command**: `cd frontend && npm install && npm run build`
   - **Output Directory**: `frontend/dist`
   - **Functions**: `api/index.py` (Python 3.12+ Serverless Runtime)

### Step 3: Configure Environment Variables in Vercel
In **Vercel Project Settings > Environment Variables**, add:

| Variable | Description | Example Value |
|---|---|---|
| `FOLIO_MODE` | Application mode | `web` |
| `FOLIO_ORIGIN` | Your production URL | `https://your-folio-app.vercel.app` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@ep-xyz.neon.tech/folio?sslmode=require` |
| `S3_BUCKET` | Private bucket name | `folio-documents` |
| `S3_ENDPOINT` | Endpoint URL (for Cloudflare R2 / MinIO) | `https://<account_id>.r2.cloudflarestorage.com` (leave empty for AWS) |
| `S3_REGION` | Storage region | `auto` (or `us-east-1`) |
| `S3_ACCESS_KEY_ID` | Storage access key ID | `AKIA...` |
| `S3_SECRET_ACCESS_KEY` | Storage secret key | `wJalrX...` |
| `FOLIO_STORAGE_BACKEND` | Active storage backend | `s3` |

Click **Deploy**.

---

## 2. Setting Up Cloud Services

### 2.1 Database (PostgreSQL)
We recommend **Neon.tech** or **Supabase**:
1. Create a free serverless PostgreSQL database.
2. Copy the connection string into `DATABASE_URL`.
3. Folio automatically creates the required schema (`users`, `sessions`, `jobs`, `assets`, `audit_log`, `tokens`) on first startup.

### 2.2 S3-Compatible Storage (Cloudflare R2 or AWS S3)
We recommend **Cloudflare R2** (zero egress fees, fast global CDN):
1. In Cloudflare Dashboard, create a private R2 bucket named `folio-documents`.
2. Generate an **R2 API Token** with Read & Write permissions.
3. Configure **CORS Policy** on the bucket:
```json
[
  {
    "AllowedOrigins": ["https://your-folio-app.vercel.app", "http://localhost:5173"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 3. Dedicated Background Worker Service

Heavy document processing (e.g. converting 1,000 photos to PDF, OCR, page manipulation) requires predictable CPU and RAM that exceed standard serverless execution limits.

The dedicated worker daemon (`backend.worker_service`) polls the database queue atomically, claims jobs using database locking (`FOR UPDATE SKIP LOCKED` on Postgres), downloads assets, executes the conversion with bounded memory, uploads the result to S3, and updates progress in real time.

### Option A: Railway / Render / Fly.io (One-Click Container)
1. In Railway or Fly.io, point to this repository.
2. Set the startup command:
```bash
python -m backend.worker_service
```
3. Attach the same environment variables (`DATABASE_URL`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`).

### Option B: Self-Hosted Docker Container
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ backend/
CMD ["python", "-m", "backend.worker_service"]
```

Run with:
```bash
docker run -d --name folio-worker \
  -e DATABASE_URL="postgresql://..." \
  -e S3_BUCKET="folio-documents" \
  -e S3_ACCESS_KEY_ID="..." \
  -e S3_SECRET_ACCESS_KEY="..." \
  folio-worker:latest
```

---

## 4. Admin Account Initialization

In hosted web mode, public user registration without an invitation is disabled by default.
To initialize the first administrator:

```bash
python -m backend.admin create-admin --email you@example.com
```
Enter your secure password when prompted. You can now log into your production deployment and generate invite links for your team.

---

## 5. Cost & Limits Analysis

| Component | Provider | Free Tier / Cost | Limits |
|---|---|---|---|
| **Frontend & API** | Vercel Hobby | **$0 / month** | 100 GB Bandwidth, Edge CDN |
| **Direct Uploads** | Cloudflare R2 | **$0 / month** | 10 GB storage free, **$0 egress fees** |
| **Database** | Neon / Supabase | **$0 / month** | 0.5 GB storage, serverless pool |
| **Worker Daemon** | Railway / Fly.io | **$0–$5 / month** | 512 MB – 2 GB RAM execution |
| **Total Cloud Cost** | — | **~$0 – $5 / month** | Full multi-user production toolkit |
