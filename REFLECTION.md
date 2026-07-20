# Reflection

## 1. What's the single weakest part of your submission, and why did you leave it that way?

The frontend's chart only plots the *current page* of results, not the
full dataset. I noted this in the UI copy rather than fixing it, because
fixing it properly means either (a) a dedicated `/songs/all` endpoint
that bypasses pagination, or (b) fetching every page client-side and
merging — both are reasonable but neither was specified, and the take-home
explicitly says "one chart of your choice," not "a chart of the whole
dataset." I chose to be honest about the limitation in the UI copy rather
than quietly build something that looks more complete than it is.

## 2. Where did AI save you the most time, and where did it cost you time or nearly lead you wrong?

**Saved the most time:** scaffolding — the FastAPI boilerplate, the React
table/pagination/sort wiring, and the pytest fixtures. None of that is
interesting; having it typed out in seconds let me spend the actual time
on the data exploration and the review.

**Nearly led me wrong:** my first pass at the normalization script flagged
every part1-only row as `valence_missing`, because valence is a real
column in part2. That's technically true but misleading — it conflates
"this source never had this column" with "this value was supposed to
exist and doesn't." I caught it by noticing 20 of 25 rows had at least
one flag, which was suspiciously high, and traced it back. The fix was
to pass whether the source file has `valence` at all into the row cleaner,
so absence-by-schema and absence-by-defect are distinguished. See
PROMPTS.md for the actual exchange.

## 3. What in the data surprised you? What did you decide not to fix, and why?

Two things stood out:

- **Two different songs are both titled "Perfect"** in `songs_part2.json`
  (different Spotify ids, different durations: 263.4s vs 264.0s). This
  wasn't a data error to fix — it's real, and it's exactly why the API
  can't key ratings or lookups by title.
- **One field, one song, disagreed between the two files** even though
  the same song appears in both under the same id (`Never Gonna Give You
  Up`, danceability 0.727 vs 0.74). Everything else about that song
  matched exactly across both files, which made the one mismatched field
  read like real pipeline drift rather than random corruption — plausibly
  two different audio-analysis runs producing slightly different
  danceability scores. I picked part2 and documented why in DECISIONS.md,
  but I didn't have enough information to be fully confident that's the
  *correct* choice, only a defensible one.

**What I decided not to fix:** the negative `acousticness` (-0.05) and
the out-of-range `danceability` (1.42) I clamped to the valid boundary
rather than trying to guess the "real" value. A clamp is honest about
what happened (flagged, visible) without pretending to reconstruct data
that isn't recoverable — I don't know if 1.42 was meant to be 0.142 or
was a different bug entirely, so I didn't guess.

## 4. If this went to production Monday and real users hit it, what breaks first?

**Concurrent writes to `ratings.json`.** Two users rating different songs
at the same moment can race: both processes read the file, both write
their own in-memory version back, and one write clobbers the other. At
current traffic (a take-home demo) this never surfaces. At real traffic
it's a silent data-loss bug — a rating that appeared to succeed (200
response) that later isn't there. This is the first thing I'd fix before
any real usage: move ratings into a database with row-level writes
(even SQLite with `INSERT OR REPLACE` beats a hand-rolled JSON file), or
at minimum add a file lock.

Close second: the whole dataset is loaded into memory on every request
(`load_songs()` re-reads `songs.json` from disk each call, with no
caching). Fine at 25 rows, fine at 25,000 rows, not fine much beyond
that without a real query layer.

## 5. (Lead/architect) Production readiness sketch

**Data pipeline:** replace the one-shot `normalize.py` script with a
scheduled/triggered ingestion job that runs the same reconciliation
logic but writes to a versioned table (append-only `raw` layer + a
materialized `clean` view), so a bad upstream export doesn't silently
overwrite last week's good data — you can diff and roll back.
Conflict/flag counts per run should be graphed over time; a sudden spike
in `_flags` on a new export is a signal the upstream pipeline broke, not
something to silently absorb.

**Testing:** current unit tests cover the normalization rules and the
API's non-trivial logic (pagination, full-dataset sort, search
case-insensitivity, rating validation) — that's the right first layer.
Next: integration tests that run the real normalize→serve pipeline
end-to-end against a fixture dataset with known defects, so a change to
one layer that breaks an invariant in another (e.g. an API change that
assumes `duration_ms` is always populated) gets caught before deploy.

**Observability:** structured logging on every write (rating changes,
with old/new value and a timestamp) since that's the one mutable,
user-driven data path. A dashboard on `_flags` distribution per
ingestion run. Error-rate and latency on the search endpoint specifically,
since it's the one doing unindexed scanning and is the first thing that
degrades as the dataset grows.

**Deployment:** containerize backend + frontend separately, database
(Postgres, given the relational shape) behind the API rather than flat
files, migrate `ratings.json` into it as a proper table with a foreign
key to song id and a unique constraint on (song_id, user_id) once there's
a concept of "user."

**Where I'd draw the line for v1:** ship with the current single-file
JSON store but behind a proper lock/queue (not a database migration —
that's v1.1) if the realistic near-term load is low-write, low-concurrency
(an internal tool, a small demo). Move to a real database before v1 only
if there's any realistic path to concurrent writes at launch — guessing
wrong on this trade-off in either direction wastes either engineering
time (over-building for load that never comes) or causes the silent
data-loss bug from question 4 (under-building for load that does).
