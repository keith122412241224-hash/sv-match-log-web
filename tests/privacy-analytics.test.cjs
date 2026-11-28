/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { filterPageview } = require('../src/components/SiteAnalytics');

const origin = 'https://fixture.example';
function run(path, referrer = '', type = 'pageview') {
  global.window = { location: { origin } };
  global.document = { referrer };
  try {
    return filterPageview({ type, url: origin + path });
  } finally {
    delete global.window;
    delete global.document;
  }
}

test('measures fixed paths without query, fragment or custom event data', () => {
  assert.deepEqual(run('/analysis?email=synthetic%40example.test#token'), { type: 'pageview', url: origin + '/analysis' });
  assert.equal(run('/analysis', '', 'event'), null);
  assert.equal(run('/terms', 'https://search.example/').url, origin + '/terms');
});

test('omits auth, dynamic and unrecognized paths', () => {
  for (const path of ['/auth/confirm?code=fixture', '/login?message=fixture', '/auth/reset-password', '/admin', '/admin/obs/tier/fixture', '/synthetic%40example.test']) {
    assert.equal(run(path), null);
  }
});

test('omits events with potentially identifying referring URLs', () => {
  for (const ref of ['https://search.example/path', 'https://search.example/?code=fixture', origin + '/?token_hash=fixture', origin + '/#fixture', 'invalid']) {
    assert.equal(run('/privacy', ref), null);
  }
});
