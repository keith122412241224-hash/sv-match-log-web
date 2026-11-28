import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authSiteOrigin } from "@/lib/auth-config";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  const origin = authSiteOrigin();
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") === "/auth/reset-password" ? "/auth/reset-password" : "/";
  const failure = () => {
    console.info("auth.confirm rejected");
    return finish(`${origin}/login?message=${encodeURIComponent("ログインリンクを確認できませんでした")}`);
  };
  if (searchParams.has("error") || searchParams.has("error_code") || (code && tokenHash)) return failure();
  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return finish(`${origin}${next}`);
    }
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash
    });

    if (!error) {
      return finish(`${origin}${next}`);
    }
  }

  return failure();
}

function finish(location: string) {
  const response = NextResponse.redirect(location);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
