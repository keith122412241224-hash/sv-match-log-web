import { AppShell } from "@/components/AppShell";
import { AnalysisDashboard } from "@/components/analysis/AnalysisDashboard";
import { getAnalysisPageData, type AnalysisSearchParams } from "@/lib/analysis-page-data";
import { parseRankSelection } from "@/lib/rank-selection";

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<AnalysisSearchParams> }) {
  const params = await searchParams;
  try { parseRankSelection(params); }
  catch { return <AppShell><div role="alert" className="rounded-md border p-4">ランクの絞り込み条件が不正です。URLのランク指定を確認してください。</div></AppShell>; }
  const initialQuery = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string")).toString();
  return <AppShell><AnalysisDashboard initialData={await getAnalysisPageData(params)} initialQuery={initialQuery} /></AppShell>;
}
