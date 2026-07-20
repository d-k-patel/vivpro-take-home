export const COLUMNS = [
  { key: "title", label: "Title" },
  { key: "danceability", label: "Danceability", numeric: true },
  { key: "energy", label: "Energy", numeric: true },
  { key: "mood", label: "Mood", numeric: true },
  { key: "acousticness", label: "Acousticness", numeric: true },
  { key: "tempo", label: "Tempo", numeric: true },
  { key: "duration_ms", label: "Duration (ms)", numeric: true },
  { key: "num_sections", label: "Sections", numeric: true },
  { key: "num_segments", label: "Segments", numeric: true },
  { key: "valence", label: "Valence", numeric: true },
  { key: "rating", label: "Rating" },
];

export function toCSV(rows) {
  const header = COLUMNS.map((c) => c.label).join(",");
  const lines = rows.map((r) =>
    COLUMNS.map((c) => {
      const v = r[c.key];
      return v === null || v === undefined ? "" : String(v).replace(/,/g, ";");
    }).join(",")
  );
  return [header, ...lines].join("\n");
}
