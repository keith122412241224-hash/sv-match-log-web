import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { IMAGE_BUCKET, UUID, parseTierDocument, type CreatorImage, type TierWork } from "./model";
import { CREATOR_PAGE_SIZE, parseCreatorCursor, type CreatorPage, type TierSummary, type TierSelection, type ImagePage } from "./pagination";
import { correlationDisplayNames } from "./correlation-display";

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
  if (error.code === "23503") throw new CreatorError("Tier表・相関図・OBSセットで使用中です。参照元から外すか別の作品へ変更してから削除してください。参照先が見つからない場合は再読み込みしてください。", 409);
  if (error.code === "23505") throw new CreatorError("同じTier表の相関図が既に存在します。再読み込みして編集してください。", 409);
  if (error.code === "23514" || error.code === "22P02") throw new CreatorError("保存データが不正です。入力内容を確認してください。");
  throw new CreatorError("データを処理できませんでした。接続と制作ツール用migrationの適用状況を確認してください。", 503);
}

type Client = Awaited<ReturnType<typeof creatorClient>>["client"];
export async function creatorPage<T>(client: Client, table: "creator_images" | "creator_tier_works" | "creator_correlations" | "creator_obs_sets", cursor: string | null, columns: string): Promise<CreatorPage<T>> {
  const boundary = parseCreatorCursor(cursor), column = table === "creator_images" ? "created_at" : "updated_at";
  const query = () => client.from(table).select(columns).order(column, { ascending: false }).order("id", { ascending: false });
  const after = (q: ReturnType<typeof query>, b: { time: string; id: string }) => q.or(`${column}.lt.${b.time},and(${column}.eq.${b.time},id.lt.${b.id})`);
  const result = await (boundary ? after(query(), boundary) : query()).limit(CREATOR_PAGE_SIZE + 1);
  databaseError(result.error);
  const rows = (result.data ?? []) as unknown as (T & { id: string; created_at: string; updated_at: string })[];
  const items = rows.slice(0, CREATOR_PAGE_SIZE), last = items.at(-1);
  let more = rows.length > CREATOR_PAGE_SIZE;
  // Even a server cap smaller than our page size must not look like the last page.
  if (last && !more) {
    const probe = await after(client.from(table).select("id"), { time: last[column], id: last.id }).limit(1);
    databaseError(probe.error); more = !!probe.data?.length;
  }
  return { items, nextCursor: more && last ? `${last[column]}|${last.id}` : null };
}

/** Small bounded requests; missing references are errors, never blank artwork. */
export async function getCreatorImages(client: Client, ids: string[]): Promise<CreatorImage[]> {
  const unique = [...new Set(ids)];
  if (unique.length > 600 || unique.some(id => !UUID.test(id))) throw new CreatorError("画像IDが不正です。");
  const images: CreatorImage[] = [];
  for (let start = 0; start < unique.length; start += 30) {
    const chunk = unique.slice(start, start + 30);
    const result = await client.from("creator_images").select("*").in("id", chunk);
    databaseError(result.error);
    if (result.data?.length !== chunk.length) throw new CreatorError("作品が参照する画像を取得できませんでした。再読み込みしてください。", 409);
    images.push(...result.data as CreatorImage[]);
  }
  return images;
}

export async function getCreatorDisplayNames(client: Client, images: CreatorImage[]) {
  const ids = [...new Set(images.flatMap(i => i.archetype_id ? [i.archetype_id] : []))], decks: { id: string; name: string }[] = [];
  for (let start = 0; start < ids.length; start += 30) {
    const result = await client.from("deck_archetypes").select("id,name").in("id", ids.slice(start, start + 30));
    databaseError(result.error); decks.push(...result.data ?? []);
  }
  return correlationDisplayNames(images, decks);
}

export async function getCreatorImagePage(client: Client, cursor: string | null = null): Promise<ImagePage> {
  const page = await creatorPage<CreatorImage>(client, "creator_images", cursor, "*");
  return { ...page, displayNames: await getCreatorDisplayNames(client, page.items) };
}

export async function getCreatorWorkPage(client: Client, cursor: string | null = null): Promise<CreatorPage<TierSummary>> {
  const page = await creatorPage<Omit<TierSummary, "correlationId">>(client, "creator_tier_works", cursor, "id,revision,updated_at,title:document->>title");
  const links = page.items.length ? await client.from("creator_correlations").select("id,tier_work_id").in("tier_work_id", page.items.map(w => w.id)) : { data: [], error: null };
  databaseError(links.error);
  return { ...page, items: page.items.map(work => ({ ...work, correlationId: links.data?.find(c => c.tier_work_id === work.id)?.id ?? null })) };
}

export async function getCreatorWork(client: Client, id: string): Promise<TierSelection> {
  if (!UUID.test(id)) throw new CreatorError("作品IDが不正です。");
  const [result, link] = await Promise.all([
    client.from("creator_tier_works").select("*").eq("id", id).maybeSingle(),
    client.from("creator_correlations").select("id").eq("tier_work_id", id).maybeSingle()
  ]);
  databaseError(result.error); databaseError(link.error);
  if (!result.data) throw new CreatorError("指定された作品が見つかりません。", 404);
  const work = { ...result.data, document: parseTierDocument(result.data.document) } as TierWork;
  return { work, images: await getCreatorImages(client, work.document.rows.flatMap(r => r.imageIds)), correlationId: link.data?.id ?? null };
}

// The small deck-name catalogue is reused by the existing association select.
// Traverse explicitly so even a large catalogue is not silently truncated.
async function getCreatorDecks(client: Client) {
  const decks: { id: string; name: string; sort_order: number }[] = [];
  let cursor: string | null = null;
  while (true) {
    let query = client.from("deck_archetypes").select("id,name,sort_order").order("id").limit(100);
    if (cursor) query = query.gt("id", cursor);
    const result = await query; databaseError(result.error);
    if (!result.data?.length) break;
    decks.push(...result.data); cursor = result.data.at(-1)!.id;
  }
  return decks.sort((a,b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)).map(({id,name}) => ({id,name}));
}

export async function getCreatorData(client: Client, workId?: string) {
  const [imagePage, workPage, decks, selection] = await Promise.all([
    getCreatorImagePage(client), getCreatorWorkPage(client), getCreatorDecks(client), workId === undefined ? null : getCreatorWork(client, workId)
  ]);
  return { imagePage, workPage, decks, selection };
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
