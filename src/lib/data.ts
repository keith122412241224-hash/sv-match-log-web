import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DeckArchetype, Environment } from "@/types/database";
import type { ArchetypeWithAliases, Deck, MatchWithRelations } from "@/types/view-models";

export async function getDecks() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("decks")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as Deck[];
}

export async function getMatches(environmentId?: string) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("matches")
    .select("*, environment:environments(*), my_deck:decks!matches_my_deck_id_fkey(*), opponent_deck:decks!matches_opponent_deck_id_fkey(*), my_archetype:deck_archetypes!matches_my_archetype_id_fkey(*), opponent_archetype:deck_archetypes!matches_opponent_archetype_id_fkey(*)")
    .order("played_at", { ascending: false });

  if (environmentId) {
    query = query.eq("environment_id", environmentId);
  }

  const { data, error } = await query;

  if (error) {
    let fallbackQuery = supabase
      .from("matches")
      .select("*, my_deck:decks!matches_my_deck_id_fkey(*), opponent_deck:decks!matches_opponent_deck_id_fkey(*)")
      .order("played_at", { ascending: false });

    if (environmentId) {
      fallbackQuery = fallbackQuery.eq("environment_id", environmentId);
    }

    const fallback = await fallbackQuery;

    return (fallback.data ?? []) as unknown as MatchWithRelations[];
  }

  return (data ?? []) as unknown as MatchWithRelations[];
}

export async function getEnvironments() {
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
}

export async function getActiveArchetypes() {
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
}

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

export async function getIsAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  const { data, error } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  return !error && Boolean(data);
}
