"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StoredGuestMatch } from "@/lib/guest-storage";
import type { MatchResult, TurnOrder } from "@/types/database";

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createSupabaseServerClient();

  if (!email || !password) {
    redirect(`/login?message=${encodeURIComponent("メールアドレスとパスワードを入力してください")}`);
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}`);
  }

  redirect("/");
}

export async function signUpWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createSupabaseServerClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  if (!email || password.length < 6) {
    redirect(`/login?message=${encodeURIComponent("メールアドレスと6文字以上のパスワードを入力してください")}`);
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm`
    }
  });

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}`);
  }

  redirect(`/login?message=${encodeURIComponent("登録しました。確認メールが必要な設定の場合はメールを確認してください")}`);
}

export async function sendPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  if (!email) {
    redirect(`/login?message=${encodeURIComponent("メールアドレスを入力してください")}`);
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm?next=/auth/reset-password`
  });

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}`);
  }

  redirect(`/login?message=${encodeURIComponent("パスワード再設定メールを送信しました")}`);
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const supabase = await createSupabaseServerClient();

  if (password.length < 6) {
    redirect(`/auth/reset-password?message=${encodeURIComponent("6文字以上のパスワードを入力してください")}`);
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(`/auth/reset-password?message=${encodeURIComponent(error.message)}`);
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createDeck(formData: FormData) {
  const supabase = await requireAdminClient();
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const className = String(formData.get("class_name") ?? "").trim();
  const sortOrder = Number(formData.get("sort_order") ?? 0);

  if (!name || !className) {
    return;
  }

  await supabase.from("decks").insert({
    user_id: user.id,
    name,
    class_name: className,
    deck_type: "my_deck",
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0
  });

  revalidateDeckPaths();
}

export async function updateDeck(formData: FormData) {
  const supabase = await requireAdminClient();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const className = String(formData.get("class_name") ?? "").trim();
  const sortOrder = Number(formData.get("sort_order") ?? 0);

  if (!id || !name || !className) {
    return;
  }

  await supabase
    .from("decks")
    .update({ name, class_name: className, sort_order: Number.isFinite(sortOrder) ? sortOrder : 0 })
    .eq("id", id);

  revalidateDeckPaths();
}

export async function deleteDeck(id: string) {
  const supabase = await requireAdminClient();
  const deckId = String(id ?? "");

  if (!deckId) {
    return;
  }

  await supabase.from("decks").delete().eq("id", deckId);
  revalidateDeckPaths();
}

export async function createMatch(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const user = await requireUser();
  let myDeckId = String(formData.get("my_deck_id") ?? "");
  let myArchetypeId = String(formData.get("my_archetype_id") ?? "");
  let opponentDeckId = String(formData.get("opponent_deck_id") ?? "");
  let opponentArchetypeId = String(formData.get("opponent_archetype_id") ?? "");
  const environmentId = String(formData.get("environment_id") ?? "");
  const turnOrder = String(formData.get("turn_order") ?? "") as TurnOrder;
  const result = String(formData.get("result") ?? "") as MatchResult;
  const playedAt = String(formData.get("played_at") ?? "");
  const memo = String(formData.get("memo") ?? "").trim();
  const nextAction = String(formData.get("next_action") ?? "home");

  if (!environmentId || !["first", "second"].includes(turnOrder) || !["win", "lose"].includes(result)) {
    return;
  }

  if (!myDeckId && myArchetypeId) {
    myDeckId = await ensureCompatDeckForArchetype(supabase, user.id, myArchetypeId);
  }

  if (!opponentDeckId && opponentArchetypeId) {
    opponentDeckId = await ensureCompatDeckForArchetype(supabase, user.id, opponentArchetypeId);
  }

  if (!myArchetypeId && myDeckId) {
    myArchetypeId = await findArchetypeForDeck(supabase, myDeckId);
  }

  if (!opponentArchetypeId && opponentDeckId) {
    opponentArchetypeId = await findArchetypeForDeck(supabase, opponentDeckId);
  }

  if (!myDeckId || !opponentDeckId) {
    return;
  }

  await supabase.from("matches").insert({
    user_id: user.id,
    environment_id: environmentId || null,
    my_deck_id: myDeckId,
    opponent_deck_id: opponentDeckId,
    my_archetype_id: myArchetypeId || null,
    opponent_archetype_id: opponentArchetypeId || null,
    turn_order: turnOrder,
    result,
    played_at: playedAt ? new Date(playedAt).toISOString() : new Date().toISOString(),
    memo: memo || null
  });

  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath("/analysis");
  revalidatePath("/matrix");
  redirect(nextAction === "continue" ? "/matches?saved=1" : "/");
}

export async function importGuestMatches(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const user = await requireUser();
  const raw = String(formData.get("guest_matches_json") ?? "");
  const drafts = parseGuestMatches(raw).slice(0, 200);

  if (drafts.length === 0) {
    redirect("/");
  }

  const rows = [];

  for (const draft of drafts) {
    let myDeckId = draft.my_deck_id;
    let opponentDeckId = draft.opponent_deck_id;
    const myArchetypeId = draft.my_archetype_id ?? "";
    const opponentArchetypeId = draft.opponent_archetype_id ?? "";

    if (myArchetypeId) {
      myDeckId = await ensureCompatDeckForArchetype(supabase, user.id, myArchetypeId);
    }

    if (opponentArchetypeId) {
      opponentDeckId = await ensureCompatDeckForArchetype(supabase, user.id, opponentArchetypeId);
    }

    if (!myDeckId || !opponentDeckId || !draft.environment_id) {
      continue;
    }

    rows.push({
      user_id: user.id,
      environment_id: draft.environment_id,
      my_deck_id: myDeckId,
      opponent_deck_id: opponentDeckId,
      my_archetype_id: myArchetypeId || null,
      opponent_archetype_id: opponentArchetypeId || null,
      turn_order: draft.turn_order,
      result: draft.result,
      played_at: draft.played_at ? new Date(draft.played_at).toISOString() : new Date().toISOString(),
      memo: draft.memo || null
    });
  }

  if (rows.length > 0) {
    await supabase.from("matches").insert(rows);
  }

  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath("/analysis");
  revalidatePath("/matrix");
  redirect(`/?guest_imported=${rows.length}`);
}

export async function createDeckSuggestion(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const user = await requireUser();
  const className = String(formData.get("class_name") ?? "").trim();
  const suggestedName = String(formData.get("suggested_name") ?? "").trim();
  const memo = String(formData.get("memo") ?? "").trim();

  if (!className || !suggestedName) {
    return;
  }

  await supabase.from("deck_suggestions").insert({
    user_id: user.id,
    class_name: className,
    suggested_name: suggestedName,
    memo: memo || null,
    status: "pending"
  });

  revalidatePath("/decks");
}

function parseGuestMatches(raw: string): StoredGuestMatch[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is StoredGuestMatch => {
      return (
        item &&
        typeof item === "object" &&
        typeof item.environment_id === "string" &&
        typeof item.my_deck_id === "string" &&
        typeof item.opponent_deck_id === "string" &&
        ["first", "second"].includes(String(item.turn_order)) &&
        ["win", "lose"].includes(String(item.result)) &&
        typeof item.played_at === "string"
      );
    });
  } catch {
    return [];
  }
}

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

async function requireAdminClient() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase.from("admin_users").select("id").eq("user_id", user.id).maybeSingle();

  if (!data) {
    redirect("/");
  }

  return supabase;
}

function revalidateDeckPaths() {
  revalidatePath("/decks");
  revalidatePath("/matches");
  revalidatePath("/analysis");
  revalidatePath("/matrix");
}

async function ensureCompatDeckForArchetype(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  archetypeId: string
) {
  const { data: archetype } = await supabase
    .from("deck_archetypes")
    .select("name, class_name")
    .eq("id", archetypeId)
    .maybeSingle();

  if (!archetype) {
    return "";
  }

  const { data: existing } = await supabase
    .from("decks")
    .select("id")
    .eq("user_id", userId)
    .eq("name", archetype.name)
    .eq("class_name", archetype.class_name)
    .maybeSingle();

  if (existing?.id) {
    return existing.id as string;
  }

  const { data: created } = await supabase
    .from("decks")
    .insert({
      user_id: userId,
      name: archetype.name,
      class_name: archetype.class_name,
      deck_type: "my_deck",
      sort_order: 999
    })
    .select("id")
    .single();

  return (created?.id as string | undefined) ?? "";
}

async function findArchetypeForDeck(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  deckId: string
) {
  const { data: deck } = await supabase
    .from("decks")
    .select("name, class_name")
    .eq("id", deckId)
    .maybeSingle();

  if (!deck) {
    return "";
  }

  const { data: archetype } = await supabase
    .from("deck_archetypes")
    .select("id")
    .eq("name", deck.name)
    .eq("class_name", deck.class_name)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (archetype?.id as string | undefined) ?? "";
}
