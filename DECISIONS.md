# Decisions

## Data reconciliation (Section 1)

**Dedup key: Spotify `id`, not title.**
The two files share 4 songs by `id` (Shape of You, Naïve, God's Plan,
Never Gonna Give You Up). I didn't dedup by title because titles
collide legitimately even within a single file — `songs_part2.json`
has two rows both titled "Perfect" with different ids, different
durations, different audio features. They're different songs. Merging
those by title would have silently deleted a real row.

**Conflict resolution: part2 wins.** Of the 4 overlapping ids, only one
field on one song actually disagreed: `danceability` for "Never Gonna
Give You Up" (0.727 in part1 vs 0.74 in part2). I took part2's value
because part2 carries a superset of columns (`valence`) that part1
doesn't have — the only concrete evidence in the files themselves
about which pipeline is more complete. I want to be precise about what
this is and isn't: it is not based on a file timestamp or any export
metadata — neither JSON file contains any, only the data columns
themselves — so "part2 is newer" is an assumption I'm making from file
naming and column superset, not something the data can actually prove.
I did **not** just silently overwrite and move on — the discarded
value is preserved in `data/conflicts.json` so the decision is
auditable, not just asserted. With more time/context I'd ask the
upstream team which pipeline is authoritative rather than guessing.

**Missing/malformed/out-of-range values — flagged, not dropped.**
Every row that needed a repair keeps a `_flags` list naming exactly
what happened, and the row stays in the dataset. I chose "coerce or
null-and-flag" over "drop the row" because dropping loses a real song
over one bad field, and a downstream consumer can filter on `_flags`
if they need to be strict. Specific rules:
- Numeric-looking strings (`"0.521"`, `"108.73"`) → coerced to float,
  flagged `*_coerced_from_string`. Confident this is safe: same shape,
  same range, just wrong JSON type from a pipeline that stringified
  some columns.
- `null` and the string sentinel `"N/A"` → both treated as "missing,"
  set to `None`, flagged `*_missing`. I did not impute (e.g. mean-fill)
  because I have no evidence the missingness is random — imputing
  audio features invents data a downstream model or dashboard would
  trust as real.
- Out-of-range values (`danceability=1.42`, `acousticness=-0.05`) —
  both fields are documented [0,1] ratios. I clamped to the boundary
  and flagged the original value (`danceability_out_of_range:1.42`)
  rather than dropping the row or nulling the field, on the assumption
  these are single-digit typos/sensor noise on an otherwise-good row.
  A downstream consumer who doesn't trust clamping can see the flag and
  the original value and decide differently.
- `tempo=0` — zero BPM isn't a real tempo (silence isn't "0 BPM", it's
  undefined). Treated as invalid, set to `None`, flagged
  `tempo_invalid:0.0`, not clamped (there's no sane clamp target for a
  tempo of zero).

**Extra column (`valence`, part2-only) — kept, null-filled for
part1-only rows.** It's real data, not an error, so dropping it loses
information. Rows that only ever appeared in part1 get `valence: None`
because the column structurally doesn't exist for them — I explicitly
did **not** flag those as `valence_missing`, since flagging every
part1-only row for a column that source never had would be noise, not
signal. (I did get this wrong on the first pass — my first cut flagged
all 16 part1-only rows as missing valence, which just measured "which
file did this come from" rather than an actual data defect. Caught it
when scanning the flag output and it was 20/25 rows flagged, which was
clearly too high to be meaningful.)

**Unit bug: `duration_ms` in part2.** Three rows (Sunflower, Uptown
Funk, Sweet Child O Mine) have `duration_ms` values of 158, 270, 356 —
songs that are 158ms long don't exist; those are the durations *in
seconds*. Detected by eyeballing: every other duration_ms in the
dataset is 100,000+ (real song lengths in ms), so anything under
10,000 is obviously a unit, not a duration. Fixed by multiplying by
1000 and flagging `duration_ms_unit_fixed_seconds_to_ms`, rather than
dropping — the value is recoverable and the correction is unambiguous
once you spot the pattern.

## API design (Section 2)

- **`GET /songs`** — page/size query params, `sort_by`/`order` applied
  to the *entire* dataset before slicing (the bug in `buggy_api.py`
  sorts after slicing — see REVIEW.md). Nulls always sort last
  regardless of direction, so a null `tempo` doesn't jump to the top
  on `order=desc`.
- **`GET /songs/search?title=...`** — separate from a single-song GET,
  because titles are not unique (two "Perfect" entries in the actual
  dataset) and users won't type exact case/whitespace. Returns a list
  with a `count`, so the frontend can render "no match" vs "N matches"
  distinctly rather than guessing from an empty vs. singleton response.
  Case/whitespace-insensitive substring match, not exact — "shape of
  you" should find "Shape of You" without the user hitting exact
  casing, per the spec's explicit requirement.
- **`GET /songs/{id}`** — id-keyed single lookup for internal use (the
  rating flow needs to resolve a specific song), kept separate from
  the title search endpoint rather than overloading one route for two
  different lookup semantics.
- **`POST /songs/{id}/rating`** — keyed by `id`, not title, for the
  same non-unique-title reason. Rating "Perfect" by title would rate
  an arbitrary one of two different songs. `stars` validated 1–5 via
  Pydantic (`Field(ge=1, le=5)`), returns 422 automatically on bad
  input. Persisted to `data/ratings.json` (not just an in-memory dict)
  so ratings survive a server restart — "persists across requests"
  reads most naturally as surviving the process, not just the
  in-memory lifetime of one run.

**Trade-off accepted:** ratings are stored in a flat JSON file guarded
by nothing — no locking, no transactions. Fine for a single-process
take-home; would race under concurrent writes in production (see
REFLECTION.md, "what breaks first").

## What I deliberately left out

- No database — JSON files are the storage layer end to end. Fine at
  this scale (25 rows), wrong at real scale. Would move to SQLite/Postgres
  first if this needed to survive concurrent writes or grow past a few
  thousand rows.
- No auth/rate-limiting on the rating endpoint — anyone can rate any
  song any number of times. Out of scope for a take-home API but would
  be a blocker for a real public endpoint.
- No retry/backoff on the frontend's fetch calls — a flaky network
  shows a plain error message, no automatic retry.
- Didn't build a `title_clean` denormalized index for search — at 25
  rows a linear scan is instant; I'd add an index only if the dataset
  grew to a size where it mattered (see `ponytail` reasoning: premature
  indexing here would be optimizing a scan that takes microseconds).
