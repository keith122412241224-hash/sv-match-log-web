import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateWinRate } from "@/lib/analytics";
import { buildWeeklyPeriod, buildWeeklyReport, shiftWeeklyPeriod } from "@/lib/weekly-report";
import type { DeckArchetype, Environment, Match } from "@/types/database";
import type { ArchetypeWithAliases, Deck, RecentMatchWithRelations } from "@/types/view-models";

const MATCH_ANALYTICS_COLUMNS =
  "id,user_id,environment_id,my_deck_id,opponent_deck_id,my_user_deck_id,my_archetype_id,opponent_archetype_id,turn_order,result,played_at,created_at";
const WEEKLY_REPORT_MATCH_COLUMNS = "id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,result,played_at";

const REMOVED_OTHER_ARCHETYPE_NAMES = new Set([
  "その他エルフ",
  "その他ロイヤル",
  "その他ウィッチ",
  "その他ドラゴン",
  "その他ナイトメア",
  "その他ビショップ",
  "その他ネメシス"
]);

export type MatchSummaryStats = {
  total: number;
  wins: number;
  winRate: number | null;
  firstWinRate: number | null;
  secondWinRate: number | null;
};

export type HomeDashboardData = {
  summary: MatchSummaryStats;
  recent: RecentMatchWithRelations[];
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
  playedAtFrom?: string;
  playedAtTo?: string;
  deckIdField?: "archetype" | "deck";
  includeAllUsers?: boolean;
};

export async function getMatches(environmentId?: string, filters: MatchFilters = {}) {
  const supabase = await createSupabaseServerClient();
  const [user, isAdmin] = await Promise.all([getCurrentUser(), filters.includeAllUsers ? getIsAdmin() : false]);
  const pageSize = 1000;
  const matches: Match[] = [];

  if (!user) {
    return [];
  }

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("matches")
      .select(MATCH_ANALYTICS_COLUMNS)
      .order("played_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);

    if (!filters.includeAllUsers || !isAdmin) {
      query = query.eq("user_id", user.id);
    }

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

    if (filters.playedAtFrom) {
      query = query.gte("played_at", filters.playedAtFrom);
    }

    if (filters.playedAtTo) {
      query = query.lte("played_at", filters.playedAtTo);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    matches.push(...((data ?? []) as Match[]));

    if (!data || data.length < pageSize) {
      return matches;
    }
  }
}

export async function getRecentMatchesWithRelations(environmentId?: string, limit = 10) {
  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();

  if (!user) {
    return [];
  }

  let query = supabase
    .from("matches")
    .select(
      "id,played_at,result,turn_order,environment:environments(name),my_deck:decks!matches_my_deck_id_fkey(name,class_name),opponent_deck:decks!matches_opponent_deck_id_fkey(name,class_name)"
    )
    .order("played_at", { ascending: false })
    .limit(limit);

  query = query.eq("user_id", user.id);

  if (environmentId) {
    query = query.eq("environment_id", environmentId);
  }

  const { data } = await query;

  return (data ?? []) as unknown as RecentMatchWithRelations[];
}

export async function getHomeDashboard(environmentId?: string, limit = 10): Promise<HomeDashboardData> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_home_dashboard", {
    p_environment_id: environmentId || null,
    p_limit: limit
  });

  if (!error && isHomeDashboardData(data)) {
    return data;
  }

  const [summary, recent] = await Promise.all([
    getMatchSummaryStats(environmentId),
    getRecentMatchesWithRelations(environmentId, limit)
  ]);

  return { summary, recent };
}

export async function getMatchSummaryStats(environmentId?: string): Promise<MatchSummaryStats> {
  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();

  if (!user) {
    return {
      total: 0,
      wins: 0,
      winRate: null,
      firstWinRate: null,
      secondWinRate: null
    };
  }
  const userId = user.id;

  async function countMatches(filters: { result?: Match["result"]; turnOrder?: Match["turn_order"] }) {
    let query = supabase.from("matches").select("id", { count: "exact", head: true }).eq("user_id", userId);

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

  const [firstTotal, firstWins, secondTotal, secondWins] = await Promise.all([
    countMatches({ turnOrder: "first" }),
    countMatches({ result: "win", turnOrder: "first" }),
    countMatches({ turnOrder: "second" }),
    countMatches({ result: "win", turnOrder: "second" })
  ]);
  const total = firstTotal + secondTotal;
  const wins = firstWins + secondWins;

  return {
    total,
    wins,
    winRate: calculateWinRate(wins, total),
    firstWinRate: calculateWinRate(firstWins, firstTotal),
    secondWinRate: calculateWinRate(secondWins, secondTotal)
  };
}

function isHomeDashboardData(value: unknown): value is HomeDashboardData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const dashboard = value as Partial<HomeDashboardData>;
  return Boolean(dashboard.summary && Array.isArray(dashboard.recent));
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

export const getInputEnabledEnvironments = cache(async () => {
  const environments = await getEnvironments();
  return environments.filter((environment) => environment.allow_match_input);
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

  return ((data ?? []) as DeckArchetype[]).filter((archetype) => !REMOVED_OTHER_ARCHETYPE_NAMES.has(archetype.name));
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

  return ((data ?? []) as unknown as ArchetypeWithAliases[]).filter(
    (archetype) => !REMOVED_OTHER_ARCHETYPE_NAMES.has(archetype.name)
  );
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

export async function getWeeklyReport(startDate: string) {
  const [isAdmin, archetypes] = await Promise.all([getIsAdmin(), getActiveArchetypes()]);

  if (!isAdmin) {
    return null;
  }

  const period = buildWeeklyPeriod(startDate);
  const previousPeriod = shiftWeeklyPeriod(period, -7);

  const [currentMatches, previousMatches] = await Promise.all([
    getWeeklyReportMatchesForPeriod(period.startIso, period.endIso),
    getWeeklyReportMatchesForPeriod(previousPeriod.startIso, previousPeriod.endIso)
  ]);

  return buildWeeklyReport(
    currentMatches,
    previousMatches,
    archetypes,
    period
  );
}

async function getWeeklyReportMatchesForPeriod(startIso: string, endIso: string) {
  const supabase = await createSupabaseServerClient();
  const pageSize = 1000;
  const matches: Match[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("matches")
      .select(WEEKLY_REPORT_MATCH_COLUMNS)
      .gte("played_at", startIso)
      .lte("played_at", endIso)
      .order("played_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    matches.push(...((data ?? []) as Match[]));

    if (!data || data.length < pageSize) {
      return matches;
    }
  }
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
