type InputWindow = {
  allow_match_input: boolean;
  match_input_start_at?: string | null;
  match_input_end_at?: string | null;
};

export function isEnvironmentInputEnabled(environment: InputWindow, now = Date.now()): boolean {
  return environment.allow_match_input === true
    && (environment.match_input_start_at == null || now >= Date.parse(environment.match_input_start_at))
    && (environment.match_input_end_at == null || now < Date.parse(environment.match_input_end_at));
}

export function nextEnvironmentInputBoundary(environments: InputWindow[], now: number): number | null {
  const times = environments.filter(environment => environment.allow_match_input)
    .flatMap(environment => [environment.match_input_start_at, environment.match_input_end_at])
    .filter((value): value is string => Boolean(value)).map(Date.parse).filter(time => time > now);
  return times.length ? Math.min(...times) : null;
}

// datetime-local has no timezone. Always interpret its wall time as Japan time,
// independent of the administrator's browser and the server's timezone.
export function jstInputToIso(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)) {
    throw new Error("入力日時を日本時間で正しく入力してください。");
  }
  const date = new Date(`${value}+09:00`);
  const normalized = value.length === 16 ? `${value}:00.000`
    : value.length === 19 ? `${value}.000` : value.padEnd(23, "0");
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 23) !== normalized) {
    throw new Error("入力日時を日本時間で正しく入力してください。");
  }
  return date.toISOString();
}

export function isoToJstInput(value: string | null | undefined): string {
  if (!value) return "";
  const local = new Date(Date.parse(value) + 9 * 60 * 60 * 1000).toISOString().slice(0, 23);
  // Match datetime-local's canonical value (omit zero seconds/fractions).
  return local.replace(/\.000$/, "").replace(/(\.\d*?[1-9])0+$/, "$1").replace(/T(\d{2}:\d{2}):00$/, "T$1");
}

export function readMatchInputWindow(start: string, end: string) {
  const match_input_start_at = jstInputToIso(start);
  const match_input_end_at = jstInputToIso(end);
  if (match_input_start_at && match_input_end_at && match_input_start_at >= match_input_end_at) {
    throw new Error("入力終了日時は入力開始日時より後に設定してください。");
  }
  return { match_input_start_at, match_input_end_at };
}

export function environmentInputStatus(environment: InputWindow, now: number): string {
  const format = (value: string) => new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).format(new Date(value));
  if (!environment.allow_match_input) return "手動停止中";
  if (environment.match_input_end_at && now >= Date.parse(environment.match_input_end_at)) return "入力期間終了";
  if (environment.match_input_start_at && now < Date.parse(environment.match_input_start_at)) return `${format(environment.match_input_start_at)}から開始予定（JST）`;
  return environment.match_input_end_at
    ? `現在入力可能・${format(environment.match_input_end_at)}で終了予定（JST）` : "現在入力可能";
}
