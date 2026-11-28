// GoTrue stores the token response as the session. Remove upstream provider
// credentials before auth-js can put them into the SSR cookie or emit SIGNED_IN.
export const authFetch: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  const tokenEndpoint = new URL("/auth/v1/token", process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (url.origin !== tokenEndpoint.origin || url.pathname !== tokenEndpoint.pathname) {
    return fetch(input, init);
  }

  const response = await fetch(input, { ...init, cache: "no-store" });
  if (!response.ok) return response;

  const session = await response.json();
  delete session.provider_token;
  delete session.provider_refresh_token;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return Response.json(session, { status: response.status, headers });
};
