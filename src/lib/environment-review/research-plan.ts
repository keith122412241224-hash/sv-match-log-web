import { anchoredStrength } from "./assessment-v3";
import type { ReviewSnapshot } from "./metrics";
import type { Publication } from "./publication";
import type { Research } from "./research-v3";

type Target = {key:string; name:string; reasons:string[]; priority:number; share:number; queries:string[]};
export function researchPlan(snapshot:ReviewSnapshot, research?:Research, previous?:Publication|null, current?:Publication["payload"]["evaluation"]) {
  const since=research?.balanceChange?.effectiveAt ?? snapshot.environmentStart;
  const environment=snapshot.environmentName;
  const prefix=environment+" ローテーション ";
  const subjects=snapshot.decks.filter(d=>!d.isOther);
  const byId=new Map(subjects.map(d=>[d.deckId,d]));
  const published=previous && previous.payload.snapshot.environmentId===snapshot.environmentId &&
    Date.parse(previous.as_of)<=Date.parse(snapshot.asOf) && (!since || Date.parse(previous.as_of)>=Date.parse(since)) ? previous.payload : null;
  const finalTiers=new Map(current?.decks.map(d=>[d.deckId,d.tier]));
  const prior=new Map(published?.evaluation.decks.map(d=>[d.deckId,d.tier]));
  const sources=research?.sources??[];
  const claims=sources.filter(s=>s.outcome==="採用").flatMap(s=>s.claims);
  const guides=sources.filter(s=>s.guideCheck?.status==="本文確認");
  const targets:Target[]=[];
  function add(key:string,name:string,share:number,reasons:string[],priority:number,topics:string[]) {
    if(reasons.length) targets.push({key,name,share,reasons,priority,queries:topics.map(t=>prefix+name+" "+t)});
  }
  for(const d of subjects) {
    const f=anchoredStrength(d,snapshot), share=d.encounterRate??0, reasons:string[]=[];
    const compared=guides.flatMap(g=>g.guideCheck!.rows.filter(r=>r.deckId===d.deckId));
    const above=compared.some(x=>x.relation==="外部が上位"), below=compared.some(x=>x.relation==="外部が下位");
    if(above) reasons.push("外部が実測より上位");
    if(below) reasons.push("外部が実測より下位");
    if(above && share<5) reasons.push("低遭遇で外部が上位");
    if(compared.some(r=>r.relation==="実測保留・掲載あり")) reasons.push("実測保留で外部に掲載");
    if(compared.some(r=>r.relation==="対応不明")) reasons.push("外部の構築分類を要照合");
    const related=claims.filter(c=>c.target===d.deckId);
    const opinions=related.flatMap(c=>c.value===null?[]:[c.value]);
    const bands=compared.flatMap(c=>c.offset===undefined?[]:[(f.tier??0)-c.offset]);
    if(new Set([...bands,...opinions]).size>1 || (above && below)) reasons.push("外部見解が分裂");
    if(opinions.some(v=>v!==f.tier)) reasons.push("直接資料と実測が異なる");
    const externalPriority=reasons.length>0;
    if(share>=5 && d.eligibleWinRate!==null && d.eligibleWinRate<50) reasons.push("高遭遇・勝率半数未満");
    if(d.eligibleCount>0 && d.eligibleCount<20 && ((f.tier!==null && f.tier<=2) || (d.eligibleWinRate??0)>=60)) reasons.push("少数の好成績・上位評価");
    if(f.trend!==0) reasons.push("遭遇率の区間が分離");
    if(d.model?.signals.some(s=>s.kind==="trend" || s.kind==="rank")) reasons.push("勝率推移・ランク差");
    if(related.some(c=>c.topic==="構築")) reasons.push("構築の根拠を照合");
    if(published && !prior.has(d.deckId)) reasons.push("前回の評価対象にないマスタ");
    const old=prior.get(d.deckId);
    const now=finalTiers.has(d.deckId)?finalTiers.get(d.deckId):f.tier;
    if(old!=null && now!=null && Math.abs(now-old)>=2) reasons.push("前回の総合評価と二段階以上の差");
    if(d.encounters>0 && d.short?.encounters===d.encounters && snapshot.matchCount>snapshot.shortMatchCount)
      reasons.push("期間中の遭遇が直近に集中");
    add(d.deckId,d.name,share,reasons,externalPriority?1:2,["構築 主要カード 対策 練度","ランクマッチ ランク別 勝率 大会 採用"]);
  }
  const pairKeys=new Set([...snapshot.pairs.map(p=>p.a+"/"+p.b),...claims.filter(c=>c.topic==="対面相性").map(c=>c.target)]);
  const pairs=new Map(snapshot.pairs.map(p=>[p.a+"/"+p.b,p]));
  for(const key of pairKeys) {
    const [a,b]=key.split("/").map(k=>byId.get(k));
    if(!a || !b) continue;
    const pair=pairs.get(key), center=pair?.model?.estimatedRate;
    const measured=pair?.dataRating ?? ((pair?.count??0)>=10 && center!=null ? center>55?1:center<45?-1:null : null);
    const opinions=claims.filter(c=>c.target===key && c.value!==null).map(c=>c.value!);
    const reasons:string[]=[];
    if(measured!==null && opinions.some(v=>Math.sign(v)!==Math.sign(measured) || (pair?.dataRating!=null && v!==measured))) reasons.push("対面の実測と外部見解に差");
    if(new Set(opinions).size>1) reasons.push("対面の外部見解が分裂");
    if(measured===null && opinions.length) reasons.push("外部の暫定対面を検証");
    const share=Math.min(a.encounterRate??0,b.encounterRate??0), external=reasons.length>0;
    if(share>=5 && pair?.dataRating==null) reasons.push("主要デッキ同士の未確定対面");
    add(key,a.name+" 対 "+b.name,share,reasons,external?1:3,["対面 先攻 後攻 構築 勝ち筋"]);
  }
  // Also research frequent pairs that have no registered games or external opinions.
  const majors=subjects.filter(d=>(d.encounterRate??0)>=5);
  for(let i=0;i<majors.length;i++) for(const b of majors.slice(i+1)) {
    const [left,right]=[majors[i],b].sort((x,y)=>x.deckId.localeCompare(y.deckId));
    const key=left.deckId+"/"+right.deckId;
    if(!pairKeys.has(key)) add(key,left.name+" 対 "+right.name,Math.min(left.encounterRate!,right.encounterRate!),["主要デッキ同士の未観測対面"],3,["対面 構築 勝ち筋"]);
  }
  targets.sort((a,b)=>a.priority-b.priority || b.share-a.share || a.key.localeCompare(b.key));
  const candidates=guides.flatMap(g=>g.guideCheck!.candidates.map(name=>({name,source:g.id,query:prefix+name+" 新構築 別名 主要カード"})));
  return {environmentId:snapshot.environmentId,environment,environmentStart:snapshot.environmentStart??null,
    balanceChange:research?.balanceChange??null,asOf:snapshot.asOf,previousAsOf:published?previous!.as_of:null,
    openingQueries:[prefix+"能力変更 適用日時 公式",prefix+"最新 Tier表 GameWith",prefix+"最新 Tier表 Game8"],
    targets,candidates};
}
