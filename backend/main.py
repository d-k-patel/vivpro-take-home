"""FastAPI backend over the normalized songs table. See DECISIONS.md for
the API-shape rationale (esp. the non-unique-title handling and why
ratings key on id, not title)."""
import json
import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
SONGS_PATH = DATA_DIR / "songs.json"
RATINGS_PATH = DATA_DIR / "ratings.json"

SORTABLE_FIELDS = {
    "id", "title", "danceability", "energy", "mood", "acousticness",
    "tempo", "duration_ms", "num_sections", "num_segments", "valence", "rating",
}

app = FastAPI(title="Songs API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_songs():
    return json.loads(SONGS_PATH.read_text())


def load_ratings():
    if RATINGS_PATH.exists():
        return json.loads(RATINGS_PATH.read_text())
    return {}


def save_ratings(ratings):
    RATINGS_PATH.write_text(json.dumps(ratings, indent=2))


def with_ratings(songs, ratings):
    out = []
    for s in songs:
        row = dict(s)
        row["rating"] = ratings.get(s["id"])
        out.append(row)
    return out


def norm_title(t: str) -> str:
    return " ".join((t or "").strip().lower().split())


class RatingIn(BaseModel):
    stars: int = Field(..., ge=1, le=5)


@app.get("/songs")
def get_songs(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=200),
    sort_by: str = Query("index"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
):
    if sort_by not in SORTABLE_FIELDS and sort_by != "index":
        raise HTTPException(400, f"Cannot sort by '{sort_by}'")

    songs = with_ratings(load_songs(), load_ratings())
    reverse = order == "desc"
    # None-safe sort: nulls always sort last regardless of direction
    songs.sort(key=lambda s: (s.get(sort_by) is None, s.get(sort_by)), reverse=False)
    if reverse:
        present = [s for s in songs if s.get(sort_by) is not None]
        missing = [s for s in songs if s.get(sort_by) is None]
        present.reverse()
        songs = present + missing

    total = len(songs)
    start = (page - 1) * size
    page_items = songs[start:start + size]
    return {"page": page, "size": size, "total": total, "items": page_items}


@app.get("/songs/search")
def search_songs(title: str = Query(..., min_length=1)):
    target = norm_title(title)
    ratings = load_ratings()
    matches = [s for s in load_songs() if target in norm_title(s["title"])]
    return {"query": title, "count": len(matches), "items": with_ratings(matches, ratings)}


@app.get("/songs/{song_id}")
def get_song(song_id: str):
    songs = load_songs()
    for s in songs:
        if s["id"] == song_id:
            return with_ratings([s], load_ratings())[0]
    raise HTTPException(404, "Song not found")


@app.post("/songs/{song_id}/rating")
def rate_song(song_id: str, body: RatingIn):
    songs = load_songs()
    if not any(s["id"] == song_id for s in songs):
        raise HTTPException(404, "Song not found")
    ratings = load_ratings()
    ratings[song_id] = body.stars
    save_ratings(ratings)
    return {"id": song_id, "rating": body.stars}
