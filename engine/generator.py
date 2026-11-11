import sys
import uuid
import argparse
import json
import numpy as np
import pandas as pd

VALID_EVENT_TYPES = ["page_view", "add_to_cart", "purchase", "search", "logout"]
VALID_USER_POOL = [f"U{i:04d}" for i in range(1, 201)]


def generate(n_rows: int = 1000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    n_clean = n_rows
    timestamps = pd.to_datetime(
        rng.integers(
            pd.Timestamp("2024-01-01", tz="UTC").value,
            pd.Timestamp("2024-12-31", tz="UTC").value,
            size=n_clean,
        ),
        utc=True,
    )

    df = pd.DataFrame(
        {
            "event_id": [
                str(uuid.UUID(bytes=rng.bytes(16)))
                for _ in range(n_clean)
            ],
            "user_id": rng.choice(VALID_USER_POOL, size=n_clean),
            "event_type": rng.choice(VALID_EVENT_TYPES, size=n_clean),
            "event_timestamp": timestamps,
            "amount": np.where(
                rng.random(n_clean) < 0.3,
                rng.uniform(0.01, 999.99, size=n_clean).round(2),
                0.0,
            ),
            "source_file": "synthetic",
        }
    )

    defects = _build_defects(rng, df)
    combined = pd.concat([df, defects], ignore_index=True)
    combined = combined.sample(frac=1, random_state=seed).reset_index(drop=True)
    return combined


def _build_defects(rng, base_df: pd.DataFrame) -> pd.DataFrame:
    rows = []

    exact_dup = base_df.iloc[0].copy()
    rows.append(exact_dup.to_dict())

    conflict_dup = base_df.iloc[1].copy().to_dict()
    conflict_dup["amount"] = round(conflict_dup["amount"] + 50.0, 2)
    rows.append(conflict_dup)

    null_row = {
        "event_id": None,
        "user_id": "U0001",
        "event_type": "purchase",
        "event_timestamp": pd.Timestamp("2024-06-15 12:00:00", tz="UTC"),
        "amount": 10.0,
        "source_file": "synthetic",
    }
    rows.append(null_row)

    def _uid():
        return str(uuid.UUID(bytes=rng.bytes(16)))

    bad_type_row = {
        "event_id": _uid(),
        "user_id": "U0001",
        "event_type": "INVALID_TYPE",
        "event_timestamp": pd.Timestamp("2024-06-15 12:00:00", tz="UTC"),
        "amount": 10.0,
        "source_file": "synthetic",
    }
    rows.append(bad_type_row)

    bad_user_row = {
        "event_id": _uid(),
        "user_id": "U9999",
        "event_type": "purchase",
        "event_timestamp": pd.Timestamp("2024-06-15 12:00:00", tz="UTC"),
        "amount": 10.0,
        "source_file": "synthetic",
    }
    rows.append(bad_user_row)

    neg_amount_row = {
        "event_id": _uid(),
        "user_id": "U0001",
        "event_type": "purchase",
        "event_timestamp": pd.Timestamp("2024-06-15 12:00:00", tz="UTC"),
        "amount": -5.0,
        "source_file": "synthetic",
    }
    rows.append(neg_amount_row)

    tz_boundary_row = {
        "event_id": _uid(),
        "user_id": "U0002",
        "event_type": "search",
        "event_timestamp": pd.Timestamp("2024-01-01 00:00:00", tz="UTC"),
        "amount": 0.0,
        "source_file": "synthetic",
    }
    rows.append(tz_boundary_row)

    late_row = {
        "event_id": _uid(),
        "user_id": "U0003",
        "event_type": "purchase",
        "event_timestamp": pd.Timestamp("2023-11-01 10:00:00", tz="UTC"),
        "amount": 99.99,
        "source_file": "synthetic",
    }
    rows.append(late_row)

    drift_row = {
        "event_id": _uid(),
        "user_id": "U0004",
        "event_type": "page_view",
        "event_timestamp": pd.Timestamp("2024-03-10 08:00:00", tz="UTC"),
        "amount": 0.0,
        "source_file": "synthetic",
        "extra_column": "drift",
    }
    rows.append(drift_row)

    result = pd.DataFrame(rows)
    for col in base_df.columns:
        if col not in result.columns:
            result[col] = None
    all_cols = list(base_df.columns) + [c for c in result.columns if c not in base_df.columns]
    return result[all_cols]


def _summary(df: pd.DataFrame) -> dict:
    return {
        "total_rows": len(df),
        "columns": list(df.columns),
        "null_event_id_count": int(df["event_id"].isna().sum()),
        "invalid_event_types": int((~df["event_type"].isin(VALID_EVENT_TYPES)).sum()),
        "date_range": {
            "min": str(df["event_timestamp"].min()),
            "max": str(df["event_timestamp"].max()),
        },
        "event_type_counts": df["event_type"].value_counts().to_dict(),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=str, default=None)
    parser.add_argument("--summary", action="store_true")
    args = parser.parse_args()

    df = generate(n_rows=args.rows, seed=args.seed)

    if args.summary:
        print(json.dumps(_summary(df), indent=2))
        return

    if args.out:
        df.to_csv(args.out, index=False)
        print(json.dumps({"status": "ok", "path": args.out, "rows": len(df)}))
    else:
        print(df.to_csv(index=False))


if __name__ == "__main__":
    main()
