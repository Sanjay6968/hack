# WAPFO Backend Server

Independent Node.js + Express backend API service for the Workload-Aware Partitioning and File Optimization (WAPFO) platform.

---

## 1. Overview
- Exposes RESTful HTTP JSON endpoints for pipeline ingestion, partition compaction, analytical benchmarks, and SQLite ledger queries.
- Manages dataset file uploads via `multer`.
- Executes Python engine operations through isolated child processes with structured JSON streaming.
- Fully decoupled from the client application with CORS enabled.

---

## 2. Quick Start

```powershell
cd server
npm install
node index.js
```

The backend API server listens on `http://localhost:3001`.

---

## 3. Configuration & Environment Variables

Copy `.env.example` to `.env` to customize settings:

```ini
PORT=3001
PYTHON_BIN=python
```

---

## 4. API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Backend service health and connectivity status |
| `POST` | `/api/upload` | Upload local CSV datasets to `data/raw/` |
| `POST` | `/api/generate` | Generate deterministic synthetic datasets |
| `POST` | `/api/pipeline` | Ingest CSV data into partitioned Parquet lakes |
| `POST` | `/api/benchmark` | Execute DuckDB analytical query benchmarks |
| `POST` | `/api/compact` | Consolidate fragmented partition files into 1 file/partition |
| `GET` | `/api/runs` | Query pipeline run history ledger from SQLite |
| `GET` | `/api/runs/:id` | Query detailed run metadata, rejected rows, and lake manifests |
| `GET` | `/api/benchmarks` | Query historical latency and pruning measurements |
| `POST` | `/api/benchmarks/clear`| Truncate benchmark measurements in SQLite |
| `GET` | `/api/data-quality` | Query row-level defect classifications |
| `GET` | `/api/file-health` | Query lake file count, partition count, and average file size |
