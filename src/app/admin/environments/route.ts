import { NextRequest, NextResponse } from "next/server";
import { createEnvironment, updateEnvironmentsBatch } from "@/app/admin/actions";

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
  if (operation !== "create" && operation !== "update") {
    return new NextResponse("Invalid operation", { status: 400 });
  }
  // Preserve the verified public origin rather than Next's internal hostname.
  const target = new URL("/admin", origin!);
  try {
    // Both actions retain their existing admin authorization and RLS checks.
    const result = operation === "create"
      ? await createEnvironment(formData, true)
      : await updateEnvironmentsBatch(formData, true);
    target.searchParams.set("notice", result?.notice ?? "environments_update_failed");
    if (result?.error) target.searchParams.set("error", result.error);
  } catch {
    // GET /admin applies its normal authorization redirect if a session expired.
    target.searchParams.set("notice", "environments_update_failed");
  }
  return NextResponse.redirect(target, 303);
}
