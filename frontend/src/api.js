const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function json(res) {
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export const api = {
  getSongs: ({ page, size, sortBy, order }) =>
    fetch(
      `${BASE}/songs?page=${page}&size=${size}&sort_by=${sortBy}&order=${order}`
    ).then(json),
  search: (title) =>
    fetch(`${BASE}/songs/search?title=${encodeURIComponent(title)}`).then(json),
  rate: (id, stars) =>
    fetch(`${BASE}/songs/${encodeURIComponent(id)}/rating`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stars }),
    }).then(json),
};
