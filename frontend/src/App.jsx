import { useEffect, useState, useCallback } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { api } from "./api";
import { COLUMNS, toCSV } from "./columns";
import StarRating from "./StarRating";
import "./App.css";

const PAGE_SIZE = 10;

export default function App() {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("title");
  const [order, setOrder] = useState("asc");
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchInput, setSearchInput] = useState("");
  const [searchResult, setSearchResult] = useState(null); // {count, items, query} | null
  const [searchError, setSearchError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getSongs({ page, size: PAGE_SIZE, sortBy, order })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, sortBy, order]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleSort(key) {
    if (sortBy === key) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setOrder("asc");
    }
    setPage(1);
  }

  function handleRate(id, stars) {
    api.rate(id, stars).then(() => load());
  }

  async function handleSearch() {
    setSearchError(null);
    if (!searchInput.trim()) {
      setSearchResult(null);
      return;
    }
    try {
      const res = await api.search(searchInput.trim());
      setSearchResult(res);
    } catch (e) {
      setSearchError(e.message);
    }
  }

  function downloadCSV() {
    const rows = searchResult ? searchResult.items : data.items;
    const csv = toCSV(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "songs.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const displayRows = searchResult ? searchResult.items : data.items;

  return (
    <div className="app">
      <h1>Songs Dashboard</h1>

      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search by title…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button onClick={handleSearch}>Get Song</button>
        {searchResult && (
          <button onClick={() => { setSearchResult(null); setSearchInput(""); }}>
            Clear search
          </button>
        )}
        <button onClick={downloadCSV}>Download CSV</button>
      </div>

      {searchError && <p className="error">{searchError}</p>}
      {searchResult && searchResult.count === 0 && (
        <p className="info">No songs match "{searchResult.query}".</p>
      )}
      {searchResult && searchResult.count > 1 && (
        <p className="info">{searchResult.count} songs match "{searchResult.query}".</p>
      )}

      {error && <p className="error">Failed to load songs: {error}</p>}

      <table>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.key} onClick={() => toggleSort(c.key)}>
                {c.label}
                {sortBy === c.key ? (order === "asc" ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && !searchResult ? (
            <tr><td colSpan={COLUMNS.length}>Loading…</td></tr>
          ) : (
            displayRows.map((row) => (
              <tr key={row.id}>
                {COLUMNS.map((c) =>
                  c.key === "rating" ? (
                    <td key={c.key}>
                      <StarRating value={row.rating} onRate={(n) => handleRate(row.id, n)} />
                    </td>
                  ) : (
                    <td key={c.key}>{row[c.key] ?? <span className="null">—</span>}</td>
                  )
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {!searchResult && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}

      <h2>Danceability vs. Energy</h2>
      <p className="chart-note">
        Current page only. Points near danceability &gt; 1 or missing energy
        reflect raw data issues — see DECISIONS.md for how they're flagged.
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" dataKey="danceability" name="Danceability" domain={[0, 1]} />
          <YAxis type="number" dataKey="energy" name="Energy" domain={[0, 1]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ payload }) =>
              payload && payload[0] ? (
                <div className="chart-tooltip">
                  <strong>{payload[0].payload.title}</strong>
                  <div>danceability: {payload[0].payload.danceability}</div>
                  <div>energy: {payload[0].payload.energy ?? "missing"}</div>
                </div>
              ) : null
            }
          />
          <Scatter data={displayRows} fill="#6366f1" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
