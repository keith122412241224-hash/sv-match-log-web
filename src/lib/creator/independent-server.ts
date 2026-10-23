import { creatorClient, creatorPage, CreatorError, databaseError, getCreatorImages, getCreatorDisplayNames, getCreatorWork } from "./server";
import { parseCorrelation, type CorrelationWork } from "./correlation";
import { UUID, parseTierDocument, type TierWork } from "./model";
import { OBS_CONTENTS, obsOptions, selectedObsContents, type ObsSet, type ObsContent } from "./obs-set";

type Client = Awaited<ReturnType<typeof creatorClient>>["client"];
export type CorrelationSummary = Pick<CorrelationWork, "id" | "revision" | "tier_work_id" | "updated_at"> & { title: string };
export function getCorrelationPage(client: Client, cursor: string | null = null) {
  return creatorPage<CorrelationSummary>(client, "creator_correlations", cursor, "id,revision,tier_work_id,updated_at,title:document->>title");
}
export function getObsSetPage(client: Client, cursor: string | null = null) {
  return creatorPage<ObsSet>(client, "creator_obs_sets", cursor, "*");
}
export async function getCorrelationWork(client: Client, id: string) {
  if (!UUID.test(id)) throw new CreatorError("相関図IDが不正です。");
  const result = await client.from("creator_correlations").select("*").eq("id", id).maybeSingle();
  databaseError(result.error);
  if (!result.data) throw new CreatorError("相関図が見つかりません。", 404);
  let tier: TierWork | null = null;
  if (result.data.tier_work_id) {
    const parent = await client.from("creator_tier_works").select("*").eq("id", result.data.tier_work_id).maybeSingle();
    databaseError(parent.error);
    if (!parent.data) throw new CreatorError("作成元のTier表が見つかりません。", 409);
    tier = { ...parent.data, document: parseTierDocument(parent.data.document) } as TierWork;
  }
  const correlation = { ...result.data, document: parseCorrelation(result.data.document, tier?.document.title) } as CorrelationWork;
  const images = await getCreatorImages(client, correlation.document.nodes.map(n => n.imageId));
  return { correlation, tier, images, displayNames: await getCreatorDisplayNames(client, images) };
}
export async function getObsSet(client: Client, id: string, display?: { view: unknown }) {
  if (!UUID.test(id)) throw new CreatorError("セットIDが不正です。");
  const result = await client.from("creator_obs_sets").select("*").eq("id", id).maybeSingle();
  databaseError(result.error);
  if (!result.data) throw new CreatorError("OBSセットが見つかりません。", 404);
  const set = { ...result.data, ...obsOptions(result.data) } as ObsSet;
  let contents = selectedObsContents(set);
  if (display) {
    if (display.view !== undefined) {
      if (!OBS_CONTENTS.includes(display.view as ObsContent) || !contents.includes(display.view as ObsContent)) throw new CreatorError("このコンテンツはセットに登録されていません。", 404);
      contents = [display.view as ObsContent];
    } else if (set.display_mode === "individual") contents = contents.slice(0, 1);
  }
  const [tier, correlation] = await Promise.all([
    set.tier_work_id && contents.includes("tier") ? getCreatorWork(client, set.tier_work_id) : null,
    set.correlation_id && contents.includes("correlation") ? getCorrelationWork(client, set.correlation_id) : null
  ]);
  return { set, tier, correlation, contents };
}
