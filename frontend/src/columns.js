export const COLUMNS = [
  { key: "title", label: "Title" },
  { key: "danceability", label: "Danceability" },
  { key: "energy", label: "Energy" },
  { key: "mood", label: "Mood" },
  { key: "acousticness", label: "Acousticness" },
  { key: "tempo", label: "Tempo" },
  { key: "duration_ms", label: "Duration (ms)" },
  { key: "num_sections", label: "Sections" },
  { key: "num_segments", label: "Segments" },
  { key: "valence", label: "Valence" },
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
