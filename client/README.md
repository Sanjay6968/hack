# WAPFO Frontend Client

Independent React 18 + Vite 8 frontend client for the Workload-Aware Partitioning and File Optimization (WAPFO) platform.

---

## 1. Features
- Dark bronze / warm gold enterprise dashboard layout.
- Standalone SPA with client-side routing via `react-router-dom`.
- Interactive query latency visualizations powered by `recharts`.
- Live API connectivity health checks against the backend service.
- Completely decoupled from backend implementation; communicates purely via HTTP JSON REST APIs.

---

## 2. Quick Start

```powershell
cd client
npm install
npm run dev
```

The application will be served locally on `http://localhost:5173`.

---

## 3. Configuration & Environment Variables

Copy `.env.example` to `.env` to configure the target backend API endpoint:

```ini
VITE_API_URL=http://localhost:3001
```

If `VITE_API_URL` is omitted, the frontend defaults to `http://localhost:3001` with automated proxy routing configured in `vite.config.js`.

---

## 4. Production Build

To compile a standalone production distribution:

```powershell
npm run build
```

Compiled static artifacts are generated into `client/dist/` ready to be served by any static host (Nginx, S3, Cloudflare Pages, etc.).
