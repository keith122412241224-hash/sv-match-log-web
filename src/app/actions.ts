"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GuestImportResult, StoredGuestMatch } from "@/lib/guest-storage";
import type { MatchResult, TurnOrder } from "@/types/database";

type CreateMatchResult = {
  ok: boolean;
  message?: string;
};

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
  const siteUrl = await getSiteUrl();

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
  const siteUrl = await getSiteUrl();

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
  const result = await saveMatchFromForm(formData, { revalidate: true });
  const nextAction = String(formData.get("next_action") ?? "home");

  if (!result.ok) {
    redirect(`/matches?error=${encodeURIComponent(result.message ?? "保存できませんでした。")}`);
  }

  if (nextAction === "continue") {
    redirect("/matches?saved=1");
  }

  redirect("/");
}

export async function createMatchInline(formData: FormData): Promise<CreateMatchResult> {
  return saveMatchFromForm(formData, { revalidate: false });
}

export async function importGuestMatches(formData: FormData): Promise<GuestImportResult> {
  const supabase = await createSupabaseServerClient();
  const user = await requireUser();
  const raw = String(formData.get("guest_matches_json") ?? "");
  const drafts = parseGuestMatches(raw).slice(0, 200);

  if (drafts.length === 0) {
    return { ok: false, importedIds: [], message: "取り込める戦績がありません。端末の戦績は保持しています。" };
  }

  const rows = [];
  const importedIds: string[] = [];
  let skippedCount = 0;
  const environmentIds = Array.from(new Set(drafts.map((draft) => draft.environment_id).filter(Boolean)));
  const { data: inputEnabledEnvironments, error: environmentError } = await supabase
    .from("environments")
    .select("id")
    .in("id", environmentIds)
    .eq("allow_match_input", true);
  if (environmentError) return { ok: false, importedIds: [], message: "環境を確認できませんでした。端末の戦績は保持しています。" };
  const inputEnabledEnvironmentIds = new Set((inputEnabledEnvironments ?? []).map((environment) => environment.id));
  const archetypeDecks = await ensureCompatDecksForGuestImport(
    supabase, user.id,
    drafts.flatMap((draft) => [draft.my_archetype_id, draft.opponent_archetype_id].filter((id): id is string => Boolean(id)))
  );

  for (const draft of drafts) {
    let myDeckId = draft.my_deck_id;
    let opponentDeckId = draft.opponent_deck_id;
    const myArchetypeId = draft.my_archetype_id ?? "";
    const opponentArchetypeId = draft.opponent_archetype_id ?? "";

    if (myArchetypeId) {
      myDeckId = archetypeDecks.get(myArchetypeId) ?? "";
    }

    if (opponentArchetypeId) {
      opponentDeckId = archetypeDecks.get(opponentArchetypeId) ?? "";
    }

    if (!myDeckId || !opponentDeckId || !inputEnabledEnvironmentIds.has(draft.environment_id)) {
      skippedCount += 1;
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
      played_at: toValidIsoString(draft.played_at)!
    });
    importedIds.push(draft.local_id!);
  }

  if (rows.length === 0) {
    return { ok: false, importedIds: [], message: skippedCount > 0 ? "入力停止中の環境、またはデッキ情報の問題で取り込めません。端末の戦績は保持しています。" : "取り込める戦績がありません。端末の戦績は保持しています。" };
  }

  const { error } = await supabase.from("matches").insert(rows);

  if (error) {
    return { ok: false, importedIds: [], message: "取り込みに失敗しました。端末の戦績は保持しています。" };
  }

  revalidatePath("/");
  return { ok: true, importedIds, message: `${rows.length}件を保存しました。未保存の戦績は端末に保持しています。` };
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

    const seen = new Set<string>();
    return parsed.filter((item): item is StoredGuestMatch => {
      const valid = (
        item &&
        typeof item === "object" &&
        typeof item.environment_id === "string" &&
        typeof item.my_deck_id === "string" &&
        typeof item.opponent_deck_id === "string" &&
        ["first", "second"].includes(item.turn_order) &&
        ["win", "lose"].includes(item.result) &&
        typeof item.played_at === "string" && toValidIsoString(item.played_at) !== null &&
        (item.my_archetype_id == null || typeof item.my_archetype_id === "string") &&
        (item.opponent_archetype_id == null || typeof item.opponent_archetype_id === "string") &&
        typeof item.local_id === "string" && item.local_id.length > 0 && !seen.has(item.local_id)
      );
      if (valid) seen.add(item.local_id);
      return valid;
    });
  } catch {
    return [];
  }
}

function toValidIsoString(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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

async function saveMatchFromForm(
  formData: FormData,
  { revalidate }: { revalidate: boolean }
): Promise<CreateMatchResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  let myDeckId = String(formData.get("my_deck_id") ?? "");
  let myArchetypeId = String(formData.get("my_archetype_id") ?? "");
  let opponentDeckId = String(formData.get("opponent_deck_id") ?? "");
  let opponentArchetypeId = String(formData.get("opponent_archetype_id") ?? "");
  const environmentId = String(formData.get("environment_id") ?? "");
  const turnOrder = String(formData.get("turn_order") ?? "") as TurnOrder;
  const result = String(formData.get("result") ?? "") as MatchResult;

  if (!user) {
    redirect("/login");
  }

  if (!environmentId || !["first", "second"].includes(turnOrder) || !["win", "lose"].includes(result)) {
    return { ok: false, message: "入力内容を確認してください。" };
  }

  if (!(await isEnvironmentInputEnabled(supabase, environmentId))) {
    return { ok: false, message: "この環境は戦績入力を停止しています。" };
  }

  const archetypeDecks = await ensureCompatDecksForSelectedArchetypes(
    supabase,
    user.id,
    [myArchetypeId, opponentArchetypeId].filter(Boolean)
  );

  if (myArchetypeId) {
    myDeckId = archetypeDecks.get(myArchetypeId) ?? "";
  } else if (myDeckId) {
    myArchetypeId = await findArchetypeForDeck(supabase, myDeckId);
  }

  if (opponentArchetypeId) {
    opponentDeckId = archetypeDecks.get(opponentArchetypeId) ?? "";
  } else if (opponentDeckId) {
    opponentArchetypeId = await findArchetypeForDeck(supabase, opponentDeckId);
  }

  if (!myDeckId || !opponentDeckId) {
    return { ok: false, message: "デッキ情報を保存できませんでした。" };
  }

  const { error } = await supabase.from("matches").insert({
    user_id: user.id,
    environment_id: environmentId,
    my_deck_id: myDeckId,
    opponent_deck_id: opponentDeckId,
    my_archetype_id: myArchetypeId || null,
    opponent_archetype_id: opponentArchetypeId || null,
    turn_order: turnOrder,
    result,
    played_at: new Date().toISOString()
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  if (revalidate) {
    revalidateMatchDerivedPaths();
  }

  return { ok: true };
}

async function ensureCompatDecksForSelectedArchetypes(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  archetypeIds: string[]
) {
  const uniqueArchetypeIds = Array.from(new Set(archetypeIds));
  const deckIdsByArchetypeId = new Map<string, string>();

  if (uniqueArchetypeIds.length === 0) {
    return deckIdsByArchetypeId;
  }

  const { data: archetypes } = await supabase
    .from("deck_archetypes")
    .select("id, name, class_name")
    .in("id", uniqueArchetypeIds)
    .eq("is_active", true);

  if (!archetypes || archetypes.length !== uniqueArchetypeIds.length) {
    return deckIdsByArchetypeId;
  }

  const archetypesToCreate = Array.from(new Map(archetypes.map((archetype) => [archetype.name, archetype])).values());

  await supabase.from("decks").upsert(
    archetypesToCreate.map((archetype) => ({
      user_id: userId,
      name: archetype.name,
      class_name: archetype.class_name,
      deck_type: "my_deck" as const,
      sort_order: 999
    })),
    { onConflict: "user_id,deck_type,name", ignoreDuplicates: true }
  );

  const { data: decks } = await supabase
    .from("decks")
    .select("id, name, class_name")
    .eq("user_id", userId)
    .eq("deck_type", "my_deck")
    .in(
      "name",
      archetypes.map((archetype) => archetype.name)
    );

  const decksByName = new Map((decks ?? []).map((deck) => [deck.name, deck]));

  for (const archetype of archetypes) {
    const deck = decksByName.get(archetype.name);
    if (deck && deck.class_name === archetype.class_name) {
      deckIdsByArchetypeId.set(archetype.id, deck.id);
    }
  }

  return deckIdsByArchetypeId;
}

async function isEnvironmentInputEnabled(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  environmentId: string
) {
  const { data } = await supabase
    .from("environments")
    .select("allow_match_input")
    .eq("id", environmentId)
    .maybeSingle();

  return data?.allow_match_input === true;
}

function revalidateMatchDerivedPaths() {
  revalidatePath("/");
  revalidatePath("/analysis");
  revalidatePath("/matrix");
}

function revalidateDeckPaths() {
  revalidatePath("/decks");
  revalidatePath("/matches");
  revalidatePath("/analysis");
  revalidatePath("/matrix");
}

async function getSiteUrl() {
  const requestHeaders = await headers();
  const host = firstHeaderValue(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"));
  const forwardedProtocol = firstHeaderValue(requestHeaders.get("x-forwarded-proto"));
  const protocol = forwardedProtocol ?? (host?.startsWith("localhost") ? "http" : "https");

  if (host) {
    return `${protocol}://${host}`;
  }

  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://sv-match-log-web.vercel.app").replace(/\/$/, "");
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

async function ensureCompatDecksForGuestImport(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  archetypeIds: string[]
) {
  const uniqueIds = [...new Set(archetypeIds)];
  const deckIds = new Map<string, string>();
  const archetypesById = new Map<string, { id: string; name: string; class_name: string }>();
  // Bound IN-query URLs even when all 200 matches use different decks.
  const batchSize = 100;
  for (let offset = 0; offset < uniqueIds.length; offset += batchSize) {
    const { data } = await supabase.from("deck_archetypes")
      .select("id, name, class_name").in("id", uniqueIds.slice(offset, offset + batchSize));
    for (const archetype of data ?? []) archetypesById.set(archetype.id, archetype);
  }

  // Unlike single-match input, imports retain readable inactive archetypes and
  // skip only unresolvable matches. Preserve the old first-seen name conflict rule.
  const archetypesByName = new Map<string, { name: string; class_name: string }>();
  for (const id of uniqueIds) {
    const archetype = archetypesById.get(id);
    if (archetype && !archetypesByName.has(archetype.name)) archetypesByName.set(archetype.name, archetype);
  }
  const decksByName = new Map<string, { id: string; name: string; class_name: string }>();
  async function readDecks(names: string[]) {
    for (let offset = 0; offset < names.length; offset += batchSize) {
      const { data, error } = await supabase.from("decks").select("id, name, class_name")
        .eq("user_id", userId).eq("deck_type", "my_deck").in("name", names.slice(offset, offset + batchSize));
      if (error) return false;
      for (const deck of data ?? []) decksByName.set(deck.name, deck);
    }
    return true;
  }
  if (!(await readDecks([...archetypesByName.keys()]))) return deckIds;
  const missing = [...archetypesByName.values()].filter((archetype) => !decksByName.has(archetype.name));
  if (missing.length > 0) {
    await supabase.from("decks").upsert(
      missing.map((archetype) => ({
        user_id: userId, name: archetype.name, class_name: archetype.class_name,
        deck_type: "my_deck" as const, sort_order: 999
      })),
      { onConflict: "user_id,deck_type,name", ignoreDuplicates: true }
    );
    // Read the persisted IDs, including rows another request created concurrently.
    // As before, only resolvable matches are imported even if deck creation fails.
    await readDecks(missing.map((archetype) => archetype.name));
  }

  for (const [id, archetype] of archetypesById) {
    const deck = decksByName.get(archetype.name);
    if (deck && deck.class_name === archetype.class_name) deckIds.set(id, deck.id);
  }
  return deckIds;
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
