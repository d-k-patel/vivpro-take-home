# Songs Take-Home

A normalized songs dataset served by a FastAPI backend and browsed
through a React dashboard. Section 1 reconciles two messy exports of
the same catalog into one clean table (see `DECISIONS.md` for exactly
what was wrong and how each issue was handled). Section 2 is a REST API
over that table with pagination, full-dataset sorting, non-unique-title
search, and a persisted star rating. Section 3 is the dashboard: a
sortable/paginated table, CSV export, title search, ratings, and a
danceability-vs-energy chart. `REVIEW.md` is a standalone code review of
`review/buggy_api.py` and does not need the app running to read.

## Quickest path: Docker

```bash
docker compose up --build
```

Backend at `http://localhost:8000`, frontend at `http://localhost:5173`.
The backend container runs `normalize.py` on startup before serving, so
there's no separate step. `data/` is mounted from the host so
`songs.json`/`conflicts.json`/`ratings.json` land in your working copy.
Skip to "Repo tour" below if you're using this path — the manual steps
underneath are the non-Docker alternative.

## Requirements (manual / non-Docker path)

- Python 3.10+
- Node 18+

## 1. Normalize the data

```bash
cd backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/python normalize.py
```

This reads `data/songs_part1.json` and `data/songs_part2.json` and
writes `data/songs.json` (the clean, row-oriented dataset the API
serves) and `data/conflicts.json` (an audit log of every field where
the two sources disagreed and which value was kept).

## 2. Run the backend

```bash
# from backend/, venv already created above
./venv/bin/uvicorn main:app --reload --port 8000
```

API is at `http://localhost:8000`. Interactive docs at
`http://localhost:8000/docs`.

Ratings are written to `data/ratings.json`, created on first rating.

## 3. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173`. It expects the backend at
`http://localhost:8000` (see `frontend/.env.development`; override with
`VITE_API_URL` if you run the backend elsewhere).

## 4. Run the tests

```bash
cd backend
./venv/bin/python -m pytest -q
```

19 tests covering the normalization rules (type coercion, missing
values, out-of-range clamping, the duration unit bug, merge/conflict
resolution) and the API (pagination, full-dataset sort with null
handling, case-insensitive search, rating validation, 404s).

## Repo tour

```
backend/
  normalize.py       # Section 1: reads both JSON files, writes data/songs.json
  test_normalize.py  # unit tests for normalization rules
  main.py            # Section 2: FastAPI app
  test_main.py       # unit tests for the API
  Dockerfile
data/
  songs_part1.json, songs_part2.json   # raw inputs, as given
  songs.json          # generated: clean dataset (run normalize.py first)
  conflicts.json       # generated: audit log of cross-file disagreements
  ratings.json          # generated: created on first POST rating
frontend/
  src/App.jsx          # table, pagination, sort, search, CSV, chart
  src/api.js            # fetch wrappers
  Dockerfile
review/
  buggy_api.py           # the AI-generated file under review
docker-compose.yml
REVIEW.md, DECISIONS.md, PROMPTS.md, REFLECTION.md
```

## Notes

- `data/songs.json`, `data/conflicts.json`, and `data/ratings.json` are
  generated files (not committed) — run `normalize.py` before starting
  the backend, or the API will fail to find `songs.json`.
- The chart on the dashboard reflects only the currently visible page,
  not the full dataset — see `REFLECTION.md` Q1 for why.
