/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServerClient } = require('@supabase/ssr');
const { authFetch } = require('../src/lib/supabase/auth-fetch');

// Exercise real PKCE, auth-js persistence, SSR encoding/chunking and cookie reuse.
// Only the Auth HTTP responses and the browser cookie jar are synthetic.
for (const filtered of [false, true]) {
  test(`SSR cookie round trip with provider fields, filter=${filtered}`, async t => {
    const site = 'https://fixture.supabase.test';
    const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = site;
    t.after(() => {
      if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    });
    const jar = new Map();
    const providerFields = { provider_token: 'synthetic-google-access', provider_refresh_token: 'synthetic-google-refresh' };
    const user = { id: 'fixture-user', user_metadata: { description: 'x'.repeat(3500) } };
    const jwtPart = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const access = [jwtPart({ alg: 'HS256' }), jwtPart({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600 }), 'eA'].join('.');
    const grants = [];
    const transport = async (input, init) => {
      const url = new URL(input);
      assert.equal(url.origin, site);
      if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
      assert.equal(url.pathname, '/auth/v1/token');
      assert.equal(init.method, 'POST');
      if (filtered) assert.equal(init.cache, 'no-store');
      const grant = url.searchParams.get('grant_type');
      grants.push(grant);
      return Response.json({ access_token: access, refresh_token: 'supabase-' + grant,
        token_type: 'bearer', expires_in: 3600, user, ...providerFields });
    };
    t.mock.method(globalThis, 'fetch', transport);
    const client = () => createServerClient(site, 'public-test-key', {
      global: { fetch: filtered ? authFetch : transport },
      cookies: {
        getAll: () => Array.from(jar, ([name,value]) => ({ name, value })),
        setAll: changes => changes.forEach(({ name,value }) => value ? jar.set(name,value) : jar.delete(name))
      }
    });
    function checkSession(session, grant) {
      assert.equal(session.access_token, access);
      assert.equal(session.refresh_token, 'supabase-' + grant);
      assert.equal(session.user.id, user.id);
      for (const [key, value] of Object.entries(providerFields)) {
        assert.equal(Object.hasOwn(session, key), !filtered);
        assert.equal(JSON.stringify(session).includes(value), !filtered);
      }
    }
    function checkCookies(grant) {
      const chunks = [...jar.entries()].sort();
      assert.ok(chunks.length > 1);
      assert.ok(chunks.every(([name]) => /^sb-fixture-auth-token\.\d+$/.test(name)));
      const encoded = chunks.map(([,value]) => value).join('');
      assert.ok(encoded.startsWith('base64-'));
      checkSession(JSON.parse(Buffer.from(encoded.slice(7), 'base64url').toString()), grant);
    }
    const start = await client().auth.signInWithOAuth({ provider: 'google' });
    assert.equal(start.error, null);
    const exchange = await client().auth.exchangeCodeForSession('synthetic-code');
    assert.equal(exchange.error, null);
    checkSession(exchange.data.session, 'pkce');
    checkCookies('pkce');
    const nextRequest = client();
    checkSession((await nextRequest.auth.getSession()).data.session, 'pkce');
    const refresh = await nextRequest.auth.refreshSession();
    assert.equal(refresh.error, null);
    checkCookies('refresh_token');
    assert.deepEqual(grants, ['pkce','refresh_token']);
    assert.equal((await nextRequest.auth.signOut()).error, null);
    assert.equal(jar.size, 0);
  });
}
