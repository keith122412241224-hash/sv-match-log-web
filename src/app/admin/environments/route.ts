import { NextRequest, NextResponse } from "next/server";
import { createEnvironment, updateEnvironmentsBatch, checkEnvironmentsBatch } from "@/app/admin/actions";

export async function POST(request: NextRequest) {
  // Native POST forms need the same origin protection as Server Actions.
  const origin = request.headers.get("origin");
  try {
    if (!origin || new URL(origin).host !== request.headers.get("host")) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const formData = await request.formData();
  const operation = formData.get("operation");
  const json = request.headers.get("accept")?.includes("application/json") && operation !== "create";
  if (operation !== "create" && operation !== "update" && !(json && operation === "check")) {
    return new NextResponse("Invalid operation", { status: 400 });
  }
  // Preserve the verified public origin rather than Next's internal hostname.
  const target = new URL("/admin", origin!);
  try {
    // Both actions retain their existing admin authorization and RLS checks.
    const result = operation === "create"
      ? await createEnvironment(formData, true)
      : operation === "check" ? await checkEnvironmentsBatch(formData) : await updateEnvironmentsBatch(formData, true);
    if (json) return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    target.searchParams.set("notice", result?.notice ?? "environments_update_failed");
    if (result?.error) target.searchParams.set("error", result.error);
  } catch {
    if (json) return NextResponse.json({ error: "保存結果を確認できません。接続・管理者ログインを確認してください。" }, { status: 503 });
    // GET /admin applies its normal authorization redirect if a session expired.
    target.searchParams.set("notice", "environments_update_failed");
  }
  return NextResponse.redirect(target, 303);
}
