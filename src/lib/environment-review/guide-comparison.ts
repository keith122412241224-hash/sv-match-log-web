import { anchoredStrength } from "./assessment-v3";
import { fail, id, indexed, list, object, oneOf, string } from "./evaluation-v1";
import type { ReviewSnapshot } from "./metrics";

const statuses = ["本文確認","検索結果のみ","旧環境","本文取得不能"] as const;
const relations = ["外部が上位","外部が下位","一致","実測保留・掲載あり","掲載を確認できず","対応不明"] as const;
type Row = {deckId:string; relation:typeof relations[number]; reason:string; offset?:number};
const norm = (s:string) => s.normalize("NFKC").replace(/\s+/gu,"").toLowerCase();
const has = (v:unknown,k:string) => typeof v==="object" && v!==null && Object.hasOwn(v,k);

function mappedRelation(base:number|null,band:number) {
  return base===null ? "実測保留・掲載あり" : band===base ? "一致" : band<base ? "外部が上位" : "外部が下位";
}

export function readGuide(value:unknown,snapshot:ReviewSnapshot) {
  const raw = has(value,"observations");
  const check = object(value,raw?"status observations":has(value,"candidates")?"status rows candidates":"status rows","攻略表");
  const status = oneOf(check.status,statuses,"本文確認状態");
  const decks = snapshot.decks.filter(d=>!d.isOther);
  const base = new Map(decks.map(d=>[d.deckId,anchoredStrength(d,snapshot).tier]));
  if (!raw) {
    const rows:Row[] = list(check.rows,item=>{
      const row = object(item,has(item,"offset")?"deckId relation reason offset":"deckId relation reason","デッキ照合");
      const deckId=id(row.deckId), relation=oneOf(row.relation,relations,"比較結果"), reason=string(row.reason,"照合理由",600);
      if (row.offset===undefined) {
        if (relation!=="掲載を確認できず" && relation!=="対応不明") fail("照合済みの評価には比較尺度の差が必要です。");
        return {deckId,relation,reason};
      }
      const initial=base.get(deckId), band=(initial??0)-Number(row.offset);
      if (initial===undefined || typeof row.offset!=="number" || !Number.isInteger(band) || band<1 || band>5 ||
          relation!==mappedRelation(initial,band)) fail("攻略表の比較方向と差が矛盾しています。");
      return {deckId,relation,reason,offset:row.offset};
    },500,"比較");
    const candidates=has(check,"candidates")?list(check.candidates,x=>string(x,"マスタ照合候補",120),500,"登録候補"):[];
    if (status!=="本文確認" && (rows.length || candidates.length)) fail("未確認の本文から候補を作成できません。");
    return {status,rows,candidates};
  }
  const observations=list(check.observations,item=>{
    const r=object(item,"name tier aliasId basis","外部名の照合");
    if (typeof r.tier!=="number" || !Number.isInteger(r.tier) || r.tier<1 || r.tier>5) fail("比較尺度は1〜5です。");
    return {name:string(r.name,"外部名",120),tier:r.tier,aliasId:r.aliasId===null?null:id(r.aliasId),basis:string(r.basis,"対応根拠",600)};
  },500,"本文で確認した対象");
  if(status!=="本文確認"){
    if(observations.length) fail("本文の版を確認できないため比較できません。");
    return {status,rows:[] as Row[],candidates:[] as string[]};
  }
  indexed(observations,r=>norm(r.name),"外部の名称");
  const mapped=new Map<string,Row>(), candidates:string[]=[];
  for(const o of observations) {
    const matches=decks.filter(d=>norm(d.name)===norm(o.name));
    if(o.aliasId && (!base.has(o.aliasId) || (matches.length && !matches.some(d=>d.deckId===o.aliasId)))) fail("別名の照合先を確認してください。");
    const key=o.aliasId ?? (matches.length===1?matches[0].deckId:null);
    if(!key) {
      candidates.push(o.name);
      for(const d of matches) mapped.set(d.deckId,{deckId:d.deckId,relation:"対応不明",reason:"正規化後の名称が複数のマスタに一致します。構築と照合先を確認してください。"});
      continue;
    }
    if(mapped.has(key)){mapped.set(key,{deckId:key,relation:"対応不明",reason:"複数構築が同じマスタ候補に対応します。構築の範囲を確認してください。"});continue;}
    const initial=base.get(key)??null;
    mapped.set(key,{deckId:key,relation:mappedRelation(initial,o.tier),offset:(initial??0)-o.tier,reason:o.basis});
  }
  const rows:Row[]=decks.map(d=>mapped.get(d.deckId)??{deckId:d.deckId,relation:"掲載を確認できず",reason:"確認できた本文の範囲に一意に対応する記載がありません。"});
  return {status,rows,candidates:candidates.sort()};
}
