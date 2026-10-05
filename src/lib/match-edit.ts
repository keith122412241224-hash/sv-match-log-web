import type { Deck, DeckArchetype, Environment, Match } from "@/types/database";

export type MatchEditData = {
  match: Match;
  decks: Deck[];
  archetypes: DeckArchetype[];
  environments: Environment[];
};

export type MatchMutationResult = { ok: boolean; message?: string };
