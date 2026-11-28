/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServerClient } = require('@supabase/ssr');
const { NextRequest } = require('next/server');
const nextHeaders = require('next/headers');
const { middleware } = require('../src/middleware');
const { GET } = require('../src/app/auth/confirm/route');

const api = 'https://fixture.supabase.test';
const site = 'https://app.test';
const session = {
  access_token: 'fixture-access',
  refresh_token: 'fixture-refresh',
  token_type: 'bearer',
  expires_in: 3600,
  user: { id: 'fixture-user' }
};

// Node runs each test file in its own process. All Auth responses are local fixtures.
process.env.NEXT_PUBLIC_SUPABASE_URL = api;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fixture-key';
process.env.NEXT_PUBLIC_SITE_URL = site;

async function loginRequest(t, oldSession, { pathname = '/auth/confirm', startOAuth = true, exchangeError } = {}) {
  const request = new NextRequest(site + pathname + '?code=fixture');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(input);
    assert.equal(url.origin, api);
    if (url.pathname === '/auth/v1/user') {
      calls.push('getUser');
      return oldSession === 'revoked'
        ? Response.json({ error_code: 'session_not_found', message: 'fixture' }, { status: 403 })
        : Response.json(session.user);
    }
    assert.equal(url.pathname, '/auth/v1/token');
    const grant = url.searchParams.get('grant_type');
    calls.push(grant);
    if (grant === 'pkce') {
      assert.ok(JSON.parse(init.body).code_verifier);
      if (exchangeError) return Response.json({ error_code: exchangeError, message: 'fixture' }, { status: 400 });
    }
    return Response.json(session);
  });
  const cookies = request.cookies;
  const sdk = createServerClient(api, 'fixture-key', { cookies: {
    getAll: () => cookies.getAll(),
    setAll: changes => changes.forEach(({ name, value }) => cookies.set(name, value))
  } });
  if (oldSession !== 'none') {
    const previous = await sdk.auth.signInWithPassword({ email: 'fixture@example.test', password: 'fixture' });
    assert.equal(previous.error, null);
  }
  if (startOAuth) {
    const start = await sdk.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: site + '/auth/confirm' } });
    assert.equal(start.error, null);
    assert.ok(cookies.getAll().some(({ name, value }) => name.endsWith('-code-verifier') && value));
  }
  calls.length = 0;
  await middleware(request);
  t.mock.method(nextHeaders, 'cookies', async () => cookies);
  return { request, calls };
}

for (const state of ['none', 'valid', 'revoked']) {
  test(`one Google callback exchanges its code with a ${state} previous session`, async t => {
    const { request, calls } = await loginRequest(t, state);
    const response = await GET(request);
    assert.equal(response.headers.get('location'), site + '/');
    assert.deepEqual(calls, ['pkce']);
  });
}

test('missing PKCE verifier still rejects the callback before contacting Auth', async t => {
  const { request, calls } = await loginRequest(t, 'none', { startOAuth: false });
  const response = await GET(request);
  assert.equal(new URL(response.headers.get('location')).pathname, '/login');
  assert.deepEqual(calls, []);
});

for (const error of ['validation_failed', 'flow_state_expired', 'flow_state_not_found']) {
  test(`Auth rejection ${error} still ends at login`, async t => {
    const { request, calls } = await loginRequest(t, 'none', { exchangeError: error });
    const response = await GET(request);
    assert.equal(new URL(response.headers.get('location')).pathname, '/login');
    assert.deepEqual(calls, ['pkce']);
  });
}

for (const pathname of ['/auth/reset-password', '/matches', '/admin']) {
  test(`middleware still checks the previous session on ${pathname}`, async t => {
    const { calls } = await loginRequest(t, 'revoked', { pathname, startOAuth: false });
    assert.deepEqual(calls, ['getUser']);
  });
}
