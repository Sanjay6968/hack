import sys
import os
import json
import glob
import argparse
from datetime import datetime, timezone

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

LAKE_ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "lake")
SMALL_FILE_THRESHOLD_BYTES = 1 * 1024 * 1024


def get_file_health():
    import statistics
    report = {}
    for strategy in ("unpartitioned", "monthly", "daily"):
        partitions = _list_partitions(strategy)
        all_files = glob.glob(os.path.join(LAKE_ROOT, strategy, "**", "*.parquet"), recursive=True)
        sizes = [os.path.getsize(f) for f in all_files]
        small_files = [s for s in sizes if s < SMALL_FILE_THRESHOLD_BYTES]
        report[strategy] = {
            "total_files": len(all_files),
            "partition_count": len(partitions),
            "total_bytes": sum(sizes),
            "avg_file_size_bytes": int(statistics.mean(sizes)) if sizes else 0,
            "median_file_size_bytes": int(statistics.median(sizes)) if sizes else 0,
            "small_file_count": len(small_files),
        }
    return report


def _list_partitions(strategy):
    base = os.path.join(LAKE_ROOT, strategy)
    if strategy == "unpartitioned":
        return [base]
    return [
        d for d in glob.glob(os.path.join(base, "*"))
        if os.path.isdir(d)
    ]


def _parquet_files_in(directory):
    return glob.glob(os.path.join(directory, "*.parquet"))


def analyze_files(strategy):
    report = []
    for partition_dir in _list_partitions(strategy):
        files = _parquet_files_in(partition_dir)
        sizes = [os.path.getsize(f) for f in files]
        small = [s for s in sizes if s < SMALL_FILE_THRESHOLD_BYTES]
        report.append({
            "partition": os.path.basename(partition_dir),
            "file_count": len(files),
            "total_bytes": sum(sizes),
            "small_file_count": len(small),
            "avg_bytes": int(sum(sizes) / len(sizes)) if sizes else 0,
            "needs_compaction": len(files) > 1,
        })
    return report


def compact_partition(partition_dir, run_id="compact"):
    files = _parquet_files_in(partition_dir)
    if len(files) <= 1:
        return {"skipped": True, "reason": "already 1 file or empty", "partition": partition_dir}

    import pandas as pd
    frames = []
    for f in files:
        df = pq.ParquetFile(f).read().to_pandas()
        for col in df.select_dtypes(include="category").columns:
            df[col] = df[col].astype(str)
        frames.append(df)
    merged_df = pd.concat(frames, ignore_index=True)
    merged = pa.Table.from_pandas(merged_df, preserve_index=False)

    out_name = f"{run_id}_compacted.parquet"
    out_path = os.path.join(partition_dir, out_name)
    tmp_path = out_path + ".tmp"

    pq.write_table(merged, tmp_path, compression="snappy", row_group_size=128_000)
    os.replace(tmp_path, out_path)

    for f in files:
        if os.path.abspath(f) != os.path.abspath(out_path):
            os.remove(f)

    return {
        "skipped": False,
        "partition": partition_dir,
        "files_before": len(files),
        "files_after": 1,
        "rows": merged.num_rows,
        "bytes_after": os.path.getsize(out_path),
        "output": out_path,
    }


def compact_strategy(strategy, run_id="compact"):
    results = []
    for partition_dir in _list_partitions(strategy):
        result = compact_partition(partition_dir, run_id)
        results.append(result)
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--strategy", required=True, choices=["unpartitioned", "monthly", "daily", "all"])
    parser.add_argument("--analyze", action="store_true")
    parser.add_argument("--run-id", default="compact")
    args = parser.parse_args()

    targets = ["unpartitioned", "monthly", "daily"] if args.strategy == "all" else [args.strategy]

    if args.analyze:
        report = {}
        for s in targets:
            report[s] = analyze_files(s)
        print(json.dumps(report))
        return

    results = {}
    for s in targets:
        results[s] = compact_strategy(s, run_id=args.run_id)
    print(json.dumps(results))


if __name__ == "__main__":
    main()
