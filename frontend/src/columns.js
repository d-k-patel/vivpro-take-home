export const COLUMNS = [
  { key: "title", label: "Title", width: 138 },
  { key: "danceability", label: "Danceability", numeric: true, width: 104 },
  { key: "energy", label: "Energy", numeric: true, width: 70 },
  { key: "mood", label: "Mood", numeric: true, width: 58 },
  { key: "acousticness", label: "Acousticness", numeric: true, width: 104 },
  { key: "tempo", label: "Tempo", numeric: true, width: 82 },
  { key: "duration_ms", label: "Duration (ms)", numeric: true, width: 108 },
  { key: "num_sections", label: "Sections", numeric: true, width: 72 },
  { key: "num_segments", label: "Segments", numeric: true, width: 82 },
  { key: "valence", label: "Valence", numeric: true, width: 74 },
  { key: "rating", label: "Rating", width: 108 },
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
