/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertEnvironmentCache } = require('./environment-cache-contract.cjs');

test('Environment cache audit accepts equivalent Vary lists and Next.js additions', () => {
  for (const vary of ['Cookie', 'rsc, Cookie, next-router-state-tree',
    ' COOKIE , RSC ', ['next-router-prefetch', 'cookie'], 'cookie, COOKIE']) {
    assertEnvironmentCache({ 'cache-control': 'private, no-store', vary });
  }
});

test('Environment cache audit rejects missing Cookie and misleading substrings', () => {
  for (const vary of [undefined, '', 'rsc', 'X-Cookie', 'Cookie2', '*']) {
    assert.throws(() => assertEnvironmentCache({ 'cache-control': 'private, no-store', vary }));
  }
});

test('Environment cache audit keeps private no-store mandatory', () => {
  for (const value of [undefined, 'public, max-age=60', 'private', 'no-store']) {
    assert.throws(() => assertEnvironmentCache({ 'cache-control': value, vary: 'Cookie' }));
  }
});
