import sys
import os
import json
import glob
import time
import statistics
import argparse
from datetime import datetime, timezone

import duckdb

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from engine import db

LAKE_ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "lake")
REPEATS = 5

QUERIES = {
    "full_scan": "SELECT event_type, SUM(amount) AS total FROM events GROUP BY event_type ORDER BY event_type",
    "monthly_filter": "SELECT event_type, SUM(amount) AS total FROM events WHERE event_month = '2024-06' GROUP BY event_type ORDER BY event_type",
    "daily_filter": "SELECT event_type, SUM(amount) AS total FROM events WHERE event_date = '2024-06-15' GROUP BY event_type ORDER BY event_type",
}


def _glob_pattern(strategy):
    return os.path.join(LAKE_ROOT, strategy, "**", "*.parquet").replace("\\", "/")


def _count_files(strategy):
    return len(glob.glob(
        os.path.join(LAKE_ROOT, strategy, "**", "*.parquet"),
        recursive=True,
    ))


def _storage_bytes(strategy):
    return sum(
        os.path.getsize(f)
        for f in glob.glob(
            os.path.join(LAKE_ROOT, strategy, "**", "*.parquet"),
            recursive=True,
        )
    )


def _files_in_partition(strategy, query_name):
    if query_name == "full_scan":
        return _count_files(strategy)

    if strategy == "unpartitioned":
        return _count_files(strategy)

    if query_name == "monthly_filter":
        if strategy == "monthly":
            matched = glob.glob(
                os.path.join(LAKE_ROOT, "monthly", "event_month=2024-06", "*.parquet")
            )
            return len(matched)
        if strategy == "daily":
            matched = glob.glob(
                os.path.join(LAKE_ROOT, "daily", "event_date=2024-06-*", "*.parquet")
            )
            return len(matched)

    if query_name == "daily_filter":
        if strategy == "monthly":
            matched = glob.glob(
                os.path.join(LAKE_ROOT, "monthly", "event_month=2024-06", "*.parquet")
            )
            return len(matched)
        if strategy == "daily":
            matched = glob.glob(
                os.path.join(LAKE_ROOT, "daily", "event_date=2024-06-15", "*.parquet")
            )
            return len(matched)

    return _count_files(strategy)


def _run_query(con, strategy, query_name, sql, repeats):
    pattern = _glob_pattern(strategy)

    if strategy in ("monthly", "daily"):
        read_expr = f"read_parquet('{pattern}', hive_partitioning=true)"
    else:
        read_expr = f"read_parquet('{pattern}')"

    full_sql = f"WITH events AS (SELECT * FROM {read_expr}) {sql}"

    timings = []
    result_rows = None
    checksum = ""

    for i in range(repeats):
        start = time.perf_counter()
        result = con.execute(full_sql).fetchall()
        elapsed_ms = (time.perf_counter() - start) * 1000
        timings.append(elapsed_ms)
        if result_rows is None:
            result_rows = len(result)
            total_sum = round(sum(float(r[1]) for r in result if r[1] is not None), 2)
            checksum = f"rows={len(result)},sum={total_sum}"

    return {
        "timings_ms": timings,
        "median_ms": round(statistics.median(timings), 3),
        "min_ms": round(min(timings), 3),
        "max_ms": round(max(timings), 3),
        "row_count": result_rows,
        "result_checksum": checksum,
        "first_run_ms": round(timings[0], 3),
        "warm_median_ms": round(statistics.median(timings[1:]), 3) if len(timings) > 1 else round(timings[0], 3),
    }


def run_benchmarks(run_id, compaction_status="pre-compaction", repeats=REPEATS):
    db.init_db()
    con = duckdb.connect()
    ran_at = datetime.now(timezone.utc).isoformat()

    report = {
        "run_id": run_id,
        "compaction_status": compaction_status,
        "ran_at": ran_at,
        "repetitions": repeats,
        "strategies": {},
        "notes": [
            "timings include cold first run; warm_median_ms excludes run 1",
            "estimated_files_scanned is partition-directory estimate, not DuckDB internal counter",
            "cache effects: OS page cache warms after run 1",
        ],
    }

    for strategy in ("unpartitioned", "monthly", "daily"):
        total_eligible = _count_files(strategy)
        storage = _storage_bytes(strategy)

        if total_eligible == 0:
            report["strategies"][strategy] = {"error": "no parquet files found"}
            continue

        strategy_result = {
            "total_eligible_files": total_eligible,
            "storage_bytes": storage,
            "queries": {},
        }

        for query_name, sql in QUERIES.items():
            timing = _run_query(con, strategy, query_name, sql, repeats)
            estimated_scanned = _files_in_partition(strategy, query_name)
            estimated_skipped = total_eligible - estimated_scanned
            bench_id = f"bm-{run_id}-{strategy[:3]}-{query_name}-{compaction_status[:4]}-{int(time.time()*1000)}"

            strategy_result["queries"][query_name] = {
                **timing,
                "benchmark_id": bench_id,
                "estimated_files_scanned": estimated_scanned,
                "estimated_files_skipped": estimated_skipped,
                "total_eligible_files": total_eligible,
                "estimated_pruning_ratio": round(estimated_skipped / total_eligible, 3) if total_eligible > 0 else 0,
            }

            db.insert_benchmark(
                benchmark_id=bench_id,
                run_id=run_id,
                compaction_status=compaction_status,
                strategy=strategy,
                query_name=query_name,
                median_ms=timing["median_ms"],
                min_ms=timing["min_ms"],
                max_ms=timing["max_ms"],
                row_count=timing["row_count"],
                estimated_files_scanned=estimated_scanned,
                total_eligible_files=total_eligible,
                storage_bytes=storage,
                repetitions=repeats,
                result_checksum=timing["result_checksum"],
                ran_at=ran_at,
            )

        report["strategies"][strategy] = strategy_result

    con.close()
    return report


def _print_summary(report):
    print(f"\n{'='*65}")
    print(f"BENCHMARK REPORT  run_id={report['run_id']}  status={report['compaction_status']}")
    print(f"{'='*65}")
    for note in report["notes"]:
        print(f"  NOTE: {note}")

    for strategy, data in report["strategies"].items():
        if "error" in data:
            print(f"\n[{strategy}] ERROR: {data['error']}")
            continue
        print(f"\n[{strategy}]  eligible_files={data['total_eligible_files']}  size={data['storage_bytes']:,}B")
        for qname, q in data["queries"].items():
            print(
                f"  {qname:<20}  median={q['median_ms']:>8.3f}ms"
                f"  warm={q['warm_median_ms']:>8.3f}ms"
                f"  estimated_scanned={q['estimated_files_scanned']}/{q['total_eligible_files']}"
                f"  pruning={q['estimated_pruning_ratio']:.1%}"
                f"  checksum={q['result_checksum']}"
            )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--compaction-status", default="pre-compaction")
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    report = run_benchmarks(args.run_id, compaction_status=args.compaction_status, repeats=args.repeats)

    if args.json:
        print(json.dumps(report))
    else:
        _print_summary(report)
        print(json.dumps(report))


if __name__ == "__main__":
    main()
