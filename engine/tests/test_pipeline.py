import os
import sys
import pandas as pd
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from engine.generator import generate, VALID_EVENT_TYPES, VALID_USER_POOL
from engine.pipeline import (
    load_csv, check_schema, validate_and_split, resolve_duplicates,
    enrich, write_strategies, run_pipeline,
)
import engine.db as db


def _write_csv(df, path):
    df.to_csv(path, index=False)
    return path


def _check_reconciliation(result):
    r = result["reconciliation"]
    assert r["check"] is True, (
        f"Reconciliation failed: {r['total_input']} != "
        f"{r['accepted_unique']} + {r['exact_duplicates']} + {r['rejected']}"
    )


class TestGenerator:
    def test_reproducible(self):
        df1 = generate(100, 42)
        df2 = generate(100, 42)
        assert df1["event_id"].equals(df2["event_id"])

    def test_different_seed_differs(self):
        df1 = generate(100, 42)
        df2 = generate(100, 99)
        assert not df1["event_id"].equals(df2["event_id"])

    def test_total_rows(self):
        df = generate(100, 42)
        assert len(df) == 109

    def test_has_null_event_id(self):
        df = generate(100, 42)
        assert df["event_id"].isna().sum() == 1

    def test_has_invalid_event_type(self):
        df = generate(100, 42)
        assert (~df["event_type"].isin(VALID_EVENT_TYPES)).sum() == 1

    def test_has_late_arriving_event(self):
        df = generate(100, 42)
        min_ts = pd.to_datetime(df["event_timestamp"], format="mixed", utc=True).min()
        assert min_ts < pd.Timestamp("2024-01-01", tz="UTC")


class TestPipeline:
    def test_happy_path(self, patch_paths):
        df = generate(200, 42)
        csv_path = str(patch_paths / "data" / "raw" / "test.csv")
        _write_csv(df, csv_path)
        result = run_pipeline(csv_path, run_id="test-happy")
        assert result["status"] == "done"
        _check_reconciliation(result)

    def test_empty_input(self, patch_paths):
        csv_path = str(patch_paths / "data" / "raw" / "empty.csv")
        pd.DataFrame(columns=["event_id","user_id","event_type","event_timestamp","amount","source_file"]).to_csv(csv_path, index=False)
        result = run_pipeline(csv_path, run_id="test-empty")
        assert result["status"] == "done"
        assert result["reconciliation"]["total_input"] == 0
        assert result["reconciliation"]["check"] is True

    def test_missing_column_fails(self, patch_paths):
        csv_path = str(patch_paths / "data" / "raw" / "bad_schema.csv")
        pd.DataFrame({"event_id": ["x"], "user_id": ["U0001"]}).to_csv(csv_path, index=False)
        result = run_pipeline(csv_path, run_id="test-schema-fail")
        assert result["status"] == "failed"
        assert "Missing required columns" in result["error"]

    def test_schema_drift_ignored(self, patch_paths):
        df = generate(50, 42)
        df["extra_col"] = "drift_value"
        csv_path = str(patch_paths / "data" / "raw" / "drift.csv")
        _write_csv(df, csv_path)
        result = run_pipeline(csv_path, run_id="test-drift")
        assert result["status"] == "done"
        assert "extra_col" in result["steps"]["load"]["drift_columns"]
        _check_reconciliation(result)

    def test_all_null_event_ids_rejected(self, patch_paths):
        df = pd.DataFrame({
            "event_id": [None, None, None],
            "user_id": ["U0001", "U0002", "U0003"],
            "event_type": ["purchase", "search", "logout"],
            "event_timestamp": ["2024-06-15 12:00:00+00:00"] * 3,
            "amount": [10.0, 0.0, 0.0],
            "source_file": ["test"] * 3,
        })
        csv_path = str(patch_paths / "data" / "raw" / "null_ids.csv")
        _write_csv(df, csv_path)
        result = run_pipeline(csv_path, run_id="test-nullids")
        assert result["status"] == "done"
        assert result["reconciliation"]["accepted_unique"] == 0
        _check_reconciliation(result)

    def test_exact_duplicates_dropped(self, patch_paths):
        row = {
            "event_id": "aaa",
            "user_id": "U0001",
            "event_type": "search",
            "event_timestamp": "2024-06-15 12:00:00+00:00",
            "amount": 0.0,
            "source_file": "test",
        }
        df = pd.DataFrame([row, row, row])
        csv_path = str(patch_paths / "data" / "raw" / "exact_dups.csv")
        _write_csv(df, csv_path)
        result = run_pipeline(csv_path, run_id="test-exactdup")
        assert result["status"] == "done"
        assert result["reconciliation"]["accepted_unique"] == 1
        assert result["reconciliation"]["exact_duplicates"] == 2
        _check_reconciliation(result)

    def test_conflicting_duplicate_keeps_lowest_amount(self, patch_paths):
        rows = [
            {"event_id": "bbb", "user_id": "U0001", "event_type": "purchase",
             "event_timestamp": "2024-06-15 12:00:00+00:00", "amount": 100.0, "source_file": "test"},
            {"event_id": "bbb", "user_id": "U0001", "event_type": "purchase",
             "event_timestamp": "2024-06-15 12:00:00+00:00", "amount": 10.0, "source_file": "test"},
        ]
        df = pd.DataFrame(rows)
        csv_path = str(patch_paths / "data" / "raw" / "conflict_dup.csv")
        _write_csv(df, csv_path)
        result = run_pipeline(csv_path, run_id="test-conflict")
        assert result["status"] == "done"
        assert result["reconciliation"]["accepted_unique"] == 1
        _check_reconciliation(result)

    def test_invalid_event_type_rejected(self, patch_paths):
        df = pd.DataFrame([{
            "event_id": "ccc", "user_id": "U0001", "event_type": "HACK",
            "event_timestamp": "2024-06-15 12:00:00+00:00", "amount": 0.0, "source_file": "test",
        }])
        csv_path = str(patch_paths / "data" / "raw" / "bad_type.csv")
        _write_csv(df, csv_path)
        result = run_pipeline(csv_path, run_id="test-badtype")
        assert result["reconciliation"]["rejected"] == 1
        _check_reconciliation(result)

    def test_invalid_user_id_rejected(self, patch_paths):
        df = pd.DataFrame([{
            "event_id": "ddd", "user_id": "U9999", "event_type": "search",
            "event_timestamp": "2024-06-15 12:00:00+00:00", "amount": 0.0, "source_file": "test",
        }])
        csv_path = str(patch_paths / "data" / "raw" / "bad_user.csv")
        _write_csv(df, csv_path)
        result = run_pipeline(csv_path, run_id="test-baduser")
        assert result["reconciliation"]["rejected"] == 1
        _check_reconciliation(result)

    def test_negative_purchase_amount_rejected(self, patch_paths):
        df = pd.DataFrame([{
            "event_id": "eee", "user_id": "U0001", "event_type": "purchase",
            "event_timestamp": "2024-06-15 12:00:00+00:00", "amount": -1.0, "source_file": "test",
        }])
        csv_path = str(patch_paths / "data" / "raw" / "neg_amount.csv")
        _write_csv(df, csv_path)
        result = run_pipeline(csv_path, run_id="test-negamt")
        assert result["reconciliation"]["rejected"] == 1
        _check_reconciliation(result)

    def test_timezone_boundary_accepted(self, patch_paths):
        df = pd.DataFrame([{
            "event_id": "fff", "user_id": "U0001", "event_type": "search",
            "event_timestamp": "2024-01-01 00:00:00+00:00", "amount": 0.0, "source_file": "test",
        }])
        csv_path = str(patch_paths / "data" / "raw" / "tz_boundary.csv")
        _write_csv(df, csv_path)
        result = run_pipeline(csv_path, run_id="test-tzboundary")
        assert result["reconciliation"]["accepted_unique"] == 1
        _check_reconciliation(result)

    def test_late_arriving_event_accepted_in_own_partition(self, patch_paths):
        df = pd.DataFrame([{
            "event_id": "ggg", "user_id": "U0001", "event_type": "purchase",
            "event_timestamp": "2023-11-01 10:00:00+00:00", "amount": 99.99, "source_file": "test",
        }])
        csv_path = str(patch_paths / "data" / "raw" / "late.csv")
        _write_csv(df, csv_path)
        result = run_pipeline(csv_path, run_id="test-late")
        assert result["status"] == "done"
        assert result["reconciliation"]["accepted_unique"] == 1
        lake = patch_paths / "data" / "lake" / "monthly"
        partitions = list(lake.iterdir())
        assert any("2023-11" in p.name for p in partitions)
        _check_reconciliation(result)

    def test_idempotent_rerun(self, patch_paths):
        df = generate(50, 42)
        csv_path = str(patch_paths / "data" / "raw" / "idem.csv")
        _write_csv(df, csv_path)
        r1 = run_pipeline(csv_path, run_id="test-idem-01")
        r2 = run_pipeline(csv_path, run_id="test-idem-02")
        assert r1["reconciliation"]["accepted_unique"] == r2["reconciliation"]["accepted_unique"]
        assert r1["status"] == r2["status"] == "done"

    def test_parquet_files_written_all_strategies(self, patch_paths):
        df = generate(50, 42)
        csv_path = str(patch_paths / "data" / "raw" / "strats.csv")
        _write_csv(df, csv_path)
        result = run_pipeline(csv_path, run_id="test-strats")
        assert result["steps"]["write"]["unpartitioned"] >= 1
        assert result["steps"]["write"]["monthly"] >= 1
        assert result["steps"]["write"]["daily"] >= 1

    def test_partial_failure_status_recorded(self, patch_paths, monkeypatch):
        import engine.pipeline as pl
        monkeypatch.setattr(pl, "write_strategies", lambda df, run_id: (_ for _ in ()).throw(RuntimeError("disk full")))
        df = generate(50, 42)
        csv_path = str(patch_paths / "data" / "raw" / "fail.csv")
        _write_csv(df, csv_path)
        result = run_pipeline(csv_path, run_id="test-fail")
        assert result["status"] == "failed"
        runs = db.get_runs()
        failed = [r for r in runs if r["run_id"] == "test-fail"]
        assert failed[0]["status"] == "failed"
