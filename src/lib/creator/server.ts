import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { IMAGE_BUCKET, type CreatorImage, type TierWork } from "./model";

export class CreatorError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function creatorClient() {
  const client = await createSupabaseServerClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user || user.is_anonymous !== false) throw new CreatorError("管理者ログインが必要です。", 401);
  const { data: admin, error: adminError } = await client.from("admin_users").select("id").eq("user_id", user.id).maybeSingle();
  if (adminError || !admin) throw new CreatorError("管理者のみ利用できます。", 403);
  return { client, user };
}

export async function requireCreatorPage() {
  try { return await creatorClient(); }
  catch (error) {
    if (error instanceof CreatorError && error.status === 401) redirect("/login?message=" + encodeURIComponent("制作ツール・OBSには管理者ログインが必要です。ログイン後、元のURLを開き直してください。"));
    if (error instanceof CreatorError && error.status === 403) redirect("/");
    throw error;
  }
}

export function databaseError(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === "23503") throw new CreatorError("保存済み作品で使用中の画像は削除できません。または参照先が削除されています。再読み込みして確認してください。", 409);
  if (error.code === "23514" || error.code === "22P02") throw new CreatorError("保存データが不正です。入力内容を確認してください。");
  throw new CreatorError("データを処理できませんでした。接続と制作ツール用migrationの適用状況を確認してください。", 503);
}

export async function getCreatorData(client: Awaited<ReturnType<typeof creatorClient>>["client"]) {
  const [images, works, decks] = await Promise.all([
    client.from("creator_images").select("*").order("created_at", { ascending: false }),
    client.from("creator_tier_works").select("*").order("updated_at", { ascending: false }),
    client.from("deck_archetypes").select("id,name").order("sort_order")
  ]);
  [images, works, decks].forEach(r => databaseError(r.error));
  return { images: (images.data ?? []) as CreatorImage[], works: (works.data ?? []) as TierWork[], decks: (decks.data ?? []) as { id: string; name: string }[] };
}

/** Durable outbox: failed Storage removal remains retryable, never a broken live image. */
export async function cleanCreatorStorage(client: Awaited<ReturnType<typeof creatorClient>>["client"]) {
  const { data, error } = await client.from("creator_storage_cleanup").select("object_path").lt("ready_after", new Date().toISOString()).limit(30);
  if (error) return false;
  let complete = true;
  for (const entry of data ?? []) {
    const { data: live, error: lookupError } = await client.from("creator_images").select("id").eq("object_path", entry.object_path).maybeSingle();
    if (lookupError) { complete = false; continue; }
    if (!live) {
      const { error: removeError } = await client.storage.from(IMAGE_BUCKET).remove([entry.object_path]);
      if (removeError) { complete = false; continue; }
    }
    const { error: deleteError } = await client.from("creator_storage_cleanup").delete().eq("object_path", entry.object_path);
    if (deleteError) complete = false;
  }
  return complete;
}
