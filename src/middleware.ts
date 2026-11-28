import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { authFetch } from "@/lib/supabase/auth-fetch";
import type { CookieOptions } from "@supabase/ssr";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // The callback needs its PKCE verifier even if the previous session was revoked.
  if (request.nextUrl.pathname === "/auth/confirm") return response;

  if (request.headers.has("next-action") || request.headers.get("purpose") === "prefetch") {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: authFetch },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/matches/:path*", "/decks/:path*", "/analysis/:path*", "/matrix/:path*", "/environment/:path*", "/admin/:path*", "/auth/:path*"]
};
