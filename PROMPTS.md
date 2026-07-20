# PROMPTS.md — AI collaboration log

Tool: Claude Code (Sonnet 5), agentic CLI with file read/write/bash
access. I drove this session directly — there was no separate "junior
engineer" persona; I am the candidate, using the AI as my coding tool
for this exercise exactly as the take-home invites.

**This file is a themed summary. `SESSION_LOG.md` is the primary
source** — the actual prompts, in order, with what happened after
each one, including two places I was directly corrected mid-session
and changed course. Read that one if you want the ground truth instead
of my after-the-fact narrative; this file organizes the same material
by theme (steering moments, where AI got it right/wrong) for faster
scanning.

## Session shape

1. Read the take-home materials (`mail.md`, `TAKE_HOME.pdf`, both
   zips, both data files) before writing anything, per the brief's
   explicit instruction.
2. Confirmed scope with a direct question rather than assuming: asked
   which role scope to build for (full-stack / backend / frontend /
   lead) since it changes what "done" means. Chose full-stack.
3. Explored the data programmatically before designing the schema —
   ran Python one-liners to check column presence, overlapping ids,
   type distributions, and range violations across both files, rather
   than eyeballing the JSON and guessing.
4. Wrote `normalize.py`, ran it, inspected the flag output.
5. Wrote and ran `test_normalize.py`.
6. Wrote `main.py` (API), `test_main.py`, ran both, smoke-tested with
   curl.
7. Scaffolded the frontend with Vite, wrote the dashboard, and
   actually opened it in a browser (Playwright) to click through
   sorting, rating, and search rather than trusting it compiled.
8. Reviewed `review/buggy_api.py` by hand, then asked the AI for an
   independent read and compared.
9. Wrote the four markdown deliverables.

## Turning points — where steering mattered

**Caught a self-introduced data bug by checking the output, not the
code.** After writing the first version of `normalize.py`, I ran it and
printed which rows had `_flags`. 20 of 25 rows were flagged — too high
to be plausible for "real" defects. Tracing it back: every part1-only
row was getting `valence_missing` because I was running the missing-value
check on a column that structurally doesn't exist in `songs_part1.json`
at all. That's a different thing from "the pipeline dropped a value it
should have had." I fixed `clean_row` to take a `has_valence` flag per
source file, so absence-by-schema and absence-by-defect stop being
conflated. This was me catching my own AI-assisted output being wrong,
not the AI catching itself — worth being honest about, since the take
-home asks specifically where I had to override results that looked
fine but weren't.

**Decided not to impute missing values.** The obvious "smart" move for
`acousticness: null` or `energy: "N/A"` is mean/median imputation. I
explicitly did not do this — flagged-and-null instead — because I have
no evidence the missingness is random (MCAR), and silently inventing an
audio feature that a downstream dashboard or model would then trust as
real data is worse than an honest gap. This was a deliberate call
against the "obviously fancier" option, not a limitation I ran out of
time for.

**Overruled the instinct to drop out-of-range rows entirely.**
`danceability=1.42` and `acousticness=-0.05` are impossible values on a
[0,1] scale. My first instinct was to drop those rows since they're
"clearly bad data." I reconsidered because everything *else* about
those two rows (21 Guns, Another Brick) looked normal — single-field
typos on otherwise-good rows, not corrupted records. Clamped to the
boundary and flagged instead, so the row survives and the anomaly is
visible rather than silently deleted.

**Sort-then-paginate order — found by tracing execution, not by pattern
-matching.** When reviewing `buggy_api.py`, I asked an AI assistant to
review the same file independently before finalizing REVIEW.md. It
correctly caught the off-by-one pagination bug, the `{"error": ...}`
-instead-of-404 pattern, and the unvalidated `stars` input — all
recognizable FastAPI anti-patterns. It did **not** independently catch
that slicing happens before sorting in `get_songs` (so `sort_by` only
reorders within a page, never across the dataset) — on its first pass
it described that code as "reasonable if the client re-sorts globally,"
which rationalizes the bug rather than flags it. I only found this by
manually tracing `start`/`end` against a concrete `page=2, sort_by=tempo`
call and comparing to what full-dataset-sort-then-slice would produce.
When I described the trace, the AI agreed immediately — but it needed
the trace, it didn't generate it. This is documented in full in
`REVIEW.md`'s closing section, since the take-home explicitly asks for
a note on where AI "misses something or cries wolf."

**Chose id over title as the rating/lookup key without being told to.**
The take-home only asks "let a user rate a song" — it doesn't specify
whether ratings key on title or id. Given that the dataset itself has
two different songs both titled "Perfect," keying anything by title
was a decision I made deliberately (and documented in DECISIONS.md),
not a default the AI proposed unprompted. First-draft scaffolding
tends to reach for `/songs/{title}` as the natural REST shape; I
overrode that specifically because I'd already found the duplicate-
title case during data exploration in step 3, before writing the API
at all.

**Declined to fetch the full dataset for the chart.** The frontend's
chart currently plots only the visible page, and I called this out as
the weakest part of the submission in REFLECTION.md rather than quietly
building a second "fetch everything" code path that the spec didn't
ask for. A tempting AI-generated "while we're at it" addition would
have been an unrequested `/songs/all` endpoint; I left it out and
named the trade-off instead.

**Got direct pushback on shallow Tailwind work and redid it properly.**
After being asked to add Tailwind, my first pass was a mechanical
class-for-class port of the existing plain CSS — same look, different
syntax, no actual design improvement. Told directly: "the whole
purpose of adding tailwind css was to enhance the styling." That's a
fair correction, not a style nitpick — I'd technically satisfied the
literal ask while missing its intent. Redid it as a real visual pass
(card sections, accent color, zebra rows, button hierarchy) rather
than defending the first attempt.

**A scrollbar bug took three attempts because I trusted a screenshot
over a measurement the first two times.** Asked to fix a clipped
Rating column, then later a persistent horizontal scrollbar. The first
fix (sticky column) was correct for the clipping. The scrollbar
recurred after further styling changes; my first two fix attempts
(`overflow-y-hidden`, then a `max-width` + `truncate` span) looked
plausible and I moved on each time without verifying — the actual fix
required realizing that individual-cell CSS doesn't constrain a
column's width under table-auto layout, only `table-fixed` with
explicit `<colgroup>` widths does. I only caught that my first two
"fixes" hadn't worked by writing a small script to measure
`scrollWidth` vs `clientWidth` directly in the browser instead of
eyeballing a screenshot — the second attempt looked fine in a
screenshot at one viewport width and was still broken. Lesson I'd
flag to a reviewer: I under-verified twice in a row here before
switching to a measurement-based check, which is exactly the kind of
AI-assisted "looks right, isn't" failure mode this section is supposed
to surface.

**An independent Opus-4.8 audit caught a fabricated detail in
DECISIONS.md.** I asked for an adversarial, independent audit of the
whole submission against the take-home's actual rubric. It found that
DECISIONS.md justified preferring `songs_part2.json` on conflict partly
by citing "a later timestamp in the file metadata" — I checked, and
neither JSON file has any metadata at all, only data columns. That
detail was invented; the underlying decision (part2 wins) still stands
on the other, real justification (part2's superset of columns), but
the fabricated clause was a genuine problem I would not have caught
without an adversarial second pass, and I would not have caught it by
re-reading my own write-up more carefully — it read as confident and
plausible. Fixed in DECISIONS.md; the corrected version is explicit
that "part2 is newer" is an inferred assumption, not something the
data can prove.

## Where the AI got it right the first time

- FastAPI/Pydantic boilerplate (route decorators, `Query` validators,
  `HTTPException` usage) — correct on the first pass, no back-and-forth
  needed.
- React table/pagination/sort wiring and the CSV-blob-download pattern
  — standard, low-risk, no review overhead beyond a read-through.
- pytest fixture setup for isolating test data from the real
  `data/songs.json` via `monkeypatch` — right the first time and saved
  real time versus hand-writing fixture scaffolding.

## Where I chose not to do what the AI suggested

- Declined mean-imputation for missing numeric fields (see above).
- Declined to drop out-of-range rows outright (see above).
- Declined to key ratings/lookup by title (see above).
- Declined to silently flag part1-only rows as missing `valence`.
