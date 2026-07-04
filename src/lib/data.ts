import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateWinRate } from "@/lib/analytics";
import type { DeckArchetype, Environment, Match } from "@/types/database";
import type { ArchetypeWithAliases, Deck, MatchWithRelations } from "@/types/view-models";

const MATCH_ANALYTICS_COLUMNS =
  "id,user_id,environment_id,my_deck_id,opponent_deck_id,my_user_deck_id,my_archetype_id,opponent_archetype_id,turn_order,result,played_at,created_at";

export type MatchSummaryStats = {
  total: number;
  wins: number;
  winRate: number | null;
  firstWinRate: number | null;
  secondWinRate: number | null;
};

export const getCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return user;
});

export const getDecks = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("decks")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as Deck[];
});

export type MatchFilters = {
  myDeckId?: string;
  opponentDeckId?: string;
  turnOrder?: Match["turn_order"];
  result?: Match["result"];
  deckIdField?: "archetype" | "deck";
};

export async function getMatches(environmentId?: string, filters: MatchFilters = {}) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("matches")
    .select(MATCH_ANALYTICS_COLUMNS)
    .order("played_at", { ascending: false });

  if (environmentId) {
    query = query.eq("environment_id", environmentId);
  }

  if (filters.myDeckId) {
    query = query.eq(filters.deckIdField === "archetype" ? "my_archetype_id" : "my_deck_id", filters.myDeckId);
  }

  if (filters.opponentDeckId) {
    query = query.eq(
      filters.deckIdField === "archetype" ? "opponent_archetype_id" : "opponent_deck_id",
      filters.opponentDeckId
    );
  }

  if (filters.turnOrder) {
    query = query.eq("turn_order", filters.turnOrder);
  }

  if (filters.result) {
    query = query.eq("result", filters.result);
  }

  const { data } = await query;

  return (data ?? []) as Match[];
}

export async function getRecentMatchesWithRelations(environmentId?: string, limit = 10) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("matches")
    .select("*, environment:environments(*), my_deck:decks!matches_my_deck_id_fkey(*), opponent_deck:decks!matches_opponent_deck_id_fkey(*)")
    .order("played_at", { ascending: false })
    .limit(limit);

  if (environmentId) {
    query = query.eq("environment_id", environmentId);
  }

  const { data } = await query;

  return (data ?? []) as unknown as MatchWithRelations[];
}

export async function getMatchSummaryStats(environmentId?: string): Promise<MatchSummaryStats> {
  const supabase = await createSupabaseServerClient();

  async function countMatches(filters: { result?: Match["result"]; turnOrder?: Match["turn_order"] }) {
    let query = supabase.from("matches").select("id", { count: "exact", head: true });

    if (environmentId) {
      query = query.eq("environment_id", environmentId);
    }

    if (filters.result) {
      query = query.eq("result", filters.result);
    }

    if (filters.turnOrder) {
      query = query.eq("turn_order", filters.turnOrder);
    }

    const { count, error } = await query;
    return error ? 0 : count ?? 0;
  }

  const [total, wins, firstTotal, firstWins, secondTotal, secondWins] = await Promise.all([
    countMatches({}),
    countMatches({ result: "win" }),
    countMatches({ turnOrder: "first" }),
    countMatches({ result: "win", turnOrder: "first" }),
    countMatches({ turnOrder: "second" }),
    countMatches({ result: "win", turnOrder: "second" })
  ]);

  return {
    total,
    wins,
    winRate: calculateWinRate(wins, total),
    firstWinRate: calculateWinRate(firstWins, firstTotal),
    secondWinRate: calculateWinRate(secondWins, secondTotal)
  };
}

export const getEnvironments = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("environments")
    .select("*")
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  return (data ?? []) as Environment[];
});

export const getActiveArchetypes = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("deck_archetypes")
    .select("*")
    .eq("is_active", true)
    .order("class_name", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return [];
  }

  return (data ?? []) as DeckArchetype[];
});

export async function getAdminArchetypes() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("deck_archetypes")
    .select("*, aliases:deck_aliases(id, alias_name)")
    .order("class_name", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return [];
  }

  return (data ?? []) as unknown as ArchetypeWithAliases[];
}

export async function getDeckSuggestionsForAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("deck_suggestions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  return data ?? [];
}

export const getIsAdmin = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  const { data, error } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  return !error && Boolean(data);
});
