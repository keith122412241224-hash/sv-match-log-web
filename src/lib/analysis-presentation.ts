import type { DeckAnalysisSummary } from "@/lib/analytics";
import { SHADOWVERSE_CLASSES } from "@/lib/constants";

export type AnalysisPeriod = "7d" | "30d" | "all";
export type SummarySort = "count" | "win-desc" | "win-asc" | "class";

/** Keep the existing JST minute precision and inclusive end-minute contract. */
export function quickAnalysisDates(period: AnalysisPeriod, now = new Date()) {
  if (period === "all") return { playedFrom: "", playedTo: "" };
  const end = Math.floor(now.getTime() / 60000) * 60000;
  const jst = (time: number) => new Date(time + 9 * 3600000).toISOString().slice(0, 16);
  return { playedFrom: jst(end - (period === "7d" ? 168 : 720) * 3600000), playedTo: jst(end) };
}

export function analysisPeriodLabel(from: string, to: string, preset?: string) {
  if (!from && !to) return "全期間";
  const hours = (Date.parse(`${to}:00+09:00`) - Date.parse(`${from}:00+09:00`)) / 3600000;
  if (preset === "7d" && hours === 168) return "直近7日";
  if (preset === "30d" && hours === 720) return "直近30日";
  return "カスタム期間";
}

export function selectAnalysisSummaries(summaries: DeckAnalysisSummary[], sort: SummarySort, minimum: number) {
  const classOrder = (name: string) => {
    const index = (SHADOWVERSE_CLASSES as readonly string[]).indexOf(name);
    return index < 0 ? SHADOWVERSE_CLASSES.length : index;
  };
  const idOrder = (a: DeckAnalysisSummary, b: DeckAnalysisSummary) => a.deck.id < b.deck.id ? -1 : a.deck.id > b.deck.id ? 1 : 0;
  return summaries.filter(s => s.total > 0 && s.total >= minimum).sort((a, b) => {
    let primary = 0;
    if (sort === "class") primary = classOrder(a.deck.class_name) - classOrder(b.deck.class_name);
    if (sort === "win-desc" || sort === "win-asc") {
      if (a.winRate == null || b.winRate == null) primary = Number(a.winRate == null) - Number(b.winRate == null);
      else primary = sort === "win-desc" ? b.winRate - a.winRate : a.winRate - b.winRate;
    }
    return primary || b.total - a.total || idOrder(a, b);
  });
}

/** Results are the existing bounded, newest-first sequence within the active filters. */
export function recentAnalysisStats(results: DeckAnalysisSummary["recentResults"]) {
  const count = results.length, wins = results.filter(r => r === "win").length;
  let streak = 0;
  while (streak < count && results[streak] === results[0]) streak++;
  return { count, wins, losses: count - wins, winRate: count ? wins / count * 100 : null, streak,
    streakLabel: count === 0 ? "" : count === 10 && streak === 10
      ? `直近10件すべて${results[0] === "win" ? "勝利" : "敗北"}`
      : `現在${streak}連${results[0] === "win" ? "勝" : "敗"}` };
}
