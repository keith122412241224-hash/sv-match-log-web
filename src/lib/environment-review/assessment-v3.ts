import { interval95, type ReviewDeck } from "./metrics";
import { matchupLabel } from "./publication";

export function encounterTier(share: number | null) {
  if (share == null || share <= 0) return null;
  return share >= 10 ? 1 : share >= 5 ? 2 : share >= 2 ? 3 : share >= 1 ? 4 : 5;
}
type WindowCounts = { matchCount:number; shortMatchCount:number };
function encounterTrend(d:ReviewDeck, window?:WindowCounts) {
  if (!window || !d.short || !window.shortMatchCount || window.matchCount <= window.shortMatchCount) return 0;
  const recent=interval95(d.short.encounters,window.shortMatchCount);
  const earlier=interval95(d.encounters-d.short.encounters,window.matchCount-window.shortMatchCount);
  return recent && earlier ? recent[0]>earlier[1] ? 1 : recent[1]<earlier[0] ? -1 : 0 : 0;
}
export function strength(deck: ReviewDeck, window?:WindowCounts) {
  const m=deck.model, presence=encounterTier(deck.encounterRate);
  const trend=encounterTrend(deck,window);
  const blank={presence,fieldRate:null,otherRate:null,trend,tier:null,reason:"対象の実測または遭遇の観測が不足しています。"};
  if (!m || deck.isOther || (!presence && deck.eligibleCount<10) || (deck.encounters<5 && deck.eligibleCount<10)) return blank;
  const rivals=m.majorMatchups.filter(p=>p.used && p.estimatedRate!==null);
  const weight=rivals.reduce((sum,p)=>sum+p.weight,0);
  const fieldRate=weight ? rivals.reduce((sum,p)=>sum+p.weight*p.estimatedRate!,0)/weight : null;
  const field=fieldRate===null ? 0 : fieldRate>55 ? 1 : fieldRate<45 ? -1 : 0;
  // Complementary games only. A win over a major rival must not also be a second vote.
  const restCount=deck.eligibleCount-rivals.reduce((sum,p)=>sum+p.count,0);
  const restWins=m.direct.wins+m.reversed.wins-rivals.reduce((sum,p)=>sum+p.wins,0);
  const otherRate=restCount>=10 ? 100*(restWins+1.96**2/2)/(restCount+1.96**2) : null;
  const other=otherRate===null ? 0 : otherRate>=53 ? 1 : otherRate<=47 ? -1 : 0;
  const performance=field || other;
  const rank=m.upper.direction;
  const conflict=field*other<0;
  const reliableBreadth=rivals.length>=2 && !m.signals.some(s=>["concentration","equalWeight","perspective"].includes(s.kind));
  let adjustment=0;
  if(performance && !conflict && trend*performance>=0 && rank*performance>=0) {
    adjustment=performance;
    if(field===1 && other===1 && reliableBreadth) adjustment=2;
  }
  // Prevalence opens the top band. Remaining there requires support beyond frequency.
  const anchor=presence??5;
  let tier=Math.max(1,Math.min(5,anchor-adjustment));
  if(tier===1 && (performance<=0 || conflict || trend<0 || rank<0)) tier=2;
  const position=presence===null ? "相手側に観測されず、使用側の記録を参照。" : "遭遇頻度を評価の起点としました。";
  const explanation=conflict ? "主要対面と残りの対面で成績の向きが異なります。" : performance>0 ? "観測した対面成績が上方材料です。" : performance<0 ? "観測した対面成績が下方材料です。" : "対面成績に明確な上方材料はありません。";
  const reason=position+explanation+(trend ? (trend>0?"遭遇は増加傾向です。":"遭遇は減少傾向です。"):"")+(rank?"登録者ランク帯で成績差があります。":"");
  return {tier,presence,fieldRate,otherRate,trend,reason};
}
export const TIER_RULE = "encounter-v3.1" as const;
export function tierMethod(rule?: typeof TIER_RULE) {
  return rule === TIER_RULE ? anchoredStrength : strength;
}

/** v3.1. The immutable v3.0 calculation above also reproduces archived imports. */
export function anchoredStrength(deck: ReviewDeck, window?: WindowCounts) {
  const old = strength(deck, window);
  const model = deck.model;
  const rivals = model?.majorMatchups ?? [];
  const observed = rivals.filter(p => p.used && p.estimatedRate !== null);
  const plannedMass = rivals.reduce((s,p) => s + p.weight, 0);
  const observedMass = observed.reduce((s,p) => s + p.weight, 0);
  const coverage = plannedMass ? observedMass / plannedMass : 0;
  // Attenuate the evidence when much of the frequent field has not been observed.
  // No missing matchup receives a published win rate.
  const field = old.fieldRate === null ? null : 50 + coverage * (old.fieldRate - 50);
  const comparison = {presence:old.presence, fieldRate:old.fieldRate, otherRate:old.otherRate,
    trend:old.trend, coverage, observedRivals:observed.length, fieldSignal:field};
  if (!model || old.tier === null) return {...comparison, tier:null, reason:old.reason};
  const anchor = old.presence ?? 5;
  const overall = model.estimatedRate;
  const broad = observed.length >= 2 && coverage >= .5;
  const favorable = broad && field !== null && field > 55;
  const adverse = broad && field !== null && field < 45;
  const fragile = model.signals.some(s => ["concentration","equalWeight","perspective"].includes(s.kind));
  const robust = !fragile || [model.bias.userEqualWinRate,model.bias.withoutLargestWinRate].every(x => x !== null && x >= 50);
  const winTrend = model.signals.find(s => s.kind === "trend")?.direction ?? 0;
  const trends = [old.trend,winTrend,model.upper.direction];
  let tier = anchor;
  let reason = "遭遇頻度の基礎評価を維持しました。";
  if (favorable && robust && !trends.some(v => v < 0)) {
    tier = Math.max(1,anchor-1);
    reason = "頻繁に当たる複数の相手への成績が上方材料です。";
  } else if (adverse && overall !== null && overall < 50 && !trends.some(v => v > 0)) {
    tier = Math.min(5,anchor+1);
    reason = "遭遇が多い複数の相手に苦戦し、全体の成績でも持ち直していません。";
  } else if (anchor === 1 && !(favorable || (deck.eligibleCount >= 10 && overall !== null && overall >= 50 && !adverse))) {
    tier = 2;
    reason = "頻繁に当たりますが、最上位を支える対面成績は確認できません。";
  } else if (!broad) {
    reason += "主要対面の観測範囲が限られ、残りの対面だけでは昇格しません。";
  } else if (!favorable && !adverse) {
    reason += "遭遇の多い相手への適性は中立域です。";
  } else {
    reason += "偏り・推移・全体成績との整合を含め、補正の根拠が揃いません。";
  }
  return {...comparison,tier,reason};
}
export function priority(share: number | null) {
  return (share ?? 0) >= 10 ? "高" : (share ?? 0) >= 5 ? "中" : "低";
}
export function cellLabel(rating: number | null, wins: number, count: number) {
  if (rating !== null) return matchupLabel(rating);
  if (!count) return "対戦記録なし";
  if (count < 10) return "少数参考";
  const center = 100 * (wins + 1.96 ** 2 / 2) / (count + 1.96 ** 2);
  return center > 55 ? "有利傾向" : center < 45 ? "不利傾向" : "実測は拮抗";
}
