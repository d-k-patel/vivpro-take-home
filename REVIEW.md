# Review: review/buggy_api.py

Reviewed as a PR. Ranked most severe first. I used AI to sanity-check this
list after writing it myself — see the note at the bottom on what it
caught and what it missed.

## 1. [BLOCK] Sort-then-paginate order is backwards — sorting doesn't work

```python
page_items = songs[start:end]                        # slice FIRST
page_items = sorted(page_items, key=..., reverse=...)  # sort only the slice
```

**Impact:** `sort_by`/`order` only reorder the 10 (or `size`) items already
on that page — they never reorder the dataset. `GET /songs?sort_by=tempo`
returns page-1-in-insertion-order, just locally re-shuffled. It looks
correct (returns 200, returns sorted-looking data within the page) which
is exactly why it's dangerous — a demo or a shallow test with `size=len(songs)`
would pass while every paginated call in production is wrong. This is the
specific trap the take-home brief calls out ("sorting across the full set").

**Fix:** sort the full `songs` list first, then slice:
```python
songs = sorted(songs, key=lambda s: s[sort_by], reverse=reverse)
page_items = songs[start:end]
```

## 2. [BLOCK] Off-by-one / wrong pagination math for `page=1`

```python
start = page * size
```

**Impact:** with the default `page=1, size=10`, `start = 10`, so the very
first page skips rows 0–9 and returns rows 10–19. There is no `page=0`
requested by any client sending 1-indexed pages (the obvious convention,
and what the take-home spec implies with "page + size"), so row 0 is
unreachable through the public contract as documented.

**Fix:** `start = (page - 1) * size`.

## 3. [BLOCK] Title lookup returns 200 with a body `{"error": "not found"}` instead of 404

```python
return {"error": "not found"}
```

**Impact:** callers that check `response.ok` (virtually all HTTP clients,
including `fetch`) will treat a missing song as success and try to render
`{"error": "not found"}` as if it were a song object — undefined values
splattered across a UI, or a crash if code assumes `song["danceability"]`
exists. Silent-wrong beats loud-wrong here in the worst way.

**Fix:** `raise HTTPException(404, "Song not found")`.

## 4. [BLOCK] `rate_song` accepts unvalidated `stars` — no range check, no type safety

```python
def rate_song(title: str, stars: int):
    ratings[title] = stars
```

**Impact:** the take-home explicitly asks "think about what happens when
the input is invalid" — this is the invalid-input trap. FastAPI will
coerce a numeric-looking string but nothing stops `stars=-5`, `stars=999`,
or `stars=0` from being written and then rendered as a 5-star widget with
negative stars, or silently accepted as a "rating" that's meaningless. No
`ge`/`le` bounds anywhere in the file.

**Fix:** `stars: int = Body(..., ge=1, le=5)` (or a Pydantic model with
`Field(ge=1, le=5)`), and let FastAPI return a 422 automatically.

## 5. [BLOCK] Ratings keyed by `title`, not song id — silently wrong for duplicate titles, and lookup/rating routes collide by design

```python
@app.get("/songs/{title}")
@app.post("/songs/{title}/rating")
```

**Impact:** the take-home's own data has two different songs both titled
"Perfect" (different Spotify ids, different durations). Rating one
"Perfect" silently applies to *whichever* "Perfect" the linear scan hits
first in `get_song_by_title`/`rate_song`, and both would show the same
rating in any UI that re-fetches by title. This isn't a hypothetical edge
case — it's present in the actual dataset this API is meant to serve.

**Fix:** route by song `id` (`/songs/{id}/rating`), and offer a separate
`/songs/search?title=...` that returns a list for the human-typed-title
case, exactly as I did in `backend/main.py`.

## 6. [NIT-ish, but real] Global mutable-default cache (`_cache=[]`) makes `load_songs` a hidden singleton with no reload path

**Impact:** works fine for a single long-lived process, but it's a classic
Python foot-gun (mutable default argument shared across all calls) and
means the API can never pick up an updated `songs.json` without a process
restart — surprising in a codebase where ratings are written back into
the same in-memory list (`song["rating"] = stars` at line 61), silently
mutating cached objects as a side effect of a POST handler.

**Fix:** load once at module scope explicitly, or use `functools.lru_cache`
if memoization is intentional — either way, don't mutate the cached
objects in place from a write endpoint.

## 7. [NIT] `/stats/duration` divides by `len(songs)` with no empty-dataset guard

**Impact:** `ZeroDivisionError` → 500 if `songs.json` is ever empty.
Low likelihood, cheap fix, not worth blocking on, but I'd leave a comment
in the PR.

**Fix:** guard with `if not songs: return {"avg_seconds": None}`.

## 8. [NIT] No pagination bounds checking (`page=0` or negative `size`)

**Impact:** `page=0` gives `start=0` after fixing bug #2's off-by-one, so
it's harmless once #2 is fixed, but negative `size` produces a reversed
empty-ish slice that's confusing rather than erroring clearly.

**Fix:** `size: int = Query(10, ge=1, le=200)` via FastAPI's `Query`
validators, same as I did in `backend/main.py`.

## 9. [NIT] No CORS configuration

**Impact:** any browser-based frontend calling this API from a different
origin (e.g. a React dev server on :5173) will be blocked by the browser
until CORS middleware is added. Not a bug in the API's logic, but it will
be the first thing a frontend engineer hits.

**Fix:** `app.add_middleware(CORSMiddleware, ...)`.

---

## What I'd block the PR on

**#1 (sort-then-paginate) and #5 (ratings keyed by title)** are the two I'd
insist on before merge — both are silent-wrong-answer bugs that pass a
casual smoke test and only surface once someone pages past page 1 or once
two songs happen to share a title, which is exactly the situation this
team's own data creates. #2 and #3 are also blocking but more obviously
wrong (easy to catch with two clicks in a browser), so they'd get fixed
fast once found. #4 is a correctness/security-adjacent gap I'd also block
on, since unrestricted numeric input reaching a persisted store is a bad
habit worth stopping at review time even in a toy app.

**#6–#9 are nits** — real, worth a comment, not worth blocking a merge on
their own.

## Note on using AI for this review

I asked an AI assistant to review the same file independently and compare
notes. It correctly flagged #2 (off-by-one), #3 (200-with-error-body),
#4 (unvalidated stars), and #9 (no CORS) — all things I'd already found.

It **missed #1 (sort-then-paginate order)** on its first pass — it noted
that sorting happens but didn't clock that slicing happens *before*
sorting, so it described the code as "sorts each page, which is
reasonable if the client re-sorts globally," effectively rationalizing
the bug instead of catching it. I only caught this by manually tracing
`start`/`end`/`sorted()` against `page=2` by hand, sorted by `tempo`, and
noticing the returned order didn't match what a full-dataset sort would
produce. When I pointed this out explicitly the AI agreed immediately —
it just didn't independently notice it, which matches the take-home's
warning that this exact bug is the one "a blind paste misses."

It also **missed #5 (rating collides on duplicate titles)** until I told
it that "Perfect" appears twice in the actual dataset — without that
concrete fact it treated `/songs/{title}` as a reasonable REST shape.

Net: the AI was useful for the mechanical/obvious bugs and for double
-checking I hadn't missed something in the nits, but the two most
consequential bugs (correctness bugs that require reasoning about
*this specific data* and about *execution order*, not pattern-matching
against common FastAPI mistakes) required me driving the trace by hand.
