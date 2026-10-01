/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), cp = require('node:child_process');
test('match entry UX preserves every other Production source, DB migration, API action and dependency', () => {
  const base = '1756a2e3432256b143a0a036a7c790e48bb59624';
  const git = args => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
  const allowed = new Set(['src/app/matches/page.tsx', 'src/components/matches/ScheduledMatchForm.tsx', 'src/components/matches/QuickMatchForm.tsx', 'src/components/matches/RankFields.tsx', 'src/components/guest/GuestApp.tsx']);
  for (const file of git(['ls-tree', '-r', '--name-only', base]).trim().split('\n').filter(f => /^(src|supabase)\//.test(f) || /^package(-lock)?\.json$/.test(f))) {
    if (!allowed.has(file)) assert.equal(fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n'), git(['show', base + ':' + file]), file);
  }
});
