/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), Module = require('node:module');
const originalLoad = Module._load;
const calls = [];
let authenticated = true;
Module._load = function(name, ...args) {
  if (name === 'next/headers') return { headers: async () => { throw Error('Email redirects must never read request headers'); } };
  if (name === 'next/navigation') return { redirect: path => { throw Error('redirect:' + path); } };
  if (name === 'next/cache') return { revalidatePath() {} };
  if (name === '@/lib/supabase/server') return { createSupabaseServerClient: async () => ({ auth: {
    signUp: async payload => { calls.push(payload.options.emailRedirectTo); return { error: null }; },
    resetPasswordForEmail: async (_, options) => { calls.push(options.redirectTo); return { error: null }; },
    exchangeCodeForSession: async () => ({ error: authenticated ? null : { message: 'invalid' } }),
    verifyOtp: async () => ({ error: authenticated ? null : { message: 'invalid' } })
  } }) };
  return originalLoad.call(this, name, ...args);
};
const { signUpWithPassword, sendPasswordReset } = require('../src/app/actions.ts');
const { GET } = require('../src/app/auth/confirm/route.ts');
Module._load = originalLoad;
const form = () => { const f = new FormData(); f.set('email', 'test@example.test'); f.set('password', 'local-test-password'); return f; };

test('signup and password-reset email links use only the configured trusted origin', async () => {
  const old = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    for (const [configured, expected] of [
      ['https://sv-match-log-web.vercel.app/', 'https://sv-match-log-web.vercel.app'],
      ['http://localhost:3302', 'http://localhost:3302'],
      [undefined, 'https://sv-match-log-web.vercel.app']
    ]) {
      if (configured === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = configured;
      calls.length = 0;
      await assert.rejects(signUpWithPassword(form()), /redirect:\/login/);
      await assert.rejects(sendPasswordReset(form()), /redirect:\/login/);
      assert.deepEqual(calls, [expected + '/auth/confirm', expected + '/auth/confirm?next=/auth/reset-password']);
    }
    for (const url of ['', 'javascript:alert(1)', 'https://user:pass@example.test', 'http://example.test',
      'https://example.test/path', 'https://example.test/?next=evil', 'https://example.test/#fragment', 'http://localhost.evil.test']) {
      process.env.NEXT_PUBLIC_SITE_URL = url; calls.length = 0;
      await assert.rejects(signUpWithPassword(form()));
      await assert.rejects(sendPasswordReset(form()));
      assert.deepEqual(calls, [], 'invalid configuration must not send mail');
    }
  } finally { if (old === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = old; }
});

test('confirmation routes keep redirects on the request origin and reject failed credentials', async () => {
  const origin = 'https://sv-match-log-web.vercel.app';
  for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', '/\n/evil.example', '/auth/reset-password']) {
    const response = await GET(new Request(origin + '/auth/confirm?' + new URLSearchParams({ code: 'fixture-code', next })));
    assert.equal(new URL(response.headers.get('location')).origin, origin);
  }
  authenticated = false;
  for (const query of ['code=invalid', 'token_hash=invalid&type=recovery', '']) {
    const response = await GET(new Request(origin + '/auth/confirm?' + query));
    assert.equal(new URL(response.headers.get('location')).pathname, '/login');
  }
  authenticated = true;
});

test('patched runtime versions resolve consistently, including Next nested dependencies', () => {
  const { createRequire } = require('node:module');
  const next = createRequire(require.resolve('next/package.json'));
  assert.equal(require('next/package.json').version, '15.5.28');
  assert.equal(require('eslint-config-next/package.json').version, '15.5.28');
  assert.equal(require('react/package.json').version, '19.2.9');
  assert.equal(require('react-dom/package.json').version, '19.2.9');
  assert.equal(next('postcss/package.json').version, '8.5.23');
  assert.equal(next('sharp'), require('sharp'));
});
