import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/creator/model";

export const dynamic = "force-dynamic";
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: NextRequest) {
  const client = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user || user.is_anonymous !== false) return reply({error:"会員ログインが必要です。"},401);
  const environment = request.nextUrl.searchParams.get("environment");
  if (!environment || !UUID.test(environment)) return reply({ error: "環境の指定が不正です。" }, 400);
  // The two audiences read independent editions, each with its own DB policy.
  const admin = await client.from("admin_users").select("id").eq("user_id",user.id).maybeSingle();
  if (admin.error) return reply({error:"閲覧権限を確認できませんでした。"},503);
  const fields = "run_id,as_of,published_at,payload";
  const query = admin.data
    ? client.from("environment_review_publications").select(fields)
    : client.from("environment_review_member_releases").select(fields).eq("active",true);
  const { data, error } = await query.eq("environment_id", environment).maybeSingle();
  if (error) return reply({ error: "総合環境評価を取得できませんでした。" }, 503);
  return reply(data);
}
