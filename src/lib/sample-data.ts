import type { Deck, Match } from "@/types/database";

const now = Date.now();

export const sampleDecks: Deck[] = [
  deck("sample-royal", "ミッドレンジロイヤル", "ロイヤル", 1),
  deck("sample-witch", "スペルウィッチ", "ウィッチ", 2),
  deck("sample-dragon", "ランプドラゴン", "ドラゴン", 3),
  deck("sample-nightmare", "アグロナイトメア", "ナイトメア", 4),
  deck("sample-bishop", "コントロールビショップ", "ビショップ", 5)
];

export const sampleMatches: Match[] = [
  match(0, "sample-royal", "sample-witch", "first", "win"),
  match(1, "sample-royal", "sample-witch", "second", "win"),
  match(2, "sample-royal", "sample-dragon", "first", "lose"),
  match(3, "sample-royal", "sample-nightmare", "second", "win"),
  match(4, "sample-royal", "sample-bishop", "first", "lose"),
  match(5, "sample-witch", "sample-royal", "second", "lose"),
  match(6, "sample-witch", "sample-dragon", "first", "win"),
  match(7, "sample-witch", "sample-nightmare", "second", "win"),
  match(8, "sample-dragon", "sample-royal", "first", "win"),
  match(9, "sample-dragon", "sample-witch", "second", "lose"),
  match(10, "sample-dragon", "sample-bishop", "first", "win"),
  match(11, "sample-nightmare", "sample-bishop", "first", "win"),
  match(12, "sample-nightmare", "sample-dragon", "second", "lose"),
  match(13, "sample-bishop", "sample-nightmare", "second", "lose"),
  match(14, "sample-bishop", "sample-royal", "first", "win")
];

function deck(id: string, name: string, className: string, sortOrder: number): Deck {
  return {
    id,
    user_id: "sample-user",
    name,
    class_name: className,
    deck_type: "my_deck",
    sort_order: sortOrder,
    created_at: new Date(now - sortOrder * 86_400_000).toISOString()
  };
}

function match(
  index: number,
  myDeckId: string,
  opponentDeckId: string,
  turnOrder: Match["turn_order"],
  result: Match["result"]
): Match {
  return {
    id: `sample-match-${index}`,
    user_id: "sample-user",
    environment_id: null,
    my_deck_id: myDeckId,
    opponent_deck_id: opponentDeckId,
    my_user_deck_id: null,
    my_archetype_id: myDeckId,
    opponent_archetype_id: opponentDeckId,
    turn_order: turnOrder,
    result,
    played_at: new Date(now - index * 3_600_000).toISOString(),
    memo: null,
    created_at: new Date(now - index * 3_600_000).toISOString()
  };
}
