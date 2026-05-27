import type { MatchResult, TurnOrder } from "@/types/database";

export const SHADOWVERSE_CLASSES = [
  "エルフ",
  "ロイヤル",
  "ウィッチ",
  "ドラゴン",
  "ナイトメア",
  "ビショップ",
  "ネメシス"
] as const;

export const TURN_ORDER_LABELS: Record<TurnOrder, string> = {
  first: "先攻",
  second: "後攻"
};

export const RESULT_LABELS: Record<MatchResult, string> = {
  win: "勝ち",
  lose: "負け"
};

export const LOW_SAMPLE_THRESHOLD = 5;
