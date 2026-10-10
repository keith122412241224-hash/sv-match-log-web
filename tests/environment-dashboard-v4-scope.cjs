/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const base = 'add5e11e696ef93edac9186f8b3942d29f6cea62';
const hashes = require('./fixtures/environment-dashboard-v4-source-hashes.json');
const changed = new Set([
  'src/app/admin/actions.ts', 'src/app/admin/obs/environment/page.tsx', 'src/app/api/environment/route.ts', 'src/app/environment/page.tsx',
  'src/components/admin/AdminEnvironmentTable.tsx', 'src/components/admin/CreateEnvironmentForm.tsx', 'src/components/admin/ObsEnvironmentSettings.tsx',
  'src/components/creator/CorrelationEditor.tsx', 'src/components/environment/EnvironmentData.tsx', 'src/components/environment/EnvironmentFilters.tsx',
  'src/components/environment/ObsEnvironmentView.tsx', 'src/lib/creator/matchup-data.ts', 'src/lib/environment-dashboard-data.ts',
  'src/lib/obs-environment-matchups.ts', 'src/types/database.ts',
]);
const added = new Set(['src/lib/environment-dashboard-period.ts', 'src/lib/environment-dashboard-v4.ts', 'supabase/migrations/20261010042525_environment_dashboard_v4.sql']);
function readCurrent(file) { return fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n'); }
function assertReviewed(file, source = readCurrent(file)) {
  assert.equal(createHash('sha256').update(source).digest('hex'), hashes[file], 'unreviewed Environment v4 change: ' + file);
}
// Historical guards still check their original snapshots. Only the explicitly
// reviewed, hash-pinned v4 changes are projected back to the preceding main.
function readBeforeV4(file) {
  const source = readCurrent(file);
  if (!changed.has(file)) return source;
  assertReviewed(file, source);
  return cp.execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
}
module.exports = { base, hashes, changed, added, readCurrent, assertReviewed, readBeforeV4 };
