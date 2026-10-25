/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict');
const { base, hashes, readBeforeSaveStatus, git } = require('./match-save-status-scope.cjs');
test('save status changes only the three client files; API, SQL/RLS, guest, editing and dependencies are unchanged', () => {
  assert.deepEqual(Object.keys(hashes).sort(), [
    'src/components/matches/PendingMatchRecovery.tsx',
    'src/components/matches/QuickMatchForm.tsx',
    'src/lib/match-submission.ts'
  ]);
  const files = git('ls-tree', '-r', '--name-only', base).trim().split('\n')
    .filter(f => /^(src|supabase)\//.test(f) || /^package(-lock)?\.json$/.test(f));
  for (const file of files) assert.equal(readBeforeSaveStatus(file), git('show', base + ':' + file), file);
  assert.deepEqual(git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'supabase').trim().split('\n').sort(),
    [...files.filter(f => /^(src|supabase)\//.test(f)), ...require('./analysis-matchups-scope.cjs').added].sort());
});
