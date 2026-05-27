import type { Deck, DeckArchetype, Environment, Match, UserDeck } from "@/types/database";

export type { Deck, Match };

export type MatchWithRelations = Match & {
  my_deck: Deck | null;
  opponent_deck: Deck | null;
  environment?: Environment | null;
  my_archetype?: DeckArchetype | null;
  opponent_archetype?: DeckArchetype | null;
  my_user_deck?: UserDeck | null;
};

export type ArchetypeWithAliases = DeckArchetype & {
  aliases?: { id: string; alias_name: string }[];
};
