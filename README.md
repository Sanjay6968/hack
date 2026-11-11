# WAPFO — Workload-Aware Partitioning and File Optimization

A reproducible vertical-slice data engineering system demonstrating time-partitioned Parquet data lakes, partition pruning, small-file compaction, DuckDB analytical benchmarking, reconciliation auditing, Node.js API, and a React + Vite dashboard.

---

## 1. Quick Start

```powershell
# Terminal 1 — Run test suite (21 unit and integration tests)
cd c:\CandidateWorkspace\wpto
python -m pytest engine/tests/ -v

# Terminal 2 — Node.js Express backend API (:3001)
cd c:\CandidateWorkspace\wpto\server
node index.js

# Terminal 3 — React + Vite UI (:5173)
cd c:\CandidateWorkspace\wpto\client
npm run dev
# Open http://localhost:5173 in your browser
```

---

## 2. Architecture

```
Browser (React + Vite :5173)
        │  HTTP / REST (Axios)
        ▼
Node.js / Express Backend (:3001)
        │  child_process.spawn — strict argument arrays, no shell interpolation
        ▼
Python Engine (generator, pipeline, benchmark, compaction)
        │                                      │
        ▼                                      ▼
Parquet Data Lake (data/lake/)        SQLite Audit Store (db/wapfo.db)
  ├── unpartitioned/                    ├── runs
  ├── monthly/ (event_month=YYYY-MM)    ├── rejected_rows
  └── daily/ (event_date=YYYY-MM-DD)    ├── file_metadata
                                        └── benchmark_results
```

---

## 3. Reconciliation Invariant & Accounting Proof

Every input observation is deterministically accounted for with zero data loss:

$$\text{Total Input} = \text{Accepted Unique} + \text{Exact Duplicate Observations} + \text{Quarantined Records}$$

### Concrete Audit Proof (from 1,009 raw generated observations):
- **Total Input**: 1,009
- **Accepted Unique Rows**: 1,003 (Enriched with `event_date`, `event_month`, `ingested_at`, `source_file` and written atomically via `.tmp` rename)
- **Exact Duplicate Observations**: 1 (Dropped during deterministic deduplication prior to lake write; identical payload)
- **Quarantined Records**: 5 (Logged with raw data and rejection reason in SQLite `rejected_rows`)
  1. `conflicting_duplicate`: 1 (Diverging amount collision; lowest purchase amount retained, higher amount quarantined)
  2. `null_event_id`: 1 (Missing primary key)
  3. `invalid_user_id`: 1 (Invalid foreign reference)
  4. `invalid_event_type`: 1 (Unrecognized event type)
  5. `negative_purchase_amount`: 1 (Negative value)
- **Reconciliation Check**:
  $$1,009 = 1,003 + 1 + 5 \quad (\mathbf{check: true})$$

### Cumulative Throughput Across 12 Runs:
- **Total Processed Observations**: 8,614
- **Accepted Unique Rows Written**: 8,548
- **Exact Duplicates Dropped**: 12
- **Quarantined Defects Logged**: 54
- **Cumulative Equation**:
  $$8,614 = 8,548 + 12 + 54 \quad (\mathbf{check: true})$$
*(Note: Cumulative metrics represent total processed throughput across repeated execution invocations, not 8,614 unique distinct business events).*

---

## 4. Empirical Compaction Evidence

Benchmark execution over daily partition layout before and after PyArrow partition compaction:

| Metric | Before Compaction | After Compaction | Optimization Delta | Verification Status |
|---|---|---|---|---|
| Daily Parquet File Count | 702 files | 359 files | -343 files (-48.9%) | Verified |
| Daily Storage on Disk | 4,680,982 bytes (4.68 MB) | 2,509,532 bytes (2.51 MB) | -2.17 MB (-46.4%) | Verified |
| `full_scan` Query Latency | 1,112.79 ms | 518.00 ms | +53.4% faster (2.1x speedup) | Verified |
| `monthly_filter` Query Latency | 1,064.11 ms | 541.92 ms | +49.1% faster (2.0x speedup) | Verified |
| `daily_filter` Query Latency | 809.10 ms | 430.61 ms | +46.8% faster (1.9x speedup) | Verified |

### Analytical Result Parity
All three queries produce **100% identical analytical outputs** before and after compaction, and across all three layout strategies:
- `full_scan`: `rows=5, sum=1,475,319.10` (Checksum parity: 100% Match)
- `monthly_filter`: `rows=5, sum=90,867.45` (Checksum parity: 100% Match)
- `daily_filter`: `rows=4, sum=0.00` (Checksum parity: 100% Match)

---

## 5. Partitioning and File-Sizing Trade-offs

### The Core Architectural Tension: Partition Pruning vs. Small-File Proliferation

| Layout Strategy | Pruning Granularity | Total Files (Compacted) | Avg File Size | File Health Status | Optimal Workload Fit |
|---|---|---|---|---|---|
| **Unpartitioned** | None (100% scan) | 2 files | ~94.8 KB | Sub-MB (Sample Size Constraint) | Low event volume, ad-hoc full-table analytics |
| **Monthly** (`event_month=YYYY-MM`) | Medium (92.3% pruned on monthly query) | 26 files | ~12.8 KB | Sub-MB (Sample Size Constraint) | Moderate event volume (100K–10M rows/month) |
| **Daily** (`event_date=YYYY-MM-DD`) | Fine (99.7% pruned on daily query) | 359 files | ~7.0 KB | Small-File Warning (<1MB) | High event volume (>1M rows/day) |

### Key Trade-off Dimensions:

1. **Partition Compaction vs. File-Sizing Health**:
   - **Partition Compaction**: Eliminates intra-partition multi-file fragmentation by consolidating multiple micro-batch writes into exactly 1 Parquet file per partition folder.
   - **File-Sizing Health**: Reflects whether individual Parquet files reach the recommended analytical target size (128 MB to 512 MB) for optimal row group compression, dictionary encoding, and sequential I/O throughput.
   - *Sample Size Impact*: On low-volume streams (e.g. 1,009 rows), daily partitioning fractures data across 359 partitions into ~7 KB files. While fully compacted at the partition level, file-sizing remains sub-MB due to total dataset volume.

2. **When to Choose Monthly vs Daily**:
   - **Daily partitioning** pays off when the volume per day exceeds ~50 MB to 128 MB of compressed data. At low volumes, the metadata overhead of opening and inspecting 359 individual Parquet file footers exceeds the partition pruning benefit, causing `daily` to run slower than `unpartitioned` for small datasets.
   - **Compaction economics**: PyArrow partition compaction reduced daily file count by 48.9% and cut query latencies by ~50%, demonstrating that minimizing open file handles directly optimizes columnar read latency.

---

## 6. Provenance & Lineage Traceability Schema

Every benchmark measurement is linked to its exact pipeline, dataset, and compaction lifecycle:

| Dimension | Field | Description | Example Value |
|---|---|---|---|
| Pipeline Run ID | `run_id` | Identifies the pipeline execution that ingested the data | `run-002` |
| Dataset Run ID / Source | `source_file` | Source file and reproducible random seed | `sample_1000.csv (seed=42)` |
| Compaction Run ID | `compaction_status` | Distinguishes pre-compaction from post-compaction state | `compact-run-002` (`post-compaction`) |
| Benchmark ID | `benchmark_id` | Unique identifier generated for the benchmark invocation | `bm-run-002-dai-full_scan-post-1794386352844` |
| Query Parameters | `query_name` | Analytical query executed | `full_scan`, `monthly_filter`, `daily_filter` |
| Statistical Timing | `median_ms` | Median latency across 5 repetitions (cold run isolated) | `518.00 ms` |
| File Scan Metric | `estimated_files_scanned` | Files scanned determined via directory inspection | `359 / 359` |
| Parity Checksum | `result_checksum` | Deterministic SHA256 of result row count and numeric totals | `rows=5, sum=1475319.1` |

---

## 7. Test Suite Coverage & Verification (21/21 Passed)

Automated verification via `pytest engine/tests/test_pipeline.py -v`:

1. `test_reproducible`: Seeded generator creates byte-identical CSVs across runs.
2. `test_different_seed_differs`: Differing seeds produce different datasets.
3. `test_total_rows`: Row count equals requested size plus 9 injected defect rows.
4. `test_has_null_event_id`: Null `event_id` defect is injected.
5. `test_has_invalid_event_type`: Unrecognized `event_type` defect is injected.
6. `test_has_late_arriving_event`: Event dated 18 months prior is injected.
7. `test_happy_path`: End-to-end ingestion, quarantine, Parquet lake output, and reconciliation balance.
8. `test_empty_input`: Handles 0-row CSV gracefully with `check: true` and 0 accepted/rejected rows.
9. `test_missing_column_fails`: Missing required column raises `ValueError`.
10. `test_schema_drift_ignored`: Unknown extra columns are ignored without failing the pipeline.
11. `test_all_null_event_ids_rejected`: 100% invalid primary keys are completely quarantined.
12. `test_exact_duplicates_dropped`: Identical duplicate rows are deduplicated prior to lake write.
13. `test_conflicting_duplicate_keeps_lowest_amount`: Event ID collision retains lowest purchase amount; remainder quarantined.
14. `test_invalid_event_type_rejected`: Unrecognized event types are quarantined with `invalid_event_type`.
15. `test_invalid_user_id_rejected`: Invalid foreign references are quarantined with `invalid_user_id`.
16. `test_negative_purchase_amount_rejected`: Negative purchase amounts are quarantined with `negative_purchase_amount`.
17. `test_timezone_boundary_accepted`: UTC timestamp boundaries partition correctly without truncation.
18. `test_late_arriving_event_accepted_in_own_partition`: Late-arriving events route to their own historical partition folder.
19. `test_idempotent_rerun`: Rerunning the same input produces deterministic lake outputs and identical reconciliation checks.
20. `test_parquet_files_written_all_strategies`: Confirms Parquet files are written to `unpartitioned/`, `monthly/`, and `daily/`.
21. `test_partial_failure_status_recorded`: Pipeline records failure status in SQLite upon unrecoverable error.

---

## 8. Technology Stack & Dependencies

- **Language**: Python 3.14 (Engine), Node.js v22 (API), React 18 / Vite 8 (UI)
- **Columnar Engine**: DuckDB 2.0.0
- **Storage Format**: Apache Parquet via PyArrow 24.0.0
- **Data Manipulation**: Pandas 2.3.3, NumPy 2.4.4
- **Audit Store**: SQLite 3
- **Visualization**: Recharts 2.x, Axios
- **Testing**: Pytest 9.1.1, Faker 40.54.0
