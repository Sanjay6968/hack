import json
import pandas as pd
from engine import db

VALID_EVENT_TYPES = {"page_view", "add_to_cart", "purchase", "search", "logout"}
VALID_USER_POOL = {f"U{i:04d}" for i in range(1, 201)}
REQUIRED_COLUMNS = {"event_id", "user_id", "event_type", "event_timestamp", "amount", "source_file"}


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

        if str(row.get("user_id", "")) not in VALID_USER_POOL:
            reasons.append("invalid_user_id")

        try:
            amt = float(row.get("amount", 0))
            if str(row.get("event_type", "")) == "purchase" and amt < 0:
                reasons.append("negative_purchase_amount")
        except (ValueError, TypeError):
            reasons.append("non_numeric_amount")

        try:
            pd.Timestamp(row.get("event_timestamp", ""), tz="UTC")
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
