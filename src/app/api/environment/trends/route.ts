import { getCurrentUser } from "@/lib/data";
import { parseTrendSelection } from "@/lib/environment-trends";
import { getEnvironmentTrends } from "@/lib/environment-trend-data";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  const reply = (body: unknown, status: number) => Response.json(body, { status, headers });
  const user = await getCurrentUser();
  if (!user || user.is_anonymous !== false) return reply({ error: "会員ログインが必要です。" }, 401);
  let selection;
  try {
    const body = await request.text();
    if (body.length > 40000) return reply({ error: "集計条件が大きすぎます。" }, 400);
    selection = parseTrendSelection(JSON.parse(body));
  } catch { return reply({ error: "集計条件が不正です。" }, 400); }
  try { return reply(await getEnvironmentTrends(selection), 200); }
  catch { return reply({ error: "推移データを取得できませんでした。" }, 503); }
}
