/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), cp = require('node:child_process');
const { base, hashes, changed, added, readCurrent, assertReviewed } = require('./environment-dashboard-v4-scope.cjs');
const git = args => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
test('v4 scope pins every reviewed change and addition; all previous SQL, RLS, grants, save actions, ordinary aggregates and dependencies remain byte-identical', () => {
  assert.deepEqual(Object.keys(hashes).sort(), [...changed, ...added].sort());
  for (const file of [...changed, ...added]) assertReviewed(file);
  const files = git(['ls-tree', '-r', '--name-only', base]).trim().split('\n').filter(f => /^(src|supabase)\//.test(f) || /^package(-lock)?\.json$/.test(f));
  for (const file of files) if (!changed.has(file)) assert.equal(readCurrent(file), git(['show', base + ':' + file]), file);
  assert.deepEqual(git(['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'supabase']).trim().split('\n').sort(), [...files.filter(f => /^(src|supabase)\//.test(f)), ...added].sort());
  assert.match(readCurrent('src/lib/environment-dashboard-data.ts'), /get_environment_dashboard_aggregates_v4/);
  assert.doesNotMatch(readCurrent('src/lib/environment-dashboard-data.ts'), /get_environment_dashboard_aggregates_v[123]/);
});
