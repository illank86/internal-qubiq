import { jakartaToday } from "./api";

/** Period presets and print colours shared by the report previews (ledger, statements). */

export type Preset = "month" | "last-month" | "year" | "last-year" | "custom";

export const PRESET_OPTIONS: { value: Preset; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "year", label: "This year" },
  { value: "last-year", label: "Last year" },
  { value: "custom", label: "Custom" },
];

export function rangeOf(preset: Exclude<Preset, "custom">): [string, string] {
  const today = jakartaToday();
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (preset === "month") return [`${y}-${pad(m)}-01`, today];
  if (preset === "last-month") {
    const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
    return [`${py}-${pad(pm)}-01`, `${py}-${pad(pm)}-${pad(lastDay(py, pm))}`];
  }
  if (preset === "year") return [`${y}-01-01`, today];
  return [`${y - 1}-01-01`, `${y - 1}-12-31`];
}

// The paper is drawn in print colours in both themes: it previews a document.
export const PAPER = { ink: "#18181b", body: "#3f3f46", muted: "#71717a", line: "#e4e4e7", panel: "#f7f7f8", brand: "#c2410c", soft: "#fff4ec", good: "#15803d", bad: "#b91c1c" };
