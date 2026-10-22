import { DeckSelectionError } from "@/lib/analysis-deck-selection";
import { AppShell } from "@/components/AppShell";
import { AnalysisDashboard } from "@/components/analysis/AnalysisDashboard";
import { getAnalysisPageData, type AnalysisSearchParams } from "@/lib/analysis-page-data";
import { parseRankSelection } from "@/lib/rank-selection";
import { validateAnalysisDates } from "@/lib/analysis-date-query";
import { AnalysisDateQueryError } from "@/components/analysis/AnalysisDateQueryError";

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<AnalysisSearchParams> }) {
  const params = await searchParams;
  try { parseRankSelection(params); }
  catch { return <AppShell><div role="alert" className="rounded-md border p-4">ランクの絞り込み条件が不正です。URLのランク指定を確認してください。</div></AppShell>; }
  if (!validateAnalysisDates(params).ok) {
    const query = new URLSearchParams(Object.entries(params).flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map(v => [key, v]))).toString();
    return <AppShell><AnalysisDateQueryError key={query} query={query} /></AppShell>;
  }
  const initialQuery = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string")).toString();
  try {
    return <AppShell><AnalysisDashboard initialData={await getAnalysisPageData(params)} initialQuery={initialQuery} /></AppShell>;
  } catch (error) {
    if (!(error instanceof DeckSelectionError)) throw error;
    return <AppShell><div role="alert" className="rounded-md border p-4"><p>{error.message}</p><a href="/analysis" className="underline">条件をリセット</a></div></AppShell>;
  }
}
