import { evidence, fail, indexed, iso, list, object, oneOf, source, string, type Evidence, type Source, type Trend } from "./evaluation-v1";

export const reasonCodes = ["rank", "concentration", "equalWeight", "smallSample", "matchup", "turn", "perspective", "trend", "difficulty", "build", "tournament", "external", "split", "other"] as const;
export type ReasonCode = typeof reasonCodes[number];
const claimDirections = ["上振れ評価", "下振れ評価", "概ね一致"] as const;
type Claim = {target:string; direction:typeof claimDirections[number]};
export type SourceV2 = Source & {
  originUrl:string; originPublishedAt:string|null; versionAt:string|null;
  provenance:"original"|"quotation"; topic:"trend"|"guide"; setting:"ranked"|"tournament";
  method:"observed"|"analysis"|"opinion"; applicability:"current"|"superseded"|"unknown"; targets:Claim[];
};
export type EvidenceV2 = Evidence & {reasonCodes:ReasonCode[]; uncertainty:string; omissionReason:string|null};
export function canonicalUrl(value:unknown):string {
  const raw = string(value,"原典URL",2048);
  if (!URL.canParse(raw)) fail("原典URLが不正です。");
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) fail("資料URLは認証情報のないHTTP(S)にしてください。");
  url.hash = "";
  for (const key of Array.from(url.searchParams.keys())) if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/iu.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
  return url.href;
}

const sourceKeys = "id url publisher group publishedAt retrievedAt environmentId summary trend reliability";
const evidenceKeys = "target sourceIds externalTrend rationale facts hypothesis";
const pick = (v:Record<string,unknown>, keys:string) => Object.fromEntries(keys.split(" ").map(k=>[k,v[k]]));
export function parseSource(value:unknown):SourceV2 {
  const d = object(value,sourceKeys+" originUrl originPublishedAt versionAt provenance topic setting method applicability targets","外部資料v2");
  const base = source(pick(d,sourceKeys));
  const originUrl = canonicalUrl(d.originUrl), url = canonicalUrl(base.url);
  const originPublishedAt = d.originPublishedAt === null ? null : iso(d.originPublishedAt);
  const versionAt = d.versionAt === null ? null : iso(d.versionAt);
  const provenance = oneOf(d.provenance,["original","quotation"] as const,"原典・転載");
  if (provenance === "original" && (url !== originUrl || Date.parse(base.publishedAt ?? "") !== Date.parse(originPublishedAt ?? "") && (base.publishedAt !== null || originPublishedAt !== null))) fail("一次資料のURL・公開日時は原典と一致させてください。");
  if ((originPublishedAt && Date.parse(originPublishedAt) > Date.parse(base.publishedAt ?? base.retrievedAt)) ||
      (versionAt && (Date.parse(versionAt) > Date.parse(base.retrievedAt) || base.publishedAt && Date.parse(versionAt) < Date.parse(base.publishedAt)))) fail("資料の原典・内容版・取得の日時順が不正です。");
  const targets = list(d.targets, v=>{
    const c=object(v,"target direction","対象別の外部評価");
    return {target:string(c.target,"対象",257),direction:oneOf(c.direction,claimDirections,"対象別の外部評価")};
  },2000,"資料が直接扱う対象");
  indexed(targets,c=>c.target,"資料内の対象");
  return {...base,url,originUrl,originPublishedAt,versionAt,provenance,
    topic:oneOf(d.topic,["trend","guide"] as const,"資料の用途"),setting:oneOf(d.setting,["ranked","tournament"] as const,"競技形式"),
    method:oneOf(d.method,["observed","analysis","opinion"] as const,"調査方法"),applicability:oneOf(d.applicability,["current","superseded","unknown"] as const,"現構築への適用"),targets};
}
export function parseEvidence(value:unknown):EvidenceV2 {
  const d=object(value,evidenceKeys+" reasonCodes uncertainty omissionReason","内部根拠v2");
  const codes=list(d.reasonCodes,v=>oneOf(v,reasonCodes,"理由種別"),reasonCodes.length,"理由種別");
  indexed(codes,c=>c,"理由種別");
  return {...evidence(pick(d,evidenceKeys)),reasonCodes:codes,uncertainty:string(d.uncertainty,"不確実性"),
    omissionReason:d.omissionReason === null ? null : string(d.omissionReason,"未掲載理由")};
}
type Dates = {asOf:string;periodStart:string;weekly?:{start:string};environmentStart?:string|null};
export function freshness(s:SourceV2,ctx:Dates):"latest"|"applicableGuide"|"ineligible" {
  const end=Date.parse(ctx.asOf), start=Date.parse(ctx.environmentStart ?? ctx.periodStart);
  if ([s.publishedAt,s.originPublishedAt].some(d=>!d || Date.parse(d)>end || Date.parse(d)<start) ||
      Date.parse(s.versionAt ?? s.retrievedAt)>end || s.applicability!=="current" || s.method==="opinion" || s.reliability==="低") return "ineligible";
  if (Date.parse(s.originPublishedAt!)>=Date.parse(ctx.weekly?.start ?? ctx.periodStart)) return "latest";
  return s.topic==="guide" ? "applicableGuide" : "ineligible";
}
function hostKey(raw:string) {
  // Protocol, www and article paths do not establish independent publishers.
  return new URL(raw).hostname.toLowerCase().replace(/^www\./u,"");
}
/** A common original host OR curator-declared source family joins series transitively. */
export function sourceSeries(sources:SourceV2[]) {
  const parent = new Map<string,string>();
  const root=(key:string):string=>{
    const p=parent.get(key);
    if (!p || p===key) return key;
    const result=root(p); parent.set(key,result); return result;
  };
  for (const s of sources) {
    const a=root("host:"+hostKey(s.originUrl)), b=root("family:"+s.group.normalize("NFKC").toLowerCase().trim());
    if(a!==b) parent.set(a,b);
    if(s.provenance==="original") {
      const publisher=root("publisher:"+s.publisher.normalize("NFKC").toLowerCase().trim());
      if(b!==publisher) parent.set(b,publisher);
    }
  }
  return new Map(sources.map(s=>[s.id,root("host:"+hostKey(s.originUrl))]));
}
export type Support = {trend:Trend;groups:number;ranked:boolean;freshStrong:boolean;refs:SourceV2[]};
export function targetSupport(refs:SourceV2[],target:string,ctx:Dates,series:Map<string,string>,measured:boolean):Support {
  const effective=refs.filter(s=>freshness(s,ctx)!=="ineligible" && s.targets.some(c=>c.target===target));
  const bySeries=new Map<string,Set<Claim["direction"]>>();
  for(const s of effective) {
    const family=series.get(s.id)!;
    const votes=bySeries.get(family) ?? new Set<Claim["direction"]>();
    votes.add(s.targets.find(c=>c.target===target)!.direction); bySeries.set(family,votes);
  }
  const groups=bySeries.size;
  const votes=[...bySeries.values()];
  const clear=new Set(votes.filter(v=>v.size===1).map(v=>[...v][0]));
  let trend:Trend="比較不能";
  if(measured && groups) {
    if(clear.size>=2) trend="評価分裂";
    else if(votes.every(v=>v.size===1)) trend=[...clear][0];
  }
  return {trend,groups,ranked:effective.some(s=>s.setting==="ranked"),
    freshStrong:effective.some(s=>s.setting==="ranked" && s.provenance==="original" && s.reliability==="高" && s.method==="observed" && freshness(s,ctx)==="latest"),refs:effective};
}
