export type AnalysisDateParams = { playedFrom?: unknown; playedTo?: unknown };
export type AnalysisDateError = { field: "playedFrom" | "playedTo"; message: string };
type DateSelection = { playedFrom: string; playedTo: string; playedAtFrom?: string; playedAtTo?: string };

/** Analysis URL/API contract: minute precision in JST, with an inclusive end minute. */
export function validateAnalysisDates(params: AnalysisDateParams):
  | { ok: true; value: DateSelection }
  | { ok: false; error: AnalysisDateError } {
  const values: DateSelection = { playedFrom: "", playedTo: "" };
  for (const field of ["playedFrom", "playedTo"] as const) {
    const raw = params[field];
    if (raw === undefined) continue;
    const label = field === "playedFrom" ? "開始日時" : "終了日時";
    const invalid = () => ({ ok: false as const, error: { field, message: `${label}が正しくありません。日本時間の日時を確認して再設定してください。` } });
    if (typeof raw !== "string" || raw.length !== 16 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return invalid();
    const year = Number(raw.slice(0, 4)), month = Number(raw.slice(5, 7)), day = Number(raw.slice(8, 10));
    const hour = Number(raw.slice(11, 13)), minute = Number(raw.slice(14, 16));
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59) return invalid();
    const date = new Date(`${raw}:${field === "playedTo" ? "59.999" : "00"}+09:00`);
    if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1) return invalid();
    values[field] = raw;
    values[field === "playedFrom" ? "playedAtFrom" : "playedAtTo"] = date.toISOString();
  }
  // Equal minutes retain the existing 00.000–59.999 inclusive interval.
  if (values.playedFrom && values.playedTo && values.playedFrom > values.playedTo) {
    return { ok: false, error: { field: "playedTo", message: "終了日時は開始日時以降に設定してください。" } };
  }
  return { ok: true, value: values };
}

/** Preserve repeated values so validation cannot silently accept the last value. */
export function analysisDatesFromQuery(query: URLSearchParams): AnalysisDateParams {
  const value = (key: string) => !query.has(key) ? undefined : query.getAll(key).length === 1 ? query.get(key) : query.getAll(key);
  return { playedFrom: value("playedFrom"), playedTo: value("playedTo") };
}
