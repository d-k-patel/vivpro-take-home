"""
Reads data/songs_part1.json and data/songs_part2.json (column-oriented,
messy, two exports of the same catalog) and produces one clean,
row-oriented dataset at data/songs.json.

Decisions are explained in DECISIONS.md. Summary:
  - Dedup key is Spotify `id`, not title (titles collide legitimately).
  - On conflict between the two sources, part2 wins (newer export, superset
    of columns) but the discarded value is kept in `_conflicts` for audit.
  - Missing/malformed/out-of-range values are coerced where safe, else set
    to null and named in `_flags` -- never silently dropped.
  - duration_ms values under 10,000 are actually seconds (unit bug); they
    are multiplied by 1000 and flagged.
  - `valence` (part2-only) is kept, null for rows that only ever appeared
    in part1.
"""
import json
import os
from pathlib import Path

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
NUMERIC_COLS = [
    "danceability", "energy", "acousticness", "tempo",
    "duration_ms", "num_sections", "num_segments", "valence",
]
RANGE_0_1 = {"danceability", "energy", "acousticness", "mood", "valence"}


def load_columnar(path):
    raw = json.load(open(path))
    row_ids = set()
    for col in raw.values():
        row_ids.update(col.keys())
    rows = []
    for k in sorted(row_ids, key=int):
        row = {col: raw[col].get(k) for col in raw}
        rows.append(row)
    return rows


def coerce_float(v, flags, field):
    if v is None:
        flags.append(f"{field}_missing")
        return None
    if isinstance(v, str):
        s = v.strip()
        if s.upper() in ("N/A", "NA", ""):
            flags.append(f"{field}_missing")
            return None
        try:
            v = float(s)
            flags.append(f"{field}_coerced_from_string")
        except ValueError:
            flags.append(f"{field}_unparseable")
            return None
    return float(v)


def clean_row(row, has_valence):
    flags = []
    out = {"id": row.get("id"), "title_raw": row.get("title")}
    out["title"] = " ".join((row.get("title") or "").strip().split())
    if out["title"] != out["title_raw"]:
        flags.append("title_whitespace_normalized")

    for field in NUMERIC_COLS:
        if field == "valence" and not has_valence:
            out[field] = None  # column doesn't exist in this source, not a data defect
            continue
        val = coerce_float(row.get(field), flags, field)
        if val is not None and field in RANGE_0_1 and not (0 <= val <= 1):
            flags.append(f"{field}_out_of_range:{val}")
            val = max(0.0, min(1.0, val))
        if val is not None and field == "tempo" and val <= 0:
            flags.append(f"tempo_invalid:{val}")
            val = None
        if val is not None and field == "duration_ms" and val < 10_000:
            flags.append(f"duration_ms_unit_fixed_seconds_to_ms:{val}")
            val = val * 1000
        out[field] = val

    mood = row.get("mood")
    out["mood"] = int(mood) if mood is not None else None

    out["_flags"] = flags
    return out


def merge(rows1, rows2):
    by_id = {}
    conflicts = {}
    for row in rows1:
        by_id[row["id"]] = clean_row(row, has_valence=False)

    for row in rows2:
        cleaned = clean_row(row, has_valence=True)
        rid = cleaned["id"]
        if rid in by_id:
            existing = by_id[rid]
            row_conflicts = {}
            for field in NUMERIC_COLS + ["title"]:
                a, b = existing.get(field), cleaned.get(field)
                if a != b and a is not None and b is not None:
                    row_conflicts[field] = {"part1": a, "part2": b, "kept": "part2"}
            if row_conflicts:
                conflicts[rid] = row_conflicts
            # part2 wins: overlay its non-null fields onto existing
            for field in NUMERIC_COLS + ["title", "title_raw"]:
                if cleaned.get(field) is not None:
                    existing[field] = cleaned[field]
            existing["_flags"] = sorted(set(existing["_flags"] + cleaned["_flags"]))
            existing["_sources"] = ["part1", "part2"]
        else:
            cleaned["_sources"] = ["part2"]
            by_id[rid] = cleaned

    for row in by_id.values():
        row.setdefault("_sources", ["part1"])
        row.setdefault("valence", None)

    return list(by_id.values()), conflicts


def main():
    rows1 = load_columnar(DATA_DIR / "songs_part1.json")
    rows2 = load_columnar(DATA_DIR / "songs_part2.json")
    merged, conflicts = merge(rows1, rows2)

    for i, row in enumerate(sorted(merged, key=lambda r: r["id"])):
        row["index"] = i

    out_path = DATA_DIR / "songs.json"
    out_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False))

    conflicts_path = DATA_DIR / "conflicts.json"
    conflicts_path.write_text(json.dumps(conflicts, indent=2, ensure_ascii=False))

    print(f"Wrote {len(merged)} rows to {out_path}")
    print(f"Wrote {len(conflicts)} conflicts to {conflicts_path}")
    flagged = [r for r in merged if r["_flags"]]
    print(f"{len(flagged)} rows have at least one flag")


if __name__ == "__main__":
    main()
