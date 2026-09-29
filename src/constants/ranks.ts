export type RankOption = { value: string; label: string; order: number; iconSrc?: string };

export const RANKS = [
  { value: "beginner", label: "Beginner", order: 1, iconSrc: "/ranks/beginner.png" },
  { value: "d", label: "Dランク", order: 2, iconSrc: "/ranks/d.png" },
  { value: "c", label: "Cランク", order: 3, iconSrc: "/ranks/c.png" },
  { value: "b", label: "Bランク", order: 4, iconSrc: "/ranks/b.png" },
  { value: "a", label: "Aランク", order: 5, iconSrc: "/ranks/a.png" },
  { value: "aa", label: "AAランク", order: 6, iconSrc: "/ranks/aa.png" },
  { value: "master", label: "Master", order: 7, iconSrc: "/ranks/master.png" },
  { value: "grandmaster", label: "GrandMaster", order: 8, iconSrc: "/ranks/grandmaster.png" }
] as const satisfies readonly RankOption[];

export const MASTER_GROUPS = [
  { value: "emerald", label: "エメラルド", order: 1, iconSrc: "/master-groups/emerald.png" },
  { value: "topaz", label: "トパーズ", order: 2, iconSrc: "/master-groups/topaz.png" },
  { value: "ruby", label: "ルビー", order: 3, iconSrc: "/master-groups/ruby.png" },
  { value: "sapphire", label: "サファイア", order: 4, iconSrc: "/master-groups/sapphire.png" },
  { value: "diamond", label: "ダイヤモンド", order: 5, iconSrc: "/master-groups/diamond.png" }
] as const satisfies readonly RankOption[];

export const GRANDMASTER_RATINGS = [
  { value: "none", label: "なし", order: 1 },
  { value: "epic", label: "EPIC", order: 2 },
  { value: "ultimate", label: "ULTIMATE", order: 3 },
  { value: "legend", label: "LEGEND", order: 4 },
  { value: "beyond", label: "BEYOND", order: 5 }
] as const satisfies readonly RankOption[];

export type RankTier = (typeof RANKS)[number]["value"];
export type MasterGroup = (typeof MASTER_GROUPS)[number]["value"];
export type GrandmasterRating = (typeof GRANDMASTER_RATINGS)[number]["value"];
