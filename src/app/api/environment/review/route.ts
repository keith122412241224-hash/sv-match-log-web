import { NextRequest, NextResponse } from "next/server";
import { creatorClient, CreatorError } from "@/lib/creator/server";
import { UUID } from "@/lib/creator/model";

export const dynamic = "force-dynamic";
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: NextRequest) {
  let session: Awaited<ReturnType<typeof creatorClient>>;
  try { session = await creatorClient(); }
  catch (error) {
    if (error instanceof CreatorError) return reply({error:error.message},error.status);
    return reply({error:"管理者権限を確認できませんでした。"},503);
  }
  const { client } = session;
  const environment = request.nextUrl.searchParams.get("environment");
  if (!environment || !UUID.test(environment)) return reply({ error: "環境の指定が不正です。" }, 400);
  const { data, error } = await client.from("environment_review_publications")
    .select("run_id,as_of,published_at,payload").eq("environment_id", environment).maybeSingle();
  if (error) return reply({ error: "総合環境評価を取得できませんでした。" }, 503);
  return reply(data);
}
