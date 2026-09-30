import { getCurrentUser } from "@/lib/data";
import { getAnalysisPageData, type AnalysisSearchParams } from "@/lib/analysis-page-data";
import { parseRankSelection } from "@/lib/rank-selection";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  if (!await getCurrentUser()) return Response.json({ error: "ログインが必要です。" }, { status: 401, headers });
  const query = new URL(request.url).searchParams;
  const allowed = ["environment", "myDeck", "opponentDeck", "turnOrder", "result", "playedFrom", "playedTo", "scope", "winRateMode", "rank", "ranks"];
  const params = Object.fromEntries(query) as AnalysisSearchParams;
  try {
    if ([...query.keys()].some(k => !allowed.includes(k) || query.getAll(k).length !== 1)) throw new Error();
    parseRankSelection(params);
  } catch { return Response.json({ error: "絞り込み条件が不正です。" }, { status: 400, headers }); }
  try {
    return Response.json(await getAnalysisPageData(params), { headers });
  } catch {
    return Response.json({ error: "分析データを取得できませんでした。" }, { status: 503, headers });
  }
}
