"use client";

import { FieldLabel, Select } from "@/components/Field";
import { RANKS, MASTER_GROUPS, GRANDMASTER_RATINGS, type RankTier, type MasterGroup, type GrandmasterRating } from "@/constants/ranks";
import { EMPTY_RANK, type MatchRank } from "@/lib/match-rank";

export function RankFields({ value, onChange }: { value: MatchRank; onChange: (value: MatchRank) => void }) {
  return <fieldset className="grid gap-3 rounded-md border border-slate-200 p-3">
    <legend className="px-1 text-sm font-semibold">対戦時点の自分のランク（任意）</legend>
    <p className="text-xs text-muted">未入力でも保存できます。相手プレイヤーのランクではありません。</p>
    <FieldLabel>ランク<Select name="rank_tier" value={value.rank_tier ?? ""} onChange={event => onChange({ ...EMPTY_RANK, rank_tier: event.target.value as RankTier || null })}>
      <option value="">未入力</option>{RANKS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
    </Select></FieldLabel>
    {value.rank_tier === "master" ? <FieldLabel>Master区分<Select required name="master_group" value={value.master_group ?? ""} onChange={event => onChange({ ...value, master_group: event.target.value as MasterGroup || null })}>
      <option value="">区分を選択</option>{MASTER_GROUPS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
    </Select></FieldLabel> : null}
    {value.rank_tier === "grandmaster" ? <FieldLabel>GrandMaster区分<Select required name="grandmaster_rating" value={value.grandmaster_rating ?? ""} onChange={event => onChange({ ...value, grandmaster_rating: event.target.value as GrandmasterRating || null })}>
      <option value="">区分を選択</option>{GRANDMASTER_RATINGS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
    </Select></FieldLabel> : null}
  </fieldset>;
}
