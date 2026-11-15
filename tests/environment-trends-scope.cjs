/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const base = 'b318f771a272a04bbfb8eef196401bcf21d7e21b';
const hashes = require('./fixtures/environment-trends-source-hashes.json');
const added = new Set([
  'src/app/api/environment/trends/route.ts', 'src/components/environment/EnvironmentTrends.tsx',
  'src/components/environment/EnvironmentTrendChart.tsx', 'src/lib/environment-trends.ts',
  'src/lib/environment-trend-data.ts', 'supabase/migrations/20261114104651_environment_trends.sql',
  'supabase/migrations/20261026111607_phase2a_minimize_database_privileges.sql',
  'supabase/migrations/20261114212352_environment_trends_rpc.sql',
  'supabase/operations/environment-trends/check-index.sql',
  'supabase/operations/environment-trends/disable-rpc.sql',
  'supabase/operations/environment-trends/drop-invalid-index.sql'
]);
const read = file => fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
function assertReviewed(file) {
  assert.ok(Object.hasOwn(hashes, file));
  assert.equal(createHash('sha256').update(read(file)).digest('hex'), hashes[file], 'unreviewed environment trends change: ' + file);
}
// Only historical byte guards use this projection. Runtime/SQL/browser tests use live code.
function readBeforeTrends(file) {
  if (!Object.hasOwn(hashes, file)) return read(file);
  assertReviewed(file); assert.ok(!added.has(file));
  return cp.execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
}
function excludeReviewedTrendChanges(files) {
  return files.filter(file => { if (!Object.hasOwn(hashes, file)) return true; assertReviewed(file); return false; });
}
module.exports = { base, hashes, added, read, assertReviewed, readBeforeTrends, excludeReviewedTrendChanges };
