import sys
import os
import json
import hashlib
import argparse
import uuid
from datetime import datetime, timezone

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from engine import db
from engine.validation import (
    VALID_EVENT_TYPES,
    VALID_USER_POOL,
    REQUIRED_COLUMNS,
    check_schema,
    validate_and_split,
    resolve_duplicates,
)

LAKE_ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "lake")
QUARANTINE_ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "quarantine")


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _write_parquet(df, out_path, row_group_size=128_000):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    tmp_path = out_path + ".tmp"
    table = pa.Table.from_pandas(df, preserve_index=False)
    pq.write_table(
        table,
        tmp_path,
        compression="snappy",
        row_group_size=row_group_size,
        use_dictionary=False,
    )
    os.replace(tmp_path, out_path)


def _record_file(run_id, strategy, out_path, partition_key, row_count):
    size = os.path.getsize(out_path)
    sha = _sha256(out_path)
    db.insert_file_meta(
        run_id=run_id,
        strategy=strategy,
        file_path=out_path,
        partition_key=partition_key,
        row_count=row_count,
        file_size_bytes=size,
        sha256=sha,
        written_at=_now_iso(),
    )


def load_csv(path):
    df = pd.read_csv(path, dtype=str)
    drift_cols = [c for c in df.columns if c not in REQUIRED_COLUMNS]
    return df, drift_cols


def enrich(df, run_id, ingested_at):
    df = df.copy()
    df["event_timestamp"] = pd.to_datetime(df["event_timestamp"], format="mixed", utc=True)
    df["event_date"] = df["event_timestamp"].dt.date.astype(str)
    df["event_month"] = df["event_timestamp"].dt.tz_convert(None).dt.to_period("M").astype(str)
    df["ingested_at"] = ingested_at
    df["run_id"] = run_id
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
    return df


def write_strategies(df, run_id):
    strategies_written = {}

    out = os.path.join(LAKE_ROOT, "unpartitioned", f"{run_id}.parquet")
    _write_parquet(df, out)
    _record_file(run_id, "unpartitioned", out, None, len(df))
    strategies_written["unpartitioned"] = [out]

    monthly_files = []
    for month, group in df.groupby("event_month"):
        out = os.path.join(LAKE_ROOT, "monthly", f"event_month={month}", f"{run_id}.parquet")
        _write_parquet(group, out)
        _record_file(run_id, "monthly", out, month, len(group))
        monthly_files.append(out)
    strategies_written["monthly"] = monthly_files

    daily_files = []
    for date, group in df.groupby("event_date"):
        out = os.path.join(LAKE_ROOT, "daily", f"event_date={date}", f"{run_id}.parquet")
        _write_parquet(group, out)
        _record_file(run_id, "daily", out, date, len(group))
        daily_files.append(out)
    strategies_written["daily"] = daily_files

    return strategies_written


def write_quarantine(df_bad, run_id):
    if df_bad.empty:
        return
    os.makedirs(QUARANTINE_ROOT, exist_ok=True)
    path = os.path.join(QUARANTINE_ROOT, f"{run_id}_quarantine.csv")
    df_bad.to_csv(path, index=False)


def run_pipeline(csv_path, run_id=None, rows=None, seed=None):
    db.init_db()
    run_id = run_id or str(uuid.uuid4())
    ingested_at = _now_iso()
    db.create_run(run_id, ingested_at, os.path.basename(csv_path))

    result = {
        "run_id": run_id,
        "source": csv_path,
        "steps": {},
        "status": "running",
    }

    try:
        df, drift_cols = load_csv(csv_path)
        total_input = len(df)
        result["steps"]["load"] = {"rows": total_input, "drift_columns": drift_cols}

        missing_cols = check_schema(df)
        if missing_cols:
            raise ValueError(f"Missing required columns: {missing_cols}")

        good, rejected_count = validate_and_split(df, run_id)
        result["steps"]["validate"] = {"rejected": rejected_count, "passed": len(good)}

        if good.empty:
            finished_at = _now_iso()
            db.finish_run(run_id, finished_at, total_input, 0, rejected_count, 0, status="done")
            result["status"] = "done"
            result["reconciliation"] = {
                "total_input": total_input,
                "accepted_unique": 0,
                "exact_duplicates": 0,
                "rejected": rejected_count,
                "check": total_input == rejected_count,
            }
            return result

        good, exact_dup_count, conflict_quarantine = resolve_duplicates(good)
        conflict_rejected = len(conflict_quarantine)
        total_rejected = rejected_count + conflict_rejected
        result["steps"]["dedup"] = {
            "exact_duplicates_dropped": exact_dup_count,
            "conflict_duplicates_quarantined": conflict_rejected,
        }

        if not conflict_quarantine.empty:
            for _, row in conflict_quarantine.iterrows():
                db.insert_rejected(
                    run_id=run_id,
                    event_id=str(row.get("event_id", "")),
                    reject_reason="conflicting_duplicate",
                    raw_data=json.dumps(row.to_dict()),
                )

        good = enrich(good, run_id, ingested_at)
        result["steps"]["enrich"] = {"columns_added": ["event_date", "event_month", "ingested_at", "run_id"]}

        strategies = write_strategies(good, run_id)
        result["steps"]["write"] = {s: len(files) for s, files in strategies.items()}

        write_quarantine(conflict_quarantine, run_id)

        finished_at = _now_iso()
        db.finish_run(
            run_id=run_id,
            finished_at=finished_at,
            total_input_rows=total_input,
            accepted_rows=len(good),
            rejected_rows=total_rejected,
            exact_duplicate_rows=exact_dup_count,
            status="done",
        )

        result["status"] = "done"
        result["reconciliation"] = {
            "total_input": total_input,
            "accepted_unique": len(good),
            "exact_duplicates": exact_dup_count,
            "rejected": total_rejected,
            "check": total_input == len(good) + exact_dup_count + total_rejected,
        }

    except Exception as exc:
        db.finish_run(run_id, _now_iso(), 0, 0, 0, 0, status="failed")
        result["status"] = "failed"
        result["error"] = str(exc)

    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True)
    parser.add_argument("--run-id", default=None)
    args = parser.parse_args()

    result = run_pipeline(args.csv, run_id=args.run_id)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
