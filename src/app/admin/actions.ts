"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SuggestionStatus } from "@/types/database";

export async function createArchetype(formData: FormData) {
  const supabase = await requireAdminClient();
  const payload = readArchetypeForm(formData);

  if (!payload.name || !payload.class_name) {
    return;
  }

  await supabase.from("deck_archetypes").insert(payload);
  revalidateAdminPaths();
  redirect("/admin?notice=created");
}

export async function createEnvironment(formData: FormData) {
  const supabase = await requireAdminClient();
  const user = await requireAdminUser();
  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();

  if (!name) {
    return;
  }

  await supabase.from("environments").insert({
    user_id: user.id,
    name,
    start_date: startDate || null
  });
  revalidateAdminPaths();
  redirect("/admin?notice=environment_created");
}

export async function updateEnvironmentsBatch(formData: FormData) {
  const supabase = await requireAdminClient();
  const ids = formData.getAll("environment_ids").map((value) => String(value));

  const updates = ids.flatMap((id) => {
    const name = String(formData.get(`name_${id}`) ?? "").trim();
    const startDate = String(formData.get(`start_date_${id}`) ?? "").trim();

    if (!id || !name) {
      return [];
    }

    return {
      id,
      payload: {
        name,
        start_date: startDate || null
      }
    };
  });

  await Promise.all(
    updates.map(({ id, payload }) => supabase.from("environments").update(payload).eq("id", id))
  );
  revalidateAdminPaths();
  redirect("/admin?notice=environments_updated");
}

export async function updateArchetype(formData: FormData) {
  const supabase = await requireAdminClient();
  const id = String(formData.get("id") ?? "");
  const payload = readArchetypeForm(formData);

  if (!id || !payload.name || !payload.class_name) {
    return;
  }

  await supabase.from("deck_archetypes").update(payload).eq("id", id);
  revalidateAdminPaths();
  redirect("/admin?notice=updated");
}

export async function updateArchetypesBatch(formData: FormData) {
  const supabase = await requireAdminClient();
  const ids = formData.getAll("archetype_ids").map((value) => String(value));

  const updates = ids.flatMap((id) => {
    const name = String(formData.get(`name_${id}`) ?? "").trim();
    const className = String(formData.get(`class_name_${id}`) ?? "").trim();
    const sortOrder = Number(formData.get(`sort_order_${id}`) ?? 0);

    if (!id || !name || !className) {
      return [];
    }

    return {
      id,
      payload: {
        class_name: className,
        name,
        is_active: formData.get(`is_active_${id}`) === "on",
        is_other: formData.get(`is_other_${id}`) === "on",
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 0
      }
    };
  });

  await Promise.all(
    updates.map(({ id, payload }) => supabase.from("deck_archetypes").update(payload).eq("id", id))
  );
  revalidateAdminPaths();
  redirect("/admin?notice=batch_updated");
}

export async function deactivateArchetype(id: string) {
  const supabase = await requireAdminClient();
  const archetypeId = String(id ?? "");

  if (!archetypeId) {
    return;
  }

  await supabase.from("deck_archetypes").update({ is_active: false }).eq("id", archetypeId);
  revalidateAdminPaths();
  redirect("/admin?notice=deactivated");
}

export async function updateSuggestionStatus(formData: FormData) {
  const supabase = await requireAdminClient();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as SuggestionStatus;

  if (!id || !["pending", "approved", "rejected"].includes(status)) {
    return;
  }

  await supabase.from("deck_suggestions").update({ status }).eq("id", id);
  revalidateAdminPaths();
  redirect("/admin?notice=suggestion_updated");
}

export async function approveSuggestionAsArchetype(formData: FormData) {
  const supabase = await requireAdminClient();
  const suggestionId = String(formData.get("suggestion_id") ?? "");
  const className = String(formData.get("class_name") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  if (!suggestionId || !className || !name) {
    return;
  }

  await supabase.from("deck_archetypes").insert({
    class_name: className,
    name,
    is_active: true,
    is_other: false,
    sort_order: 0
  });
  await supabase.from("deck_suggestions").update({ status: "approved" }).eq("id", suggestionId);
  revalidateAdminPaths();
  redirect("/admin?notice=suggestion_approved");
}

function readArchetypeForm(formData: FormData) {
  const memo = String(formData.get("memo") ?? "").trim();
  const sortOrder = Number(formData.get("sort_order") ?? 0);

  return {
    class_name: String(formData.get("class_name") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    is_active: formData.get("is_active") === "on",
    is_other: formData.get("is_other") === "on",
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
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath("/decks");
  revalidatePath("/matrix");
  revalidatePath("/analysis");
}
