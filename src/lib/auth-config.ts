const productionSite = "https://sv-match-log-web.vercel.app";
const productionApi = "https://xbwxapwaadsrtckxewvx.supabase.co";

export function authSiteOrigin() {
  // Use the same deployment configuration for email creation and callback completion.
  const url = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? productionSite);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be a trusted site origin");
  }
  return url.origin;
}

export function googleAuthEnabled() {
  if (process.env.SUPABASE_GOOGLE_AUTH_ENABLED !== "true") return false;
  const site = authSiteOrigin();
  const api = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (site === productionSite && api === productionApi) {
    return process.env.VERCEL_ENV === "production";
  }
  return !process.env.VERCEL_ENV && site === "http://127.0.0.1:3100"
    && api === "http://127.0.0.1:55321";
}

export function isGoogleAuthorizeUrl(value: string) {
  try {
    const target = new URL(value);
    return !target.username && !target.password && !target.hash
      && target.origin === new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin
      && target.pathname === "/auth/v1/authorize" && target.searchParams.get("provider") === "google"
      && target.searchParams.get("redirect_to") === `${authSiteOrigin()}/auth/confirm`;
  } catch {
    return false;
  }
}
