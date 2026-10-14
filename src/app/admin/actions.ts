"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jstInputToIso, readMatchInputWindow } from "@/lib/environment-input";
import { runAdminBatch } from "@/lib/admin-batch-server";
import { decideSuggestion, type SuggestionDecision } from "@/lib/suggestion-decision";

export async function createArchetype(formData: FormData) {
  const supabase = await requireAdminClient();
  const payload = readArchetypeForm(formData);

  if (!payload.name || !payload.class_name) {
    return;
  }

  const { error } = await supabase.from("deck_archetypes").insert(payload);

  if (error) {
    redirectAdminError("create_failed", error.message);
  }

  revalidateAdminPaths();
  redirect("/admin?notice=created");
}

export async function createEnvironment(formData: FormData, returnResult = false) {
  const supabase = await requireAdminClient();
  const user = await requireAdminUser();
  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();

  if (!name) {
    return;
  }

  let inputWindow;
  let dashboardEnd;
  try {
    dashboardEnd = jstInputToIso(String(formData.get("dashboard_end_at") ?? ""));
    inputWindow = readMatchInputWindow(String(formData.get("match_input_start_at") ?? ""), String(formData.get("match_input_end_at") ?? ""));
  } catch {
    return environmentResult(returnResult, "environment_create_failed", "入力日時を日本時間で正しく入力し、終了は開始より後に設定してください。");
  }

  const { error } = await supabase.from("environments").insert({
    user_id: user.id,
    name,
    start_date: startDate || null,
    allow_match_input: formData.get("allow_match_input") === "on",
    ...inputWindow,
    dashboard_end_at: dashboardEnd
  });

  if (error) {
    return environmentResult(returnResult, "environment_create_failed", error.message);
  }

  revalidateAdminPaths();
  return environmentResult(returnResult, "environment_created");
}

export async function updateEnvironmentsBatch(formData: FormData, returnResult = false) {
  const supabase = await requireAdminClient();
  const result = await runAdminBatch(supabase, "environment", formData);
  // Cache invalidation must not discard an already confirmed database outcome.
  try { revalidateAdminPaths(); } catch { /* The result remains authoritative; reload reads saved values. */ }
  if (returnResult) return result;
  if (result.error) redirectAdminError(result.notice, result.error);
  redirect(`/admin?notice=${result.notice}`);
}

export async function checkEnvironmentsBatch(formData: FormData) {
  return runAdminBatch(await requireAdminClient(), "environment", formData, true);
}

export async function deleteEnvironment(id: string) {
  const supabase = await requireAdminClient();
  const environmentId = String(id ?? "");

  if (!environmentId) {
    return;
  }

  const { error } = await supabase.from("environments").delete().eq("id", environmentId);

  revalidateAdminPaths();
  redirect(`/admin?notice=${error ? "environment_delete_failed" : "environment_deleted"}`);
}

export async function updateArchetype(formData: FormData) {
  const supabase = await requireAdminClient();
  const id = String(formData.get("id") ?? "");
  const payload = readArchetypeForm(formData);

  if (!id || !payload.name || !payload.class_name) {
    return;
  }

  const { error } = await supabase.from("deck_archetypes").update(payload).eq("id", id);

  if (error) {
    redirectAdminError("update_failed", error.message);
  }

  revalidateAdminPaths();
  redirect("/admin?notice=updated");
}

export async function updateArchetypesBatch(formData: FormData, returnResult = false) {
  const supabase = await requireAdminClient();
  const result = await runAdminBatch(supabase, "archetype", formData);
  // Cache invalidation must not discard an already confirmed database outcome.
  try { revalidateAdminPaths(); } catch { /* The result remains authoritative; reload reads saved values. */ }
  if (returnResult) return result;
  if (result.error) redirectAdminError(result.notice, result.error);
  redirect(`/admin?notice=${result.notice}`);
}

export async function checkArchetypesBatch(formData: FormData) {
  return runAdminBatch(await requireAdminClient(), "archetype", formData, true);
}

export async function deactivateArchetype(id: string) {
  const supabase = await requireAdminClient();
  const archetypeId = String(id ?? "");

  if (!archetypeId) {
    return;
  }

  const { error } = await supabase.from("deck_archetypes").update({ is_active: false }).eq("id", archetypeId);

  if (error) {
    redirectAdminError("deactivate_failed", error.message);
  }

  revalidateAdminPaths();
  redirect("/admin?notice=deactivated");
}

export async function updateSuggestionStatus(formData: FormData, returnResult = false) {
  const supabase = await requireAdminClient();
  return finishSuggestionDecision(await decideSuggestion(supabase, formData, "reject"), returnResult);
}

export async function approveSuggestionAsArchetype(formData: FormData, returnResult = false) {
  const supabase = await requireAdminClient();
  return finishSuggestionDecision(await decideSuggestion(supabase, formData, "approve"), returnResult);
}

function finishSuggestionDecision(result: SuggestionDecision, returnResult: boolean) {
  try { revalidateAdminPaths(); } catch { /* Preserve the confirmed transaction result. */ }
  if (returnResult) return result;
  if (["approved", "already_approved", "rejected", "already_rejected"].includes(result.status)) {
    redirect(`/admin?notice=${result.status.includes("approved") ? "suggestion_approved" : "suggestion_updated"}`);
  }
  redirectAdminError("suggestion_approve_failed", result.message);
}

function readArchetypeForm(formData: FormData) {
  const memo = String(formData.get("memo") ?? "").trim();
  const sortOrder = Number(formData.get("sort_order") ?? 0);

  return {
    class_name: String(formData.get("class_name") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    is_active: formData.get("is_active") === "on",
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    memo: memo || null
  };
}

async function requireAdminClient() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) {
    redirect("/");
  }

  return supabase;
}

async function requireAdminUser() {
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

  return user;
}

function revalidateAdminPaths() {
  revalidatePath("/environment");
  revalidatePath("/admin/obs/environment");
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath("/decks");
  revalidatePath("/matrix");
  revalidatePath("/analysis");
}

function redirectAdminError(code: string, message: string) {
  redirect(`/admin?notice=${encodeURIComponent(code)}&error=${encodeURIComponent(message)}`);
}

function environmentResult(returnResult: boolean, notice: string, error?: string) {
  if (returnResult) return { notice, error };
  if (error) redirectAdminError(notice, error);
  redirect(`/admin?notice=${encodeURIComponent(notice)}`);
}
