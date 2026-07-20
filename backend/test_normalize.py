from normalize import clean_row, merge


def test_coerces_numeric_strings():
    row = clean_row({"id": "x", "title": "T", "danceability": "0.5", "tempo": "120"}, has_valence=False)
    assert row["danceability"] == 0.5
    assert row["tempo"] == 120.0
    assert "danceability_coerced_from_string" in row["_flags"]


def test_na_sentinel_becomes_null_and_flagged():
    row = clean_row({"id": "x", "title": "T", "energy": "N/A"}, has_valence=False)
    assert row["energy"] is None
    assert "energy_missing" in row["_flags"]


def test_out_of_range_is_clamped_and_flagged():
    row = clean_row({"id": "x", "title": "T", "danceability": 1.42}, has_valence=False)
    assert row["danceability"] == 1.0
    assert any(f.startswith("danceability_out_of_range") for f in row["_flags"])


def test_tempo_zero_is_invalid():
    row = clean_row({"id": "x", "title": "T", "tempo": 0}, has_valence=False)
    assert row["tempo"] is None
    assert any(f.startswith("tempo_invalid") for f in row["_flags"])


def test_duration_seconds_unit_bug_fixed():
    row = clean_row({"id": "x", "title": "T", "duration_ms": 158}, has_valence=False)
    assert row["duration_ms"] == 158000
    assert any("unit_fixed" in f for f in row["_flags"])


def test_title_whitespace_normalized():
    row = clean_row({"id": "x", "title": " 4 walls  "}, has_valence=False)
    assert row["title"] == "4 walls"


def test_valence_absent_column_not_flagged_missing():
    row = clean_row({"id": "x", "title": "T"}, has_valence=False)
    assert row["valence"] is None
    assert not any("valence" in f for f in row["_flags"])


def test_merge_dedups_by_id_and_prefers_part2_on_conflict():
    rows1 = [{"id": "A", "title": "Song", "danceability": 0.1}]
    rows2 = [{"id": "A", "title": "Song", "danceability": 0.9}]
    merged, conflicts = merge(rows1, rows2)
    assert len(merged) == 1
    assert merged[0]["danceability"] == 0.9
    assert "A" in conflicts
    assert conflicts["A"]["danceability"]["part1"] == 0.1
    assert conflicts["A"]["danceability"]["kept"] == "part2"


def test_merge_keeps_non_overlapping_rows_from_both():
    rows1 = [{"id": "A", "title": "Song1"}]
    rows2 = [{"id": "B", "title": "Song2"}]
    merged, _ = merge(rows1, rows2)
    assert {r["id"] for r in merged} == {"A", "B"}
