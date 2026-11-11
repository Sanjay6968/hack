import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "db", "wapfo.db")


def _connect():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = _connect()
    with conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS runs (
                run_id TEXT PRIMARY KEY,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                source_file TEXT,
                total_input_rows INTEGER,
                accepted_rows INTEGER,
                rejected_rows INTEGER,
                exact_duplicate_rows INTEGER,
                status TEXT DEFAULT 'running'
            );

            CREATE TABLE IF NOT EXISTS rejected_rows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                event_id TEXT,
                reject_reason TEXT NOT NULL,
                raw_data TEXT,
                FOREIGN KEY (run_id) REFERENCES runs(run_id)
            );

            CREATE TABLE IF NOT EXISTS file_metadata (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                strategy TEXT NOT NULL,
                file_path TEXT NOT NULL,
                partition_key TEXT,
                row_count INTEGER,
                file_size_bytes INTEGER,
                sha256 TEXT,
                written_at TEXT,
                FOREIGN KEY (run_id) REFERENCES runs(run_id)
            );
        """)
        cols = [c[1] for c in conn.execute("PRAGMA table_info(benchmark_results)").fetchall()]
        if cols and "benchmark_id" not in cols:
            conn.execute("DROP TABLE benchmark_results")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS benchmark_results (
                benchmark_id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                compaction_status TEXT NOT NULL,
                strategy TEXT NOT NULL,
                query_name TEXT NOT NULL,
                median_ms REAL,
                min_ms REAL,
                max_ms REAL,
                row_count INTEGER,
                estimated_files_scanned INTEGER,
                total_eligible_files INTEGER,
                storage_bytes INTEGER,
                repetitions INTEGER,
                result_checksum TEXT,
                ran_at TEXT,
                FOREIGN KEY (run_id) REFERENCES runs(run_id)
            );
        """)
    conn.close()


def create_run(run_id, started_at, source_file):
    conn = _connect()
    with conn:
        conn.execute(
            "INSERT OR IGNORE INTO runs (run_id, started_at, source_file) VALUES (?, ?, ?)",
            (run_id, started_at, source_file),
        )
    conn.close()


def finish_run(run_id, finished_at, total_input_rows, accepted_rows, rejected_rows, exact_duplicate_rows, status="done"):
    conn = _connect()
    with conn:
        conn.execute(
            """UPDATE runs SET finished_at=?, total_input_rows=?, accepted_rows=?,
               rejected_rows=?, exact_duplicate_rows=?, status=? WHERE run_id=?""",
            (finished_at, total_input_rows, accepted_rows, rejected_rows, exact_duplicate_rows, status, run_id),
        )
    conn.close()


def insert_rejected(run_id, event_id, reject_reason, raw_data):
    conn = _connect()
    with conn:
        conn.execute(
            "INSERT INTO rejected_rows (run_id, event_id, reject_reason, raw_data) VALUES (?, ?, ?, ?)",
            (run_id, event_id, reject_reason, raw_data),
        )
    conn.close()


def insert_file_meta(run_id, strategy, file_path, partition_key, row_count, file_size_bytes, sha256, written_at):
    conn = _connect()
    with conn:
        conn.execute(
            """INSERT INTO file_metadata
               (run_id, strategy, file_path, partition_key, row_count, file_size_bytes, sha256, written_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (run_id, strategy, file_path, partition_key, row_count, file_size_bytes, sha256, written_at),
        )
    conn.close()


def insert_benchmark(benchmark_id, run_id, compaction_status, strategy, query_name, median_ms, min_ms, max_ms, row_count, estimated_files_scanned, total_eligible_files, storage_bytes, repetitions, result_checksum, ran_at):
    conn = _connect()
    with conn:
        conn.execute(
            """INSERT OR REPLACE INTO benchmark_results
               (benchmark_id, run_id, compaction_status, strategy, query_name, median_ms, min_ms, max_ms, row_count, estimated_files_scanned, total_eligible_files, storage_bytes, repetitions, result_checksum, ran_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (benchmark_id, run_id, compaction_status, strategy, query_name, median_ms, min_ms, max_ms, row_count, estimated_files_scanned, total_eligible_files, storage_bytes, repetitions, result_checksum, ran_at),
        )
    conn.close()


def get_runs(limit=50):
    conn = _connect()
    rows = conn.execute(
        "SELECT * FROM runs ORDER BY started_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_run_detail(run_id):
    conn = _connect()
    run = conn.execute("SELECT * FROM runs WHERE run_id=?", (run_id,)).fetchone()
    rejected = conn.execute(
        "SELECT event_id, reject_reason, raw_data FROM rejected_rows WHERE run_id=?", (run_id,)
    ).fetchall()
    files = conn.execute(
        "SELECT * FROM file_metadata WHERE run_id=?", (run_id,)
    ).fetchall()
    benchmarks = conn.execute(
        "SELECT * FROM benchmark_results WHERE run_id=?", (run_id,)
    ).fetchall()
    conn.close()
    return {
        "run": dict(run) if run else None,
        "rejected": [dict(r) for r in rejected],
        "files": [dict(f) for f in files],
        "benchmarks": [dict(b) for b in benchmarks],
    }


def get_benchmarks_all():
    conn = _connect()
    rows = conn.execute(
        "SELECT * FROM benchmark_results ORDER BY ran_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def truncate_benchmarks():
    conn = _connect()
    with conn:
        conn.execute("DELETE FROM benchmark_results")
    conn.close()


def get_data_quality(run_id=None):
    conn = _connect()
    if run_id and run_id != "all":
        run = conn.execute("SELECT * FROM runs WHERE run_id=?", (run_id,)).fetchone()
        rows = conn.execute("SELECT reject_reason, COUNT(*) as cnt FROM rejected_rows WHERE run_id=? GROUP BY reject_reason", (run_id,)).fetchall()
        total_input = run["total_input_rows"] if run else 0
        accepted = run["accepted_rows"] if run else 0
        exact_dups = run["exact_duplicate_rows"] if run else 0
        rejected = run["rejected_rows"] if run else 0
    else:
        run = None
        rows = conn.execute("SELECT reject_reason, COUNT(*) as cnt FROM rejected_rows GROUP BY reject_reason").fetchall()
        totals = conn.execute("SELECT SUM(total_input_rows) as ti, SUM(accepted_rows) as ac, SUM(exact_duplicate_rows) as ed, SUM(rejected_rows) as rj FROM runs").fetchone()
        total_input = totals["ti"] or 0
        accepted = totals["ac"] or 0
        exact_dups = totals["ed"] or 0
        rejected = totals["rj"] or 0

    reasons = {r["reject_reason"]: r["cnt"] for r in rows}
    conn.close()

    return {
        "run_id": run_id or "all",
        "total_input": total_input,
        "accepted_unique": accepted,
        "exact_duplicates": exact_dups,
        "rejected_total": rejected,
        "conflicting_duplicates": reasons.get("conflicting_duplicate", 0),
        "missing_required_fields": reasons.get("null_event_id", 0),
        "invalid_references": reasons.get("invalid_user_id", 0),
        "invalid_event_types": reasons.get("invalid_event_type", 0),
        "invalid_amounts": reasons.get("negative_purchase_amount", 0),
        "reconciliation_check": total_input == (accepted + exact_dups + rejected),
    }
