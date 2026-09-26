export type RankOption = { value: string; label: string; order: number; iconSrc?: string };

export const RANKS = [
  { value: "beginner", label: "Beginner", order: 1 },
  { value: "d", label: "Dランク", order: 2 },
  { value: "c", label: "Cランク", order: 3 },
  { value: "b", label: "Bランク", order: 4 },
  { value: "a", label: "Aランク", order: 5 },
  { value: "aa", label: "AAランク", order: 6 },
  { value: "master", label: "Master", order: 7 },
  { value: "grandmaster", label: "GrandMaster", order: 8 }
] as const satisfies readonly RankOption[];

export const MASTER_GROUPS = [
  { value: "emerald", label: "エメラルド", order: 1 },
  { value: "topaz", label: "トパーズ", order: 2 },
  { value: "ruby", label: "ルビー", order: 3 },
  { value: "sapphire", label: "サファイア", order: 4 },
  { value: "diamond", label: "ダイヤモンド", order: 5 }
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
