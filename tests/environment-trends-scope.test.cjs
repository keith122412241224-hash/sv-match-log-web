/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), cp = require('node:child_process');
test('trends adds only its endpoint/chart/aggregation and preserves every unrelated product, old SQL, RLS and dependency byte', () => {
  const s = require('./environment-trends-scope.cjs');
  const git = (...args) => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
  const files = git('ls-tree', '-r', '--name-only', s.base).trim().split('\n').filter(f => /^(src|supabase)\//.test(f) || /^package(-lock)?\.json$/.test(f));
  const changed = ['src/app/environment/page.tsx', 'src/components/environment/EnvironmentFilters.tsx', 'src/components/DeckMultiSelectDialog.tsx'];
  assert.deepEqual(Object.keys(s.hashes).sort(), [...changed, ...s.added].sort());
  for (const f of Object.keys(s.hashes)) s.assertReviewed(f);
  for (const f of files) assert.equal(s.readBeforeTrends(f), git('show', s.base + ':' + f), f);
  assert.deepEqual(git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'supabase').trim().split('\n').sort(), [...files.filter(f => /^(src|supabase)\//.test(f)), ...s.added].sort());
});
