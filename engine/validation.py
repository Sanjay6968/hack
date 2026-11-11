import os
import math
import json
import pandas as pd
from engine import db

VALID_EVENT_TYPES = {"page_view", "add_to_cart", "purchase", "search", "logout"}
REQUIRED_COLUMNS = {"event_id", "user_id", "event_type", "event_timestamp", "amount", "source_file"}


def _load_user_pool():
    csv_path = os.path.join(os.path.dirname(__file__), "..", "data", "users.csv")
    if os.path.exists(csv_path):
        try:
            udf = pd.read_csv(csv_path)
            if "user_id" in udf.columns:
                return set(udf["user_id"].dropna().astype(str))
        except Exception:
            pass
    return {f"U{i:04d}" for i in range(1, 201)}


VALID_USER_POOL = _load_user_pool()


def check_schema(df):
    missing = REQUIRED_COLUMNS - set(df.columns)
    return missing


def validate_and_split(df, run_id):
    rejected_rows = []

    def reject(row, reason):
        rejected_rows.append((row, reason))

    keep_mask = []
    for _, row in df.iterrows():
        reasons = []

        if pd.isna(row.get("event_id")) or str(row.get("event_id", "")).strip() == "":
            reasons.append("null_event_id")

        if str(row.get("event_type", "")) not in VALID_EVENT_TYPES:
            reasons.append("invalid_event_type")

        uid = row.get("user_id")
        if pd.isna(uid) or str(uid).strip() == "":
            reasons.append("null_user_id")
        elif str(uid) not in VALID_USER_POOL:
            reasons.append("invalid_user_id")

        amt_val = row.get("amount")
        if pd.isna(amt_val) or amt_val is None or str(amt_val).strip() == "":
            reasons.append("missing_amount")
        else:
            try:
                amt = float(amt_val)
                if not math.isfinite(amt):
                    reasons.append("non_finite_amount")
                elif str(row.get("event_type", "")) == "purchase" and amt < 0:
                    reasons.append("negative_purchase_amount")
            except (ValueError, TypeError):
                reasons.append("non_numeric_amount")

        ts_val = row.get("event_timestamp")
        if pd.isna(ts_val) or ts_val is None or str(ts_val).strip() == "":
            reasons.append("null_timestamp")
        else:
            try:
                pd.Timestamp(ts_val, tz="UTC")
            except Exception:
                reasons.append("invalid_timestamp")

        if reasons:
            reject(row, "|".join(reasons))
            keep_mask.append(False)
        else:
            keep_mask.append(True)

    good = df[keep_mask].copy()

    for row, reason in rejected_rows:
        db.insert_rejected(
            run_id=run_id,
            event_id=str(row.get("event_id", "")),
            reject_reason=reason,
            raw_data=json.dumps(row.to_dict()),
        )

    return good, len(rejected_rows)


def resolve_duplicates(df):
    exact_dup_count = len(df) - len(df.drop_duplicates())
    df = df.drop_duplicates().reset_index(drop=True)

    id_counts = df["event_id"].value_counts()
    conflict_ids = set(id_counts[id_counts > 1].index)

    if not conflict_ids:
        return df, exact_dup_count, pd.DataFrame(columns=df.columns)

    conflicts = df[df["event_id"].isin(conflict_ids)].copy()
    non_conflicts = df[~df["event_id"].isin(conflict_ids)].copy()

    kept = conflicts.sort_values("amount").groupby("event_id", sort=False).first().reset_index()
    quarantine_conflicts = conflicts[~conflicts.index.isin(
        conflicts.sort_values("amount").groupby("event_id", sort=False).head(1).index
    )]

    final = pd.concat([non_conflicts, kept], ignore_index=True)
    return final, exact_dup_count, quarantine_conflicts
