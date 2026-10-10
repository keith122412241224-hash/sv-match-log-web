import { getCurrentUser } from "@/lib/data";
import { DASHBOARD_PERIODS, normalizeDashboardPeriod } from "@/lib/environment-dashboard-period";
import { parseRankSelection } from "@/lib/rank-selection";
import { getEnvironmentDashboard } from "@/lib/environment-dashboard-data";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  const reply = (body: unknown, status: number) => Response.json(body, { status, headers });
  const user = await getCurrentUser();
  if (!user || user.is_anonymous !== false) return reply({ error: "会員ログインが必要です。" }, 401);
  const p = new URL(request.url).searchParams;
  const environment = p.get("environment") ?? "";
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(environment)
    || !DASHBOARD_PERIODS.some(v => v.value === p.get("period")) || (!p.has("ranks") && !p.has("rank"))
    || [...p.keys()].some(k => !["environment", "period", "rank", "ranks"].includes(k) || p.getAll(k).length !== 1)) return reply({ error: "集計条件が不正です。" }, 400);
  let ranks;
  try { ranks = parseRankSelection({ ranks: p.get("ranks") ?? undefined, rank: p.get("rank") ?? undefined }); }
  catch { return reply({ error: "集計条件が不正です。" }, 400); }
  try {
    return reply(await getEnvironmentDashboard({ environment, period: normalizeDashboardPeriod(p.get("period")), ranks }), 200);
  } catch { return reply({ error: "環境データを取得できませんでした。" }, 503); }
}
