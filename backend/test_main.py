import json

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture(autouse=True)
def isolated_data(tmp_path, monkeypatch):
    songs = [
        {"id": "1", "title": "Alpha", "danceability": 0.5, "energy": 0.2, "mood": 1,
         "acousticness": 0.1, "tempo": 100.0, "duration_ms": 200000,
         "num_sections": 5, "num_segments": 100, "valence": 0.3, "_flags": [], "index": 0},
        {"id": "2", "title": "beta", "danceability": 0.9, "energy": None, "mood": 0,
         "acousticness": 0.2, "tempo": 120.0, "duration_ms": 180000,
         "num_sections": 6, "num_segments": 200, "valence": None, "_flags": [], "index": 1},
        {"id": "3", "title": "  Alpha  ", "danceability": 0.1, "energy": 0.7, "mood": 1,
         "acousticness": 0.3, "tempo": 90.0, "duration_ms": 220000,
         "num_sections": 7, "num_segments": 150, "valence": 0.4, "_flags": [], "index": 2},
    ]
    songs_path = tmp_path / "songs.json"
    ratings_path = tmp_path / "ratings.json"
    songs_path.write_text(json.dumps(songs))
    monkeypatch.setattr(main, "SONGS_PATH", songs_path)
    monkeypatch.setattr(main, "RATINGS_PATH", ratings_path)
    yield


client = TestClient(main.app)


def test_get_songs_paginates():
    r = client.get("/songs?page=1&size=2")
    body = r.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2


def test_get_songs_sorts_across_full_dataset_not_just_page():
    r = client.get("/songs?page=1&size=2&sort_by=danceability&order=desc")
    body = r.json()
    # full-set order by danceability desc: 0.9 (beta), 0.5 (Alpha), 0.1 (Alpha) -- page 1 gets first two
    assert [i["id"] for i in body["items"]] == ["2", "1"]


def test_sort_nulls_last_both_directions():
    r_asc = client.get("/songs?page=1&size=3&sort_by=energy&order=asc")
    r_desc = client.get("/songs?page=1&size=3&sort_by=energy&order=desc")
    assert r_asc.json()["items"][-1]["id"] == "2"
    assert r_desc.json()["items"][-1]["id"] == "2"


def test_sort_by_unknown_field_rejected():
    r = client.get("/songs?sort_by=nope")
    assert r.status_code == 400


def test_search_is_case_and_whitespace_insensitive():
    r = client.get("/songs/search?title=alpha")
    body = r.json()
    assert body["count"] == 2
    assert {i["id"] for i in body["items"]} == {"1", "3"}


def test_search_no_match_returns_empty_not_error():
    r = client.get("/songs/search?title=zzz")
    assert r.status_code == 200
    assert r.json()["count"] == 0


def test_rating_persists_and_appears_in_get_songs():
    r = client.post("/songs/1/rating", json={"stars": 4})
    assert r.status_code == 200
    r2 = client.get("/songs/1")
    assert r2.json()["rating"] == 4


def test_rating_rejects_out_of_range():
    r = client.post("/songs/1/rating", json={"stars": 6})
    assert r.status_code == 422


def test_rating_rejects_unknown_song():
    r = client.post("/songs/nonexistent/rating", json={"stars": 3})
    assert r.status_code == 404


def test_get_song_not_found():
    r = client.get("/songs/nonexistent")
    assert r.status_code == 404
