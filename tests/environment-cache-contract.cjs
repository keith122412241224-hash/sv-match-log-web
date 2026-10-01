/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');

// HTTP field names are case-insensitive; repeated Vary lines combine as a list.
function assertEnvironmentCache(headers) {
  assert.equal(headers['cache-control'], 'private, no-store');
  const values = Array.isArray(headers.vary) ? headers.vary : [headers.vary ?? ''];
  const tokens = new Set(values.flatMap(value => value.split(','))
    .map(value => value.trim().toLowerCase()).filter(Boolean));
  assert.ok(tokens.has('cookie'), 'Environment response must explicitly vary on Cookie');
}

module.exports = { assertEnvironmentCache };
