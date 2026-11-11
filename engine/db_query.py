import sys
import os
import json
import argparse

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from engine import db


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", required=True, choices=["runs", "run_detail", "benchmarks", "truncate_benchmarks", "data_quality", "file_health"])
    parser.add_argument("--id", default=None)
    args = parser.parse_args()

    db.init_db()

    if args.query == "runs":
        print(json.dumps(db.get_runs()))
    elif args.query == "run_detail":
        if not args.id:
            print(json.dumps({"error": "id required"}))
            sys.exit(1)
        print(json.dumps(db.get_run_detail(args.id)))
    elif args.query == "benchmarks":
        print(json.dumps(db.get_benchmarks_all()))
    elif args.query == "truncate_benchmarks":
        db.truncate_benchmarks()
        print(json.dumps({"status": "ok", "message": "benchmarks truncated"}))
    elif args.query == "data_quality":
        print(json.dumps(db.get_data_quality(args.id)))
    elif args.query == "file_health":
        from engine import compaction
        print(json.dumps(compaction.get_file_health()))


if __name__ == "__main__":
    main()
