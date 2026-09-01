import type { Deck, DeckArchetype, Environment, Match } from "@/types/database";

export type { Deck, Match };

export type RecentMatchWithRelations = Pick<Match, "id" | "played_at" | "result" | "turn_order"> & {
  my_deck: Pick<Deck, "name" | "class_name"> | null;
  opponent_deck: Pick<Deck, "name" | "class_name"> | null;
  environment?: Pick<Environment, "name"> | null;
};

export type ArchetypeWithAliases = DeckArchetype & {
  aliases?: { id: string; alias_name: string }[];
};
