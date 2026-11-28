/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const { googleAuthEnabled } = require('../src/lib/auth-config');
const originalLoad = Module._load;
let providerUrl, calls = 0, exchanges = 0;
const originalCode = 'single-use-fixture';
Module._load = function (id, ...args) {
  if (id === 'next/navigation') return { redirect(location) { throw Object.assign(Error('redirect'), { location }); } };
  if (id === '@/lib/supabase/server') return { createSupabaseServerClient: async () => ({ auth: {
    signInWithOAuth: async ({ provider, options }) => {
      calls++;
      assert.equal(provider, 'google');
      assert.equal(options.redirectTo, 'https://sv-match-log-web.vercel.app/auth/confirm');
      return { data: { url: providerUrl }, error: null };
    },
    exchangeCodeForSession: async code => ({ error: ++exchanges === 1 && code === originalCode ? null : Error('unavailable') })
  } }) };
  return originalLoad.call(this, id, ...args);
};
const page = require('../src/app/login/page').default;
const { GET } = require('../src/app/auth/confirm/route');
Module._load = originalLoad;

function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (node && typeof node === 'object') return [node, ...flatten(node.props.children)];
  return [node];
}
async function googleForm(mode = 'login') {
  const nodes = flatten(await page({ searchParams: Promise.resolve({ mode }) }));
  const google = nodes.find(node => node?.type === 'form' && flatten(node).includes('Googleで続ける'));
  const email = nodes.findIndex(node => node?.type === 'form' && node.props['aria-labelledby'] === 'auth-heading');
  assert.ok(email >= 0);
  if (google) {
    assert.ok(flatten(google).some(node => node?.props?.className === 'google-signin-logo' && node.props['aria-hidden'] === 'true'));
    assert.ok(nodes.indexOf(google) < nodes.indexOf('または') && nodes.indexOf('または') < email);
  } else {
    assert.ok(!nodes.includes('または'));
  }
  return google;
}

test('only the signup notice on the login screen shows the mail instructions', async () => {
  const title = '確認メールをご確認ください';
  for (const [params, expected] of [
    [{ notice: 'confirm-email' }, true],
    [{}, false],
    [{ notice: 'other' }, false],
    [{ mode: 'signup', notice: 'confirm-email' }, false],
    [{ mode: 'reset', notice: 'confirm-email' }, false],
    [{ notice: 'confirm-email', message: 'other status' }, false]
  ]) {
    const nodes = flatten(await page({ searchParams: Promise.resolve(params) }));
    const status = nodes.find(node => node?.props?.role === 'status');
    assert.equal(flatten(status).includes(title), expected);
    if (params.message) assert.ok(flatten(status).includes(params.message));
  }
});

test('production pair, server-only flag and server action stay in agreement', async t => {
  const site = 'https://sv-match-log-web.vercel.app';
  const api = 'https://xbwxapwaadsrtckxewvx.supabase.co';
  const names = ['NEXT_PUBLIC_SITE_URL','NEXT_PUBLIC_SUPABASE_URL','VERCEL_ENV','SUPABASE_GOOGLE_AUTH_ENABLED'];
  const original = names.map(k => process.env[k]);
  t.after(() => names.forEach((k,i) => { if (original[i] === undefined) delete process.env[k]; else process.env[k]=original[i]; }));
  Object.assign(process.env, { NEXT_PUBLIC_SITE_URL: site, NEXT_PUBLIC_SUPABASE_URL: api, VERCEL_ENV: 'production' });
  delete process.env.SUPABASE_GOOGLE_AUTH_ENABLED;
  assert.equal(await googleForm(), undefined);
  process.env.SUPABASE_GOOGLE_AUTH_ENABLED = 'true';
  assert.ok(await googleForm('signup'));
  assert.equal(await googleForm('reset'), undefined);
  const start = (await googleForm()).props.action;
  providerUrl = api + '/auth/v1/authorize?' + new URLSearchParams({ provider: 'google', redirect_to: site+'/auth/confirm' });
  await assert.rejects(start(), e => e.location === providerUrl);
  providerUrl = 'https://untrusted.example/authorize';
  await assert.rejects(start(), e => e.location.startsWith('/login?'));
  process.env.SUPABASE_GOOGLE_AUTH_ENABLED = 'false';
  await assert.rejects(start(), e => e.location === '/login');
  assert.equal(calls, 2);
  process.env.SUPABASE_GOOGLE_AUTH_ENABLED = 'true';
  process.env.VERCEL_ENV = 'preview';
  assert.equal(googleAuthEnabled(), false);
  process.env.VERCEL_ENV = 'production';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://staging.example';
  assert.equal(googleAuthEnabled(), false);
});

test('callback keeps its configured origin, rejects cancellation and failed exchanges, and preserves recovery', async t => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  t.after(() => { if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL=previous; });
  process.env.NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3100';
  async function check(params, path) {
    const response = await GET(new Request('http://localhost:3100/auth/confirm?' + new URLSearchParams(params)));
    const url = new URL(response.headers.get('location'));
    assert.equal(url.origin, process.env.NEXT_PUBLIC_SITE_URL);
    assert.equal(url.pathname, path);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  }
  await check({ error:'access_denied' }, '/login');
  await check({ error:'server_error', code:originalCode }, '/login');
  await check({ code:originalCode, token_hash:'conflicting-fixture' }, '/login');
  assert.equal(exchanges, 0);
  await check({ code:originalCode, next:'/auth/reset-password' }, '/auth/reset-password');
  await check({ code:originalCode }, '/login');
  await check({ code:'expired-fixture' }, '/login');
});
