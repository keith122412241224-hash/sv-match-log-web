"use client";

import Image from "next/image";
import { useState } from "react";
import { GRANDMASTER_RATINGS, MASTER_GROUPS, RANKS, type RankOption } from "@/constants/ranks";
import type { MatchRank } from "@/lib/match-rank";

export function RankOptionLabel({ option }: { option: RankOption }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  return <span className="inline-flex items-center gap-2">
    {option.iconSrc && failedSrc !== option.iconSrc ? <Image src={option.iconSrc} alt="" width={28} height={28} unoptimized onError={() => setFailedSrc(option.iconSrc)} className="h-7 w-7 object-contain" /> : null}
    <span>{option.label}</span>
  </span>;
}

export function RankBadge({ rank }: { rank: Partial<MatchRank> }) {
  if (rank.rank_tier === undefined) return <span className="text-xs text-muted">ランク取得不可</span>;
  const tier = RANKS.find((item) => item.value === rank.rank_tier);
  if (!tier) return <span className="text-xs text-muted">ランク未登録</span>;
  const child = tier.value === "master" ? MASTER_GROUPS.find((item) => item.value === rank.master_group)
    : tier.value === "grandmaster" ? GRANDMASTER_RATINGS.find((item) => item.value === rank.grandmaster_rating) : undefined;
  return <span className="inline-flex flex-wrap items-center gap-2 text-sm"><RankOptionLabel option={tier} />{child ? <> / <RankOptionLabel option={child} /></> : null}</span>;
}
