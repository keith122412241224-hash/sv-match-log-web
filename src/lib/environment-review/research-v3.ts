import { fail, id, indexed, iso, list, object, oneOf, string } from "./evaluation-v1";
import { readGuide } from "./guide-comparison";
import type { ReviewSnapshot } from "./metrics";

const topics = ["環境評価","対面相性","構築","難易度","勝ち筋・対策","大会採用","実戦検証","体感"] as const;
function url(value: unknown) {
  const parsed = new URL(string(value, "URL", 1400));
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) fail("原典には公開HTTPS URLが必要です。");
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) if (key.startsWith("utm_")) parsed.searchParams.delete(key);
  parsed.searchParams.sort();
  return parsed.href;
}
function claim(value: unknown) {
  const c = object(value,"target topic value basis conditions","対象別資料");
  const target = string(c.target,"対象ID",260), topic = oneOf(c.topic,topics,"種類");
  const pair = target.includes("/");
  if ((topic === "対面相性") !== pair) fail("個別対面には対面を直接扱う根拠が必要です。");
  if (c.value !== null && (typeof c.value !== "number" || !Number.isInteger(c.value) ||
      c.value < (pair ? -2 : 1) || c.value > (pair ? 2 : 5) ||
      !["環境評価","対面相性","実戦検証"].includes(topic))) fail("資料の評価値または種類が不正です。");
  return { target, topic, value:c.value as number|null, basis:string(c.basis,"根拠",600), conditions:string(c.conditions,"構築・条件",600) };
}
function source(value: unknown, snapshot:ReviewSnapshot) {
  const hasGuide = value !== null && typeof value === "object" && Object.hasOwn(value,"guideCheck");
  const hasScope = value !== null && typeof value==="object" && Object.hasOwn(value,"scopeStart");
  const fields = "id url origin publisher author dataset publishedAt updatedAt retrievedAt environmentId channel reliability applicability outcome reason claims"+(hasScope?" scopeStart":"");
  const s = object(value,hasGuide ? fields+" guideCheck" : fields,"調査資料");
  return { ...(hasScope ? {scopeStart:iso(s.scopeStart)} : {}), ...(hasGuide ? {guideCheck:readGuide(s.guideCheck,snapshot)} : {}), id:id(s.id),url:url(s.url),origin:url(s.origin),publisher:string(s.publisher,"発信元",120),
    author:string(s.author,"原著者識別子",160).normalize("NFKC").toLowerCase(),dataset:string(s.dataset,"原資料・大会識別子",160).normalize("NFKC").toLowerCase(),
    publishedAt:s.publishedAt === null ? null : iso(s.publishedAt), updatedAt:s.updatedAt === null ? null : iso(s.updatedAt),
    retrievedAt:iso(s.retrievedAt),environmentId:s.environmentId === null ? null : id(s.environmentId),
    channel:oneOf(s.channel,["攻略","X","note","動画","大会","公式","個人記事"] as const,"媒体"),
    reliability:oneOf(s.reliability,["中","高","低"] as const,"信頼性"),
    applicability:string(s.applicability,"現環境・改訂・能力変更の確認",600),
    outcome:oneOf(s.outcome,["採用","不採用","取得不能"] as const,"採否"),reason:string(s.reason,"採否理由",600),
    claims:list(s.claims,claim,160,"確認した主張") };
}
export type ResearchSource = ReturnType<typeof source>;
export type Research = {mode:"current"|"historical";analyzedAt:string;sources:ResearchSource[];searchLog:string;balanceChange?:{effectiveAt:string;url:string} | null};
export function parseResearch(value: unknown, snapshot: ReviewSnapshot, now = Date.now()): Research {
  const withBoundary = typeof value==="object" && value!==null && Object.hasOwn(value,"balanceChange");
  const r = object(value,withBoundary?"mode analyzedAt sources searchLog balanceChange":"mode analyzedAt sources searchLog","調査記録");
  const record=r.balanceChange==null?null:object(r.balanceChange,"effectiveAt url","公式能力変更");
  const balanceChange=record?{effectiveAt:iso(record.effectiveAt),url:url(record.url)}:null;
  const boundary=Math.max(Date.parse(snapshot.environmentStart??"")||0,Date.parse(balanceChange?.effectiveAt??"")||0);
  if(balanceChange && (boundary>Date.parse(snapshot.asOf) || Date.parse(balanceChange.effectiveAt)<Date.parse(snapshot.environmentStart??"") ||
      boundary>Math.max(Date.parse(snapshot.periodStart),Date.parse(snapshot.environmentStart??"")||0)))
    fail("能力変更の境界をまたぐ集計です。変更後の環境または集計期間で再作成してください。");
  const mode = oneOf(r.mode,["current","historical"] as const,"分析モード"), analyzedAt = iso(r.analyzedAt);
  const time = Date.parse(analyzedAt), cutoff = mode === "historical" ? Date.parse(snapshot.asOf) : time;
  if (time > now || time < Date.parse(snapshot.asOf)) fail("分析実行日時を確認してください。");
  const sources = list(r.sources,item=>source(item,snapshot),100,"調査資料");
  indexed(sources,s=>s.id,"資料ID");
  indexed(sources.filter(s=>s.outcome==="採用"),s=>s.url,"採用した正規化URL");
  const decks = new Set(snapshot.decks.filter(d=>!d.isOther).map(d=>d.deckId));
  function known(key:string) {
    const parts=key.split("/");
    return parts.every(id=>decks.has(id)) && (parts.length===1 || parts.length===2 && parts[0]<parts[1]);
  }
  const guides = sources.filter(s => s.guideCheck);
  indexed(guides, s=>s.url, "比較した攻略表");
  const guideUrls = new Set(guides.flatMap(s=>[s.url,s.origin]));
  if (sources.some(s=>s.outcome==="採用" && (guideUrls.has(s.origin) || guideUrls.has(s.url)))) fail("比較用の攻略表は補正票にできません。");
  for (const s of sources) {
    const checked = Date.parse(s.retrievedAt);
    if (checked > time) fail("分析後の取得日時です。");
    indexed(s.claims,c=>c.target,"資料内の対象");
    if (s.claims.some(c=>!known(c.target))) fail("資料の対象がスナップショットと一致しません。");
    const check = s.guideCheck;
    if (balanceChange && (check?.status==="本文確認" || s.outcome==="採用")) {
      const evidenceStart=Date.parse(s.scopeStart ?? "");
      if(!Number.isFinite(evidenceStart) || evidenceStart<boundary || evidenceStart>Date.parse(s.updatedAt??s.publishedAt??""))
        fail("変更後の実績・考察であることを確認し対象開始時刻を指定してください。");
    }
    if (check) {
      if (s.channel !== "攻略" || s.claims.length || s.outcome === "採用") fail("攻略表の照合は内部比較専用です。");
      if (check.status === "本文確認") {
        const edition = Date.parse(s.updatedAt ?? s.publishedAt ?? "");
        if (!Number.isFinite(edition) || edition > checked || checked > cutoff || cutoff-edition > 14*86400000 ||
            s.environmentId !== snapshot.environmentId || edition < boundary ||
            (s.publishedAt && edition < Date.parse(s.publishedAt)) || s.outcome==="取得不能") fail("攻略表の環境・本文の版・確認時刻を照合してください。");
        const rows = indexed(check.rows,row=>row.deckId,"攻略表内のデッキ");
        if (rows.size !== decks.size || [...rows.keys()].some(key=>!decks.has(key))) fail("比較結果は対象デッキを全件照合してください。");
      } else if (check.rows.length) fail("未確認の本文から比較結果を入力できません。");
    }
    if (s.outcome !== "採用") continue;
    if ((!s.publishedAt && !s.updatedAt) || !s.claims.length || s.environmentId !== snapshot.environmentId || s.reliability === "低") fail("採用には同一環境の原典・直接根拠が必要です。");
    const published = Date.parse(s.publishedAt ?? s.updatedAt!), edition = Date.parse(s.updatedAt ?? s.publishedAt!);
    if (edition < published || edition > checked || checked > cutoff || edition < boundary) fail("対象環境・利用可能時点に合わない資料です。");
    if (s.claims.some(c=>c.topic === "環境評価" && cutoff-edition > 14*86400000)) fail("環境動向の評価は二週間以内の版で確認してください。");
  }
  return {...(withBoundary ? {balanceChange} : {}),mode,analyzedAt,sources,searchLog:string(r.searchLog,"検索記録",4000)};
}
// Union across all accepted origins so even a chain of cross-posts counts just once.
export function originGroups(sources: ResearchSource[], includeVerifiedGuides=false) {
  const keys = new Map<string,string>(), parent = new Map<string,string>();
  function root(id:string):string { const next=parent.get(id); return !next || next===id ? id : root(next); }
  for (const s of sources.filter(s=>s.outcome==="採用" || includeVerifiedGuides && s.guideCheck?.status==="本文確認")) {
    parent.set(s.id,s.id);
    for (const k of ["url:"+s.origin,"url:"+s.url,"author:"+s.author,"data:"+s.dataset]) {
      const existing = keys.get(k);
      if (existing) parent.set(root(s.id),root(existing));
      keys.set(k,s.id);
    }
  }
  return new Map([...parent.keys()].map(id=>[id,root(id)]));
}
