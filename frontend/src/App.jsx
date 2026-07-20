import { useEffect, useState, useCallback } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { api } from "./api";
import { COLUMNS, toCSV } from "./columns";
import StarRating from "./StarRating";

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
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Songs Dashboard
          </h1>
          <p className="text-slate-500 mt-1">
            {data.total ? `${data.total} songs` : " "} — normalized from two messy Spotify exports
          </p>
        </header>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
          <div className="flex flex-wrap gap-2 items-center">
            <input
              className="flex-1 min-w-[220px] border border-slate-300 rounded-lg px-3.5 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
              placeholder="Search by title…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <button
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors cursor-pointer"
              onClick={handleSearch}
            >
              Get Song
            </button>
            {searchResult && (
              <button
                className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => { setSearchResult(null); setSearchInput(""); }}
              >
                Clear search
              </button>
            )}
            <button
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer ml-auto"
              onClick={downloadCSV}
            >
              ↓ Download CSV
            </button>
          </div>

          {searchError && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {searchError}
            </p>
          )}
          {searchResult && searchResult.count === 0 && (
            <p className="mt-3 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              No songs match "{searchResult.query}".
            </p>
          )}
          {searchResult && searchResult.count > 1 && (
            <p className="mt-3 text-sm text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
              {searchResult.count} songs match "{searchResult.query}".
            </p>
          )}
          {error && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              Failed to load songs: {error}
            </p>
          )}
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer select-none hover:text-indigo-600 transition-colors whitespace-nowrap"
                    >
                      {c.label}
                      <span className="text-indigo-500">
                        {sortBy === c.key ? (order === "asc" ? " ▲" : " ▼") : ""}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && !searchResult ? (
                  <tr>
                    <td className="px-4 py-6 text-slate-400" colSpan={COLUMNS.length}>
                      Loading…
                    </td>
                  </tr>
                ) : (
                  displayRows.map((row, i) => (
                    <tr
                      key={row.id}
                      className={`border-b border-slate-100 last:border-0 hover:bg-indigo-50/40 transition-colors ${
                        i % 2 === 1 ? "bg-slate-50/60" : ""
                      }`}
                    >
                      {COLUMNS.map((c) =>
                        c.key === "rating" ? (
                          <td key={c.key} className="px-4 py-2.5">
                            <StarRating value={row.rating} onRate={(n) => handleRate(row.id, n)} />
                          </td>
                        ) : (
                          <td key={c.key} className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                            {row[c.key] ?? <span className="text-slate-300">—</span>}
                          </td>
                        )
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!searchResult && (
            <div className="flex gap-3 items-center px-4 py-3 border-t border-slate-200 bg-slate-50">
              <button
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors cursor-pointer"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                ← Prev
              </button>
              <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
              <button
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors cursor-pointer"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-lg font-semibold text-slate-900">Danceability vs. Energy</h2>
          <p className="text-sm text-slate-500 mt-0.5 mb-4">
            Current page only. Points near danceability &gt; 1 or missing energy
            reflect raw data issues — see DECISIONS.md for how they're flagged.
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" dataKey="danceability" name="Danceability" domain={[0, 1]} stroke="#94a3b8" />
              <YAxis type="number" dataKey="energy" name="Energy" domain={[0, 1]} stroke="#94a3b8" />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ payload }) =>
                  payload && payload[0] ? (
                    <div className="bg-white border border-slate-200 shadow-lg rounded-lg px-3 py-2 text-sm">
                      <strong className="text-slate-900">{payload[0].payload.title}</strong>
                      <div className="text-slate-600">danceability: {payload[0].payload.danceability}</div>
                      <div className="text-slate-600">energy: {payload[0].payload.energy ?? "missing"}</div>
                    </div>
                  ) : null
                }
              />
              <Scatter data={displayRows} fill="#6366f1" />
            </ScatterChart>
          </ResponsiveContainer>
        </section>
      </div>
    </div>
  );
}
