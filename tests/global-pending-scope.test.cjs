/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const replacements = require('./fixtures/global-pending-ux.json');

test('save UX leaves all other Production source, rank logic, persistence, RPC and migrations unchanged', () => {
  const base = '55a59474209434559d088300d45a33b35a19a0d4';
  const git = args => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
  const files = git(['ls-tree', '-r', '--name-only', base]).trim().split('\n')
    .filter(file => file.startsWith('src/') || file.startsWith('supabase/') || ['package.json', 'package-lock.json'].includes(file));
  // Scheduling changes are bounded by environment-schedule-scope.test.cjs.
  const scheduling = new Set(["src/app/page.tsx","src/app/analysis/page.tsx","src/app/matrix/page.tsx","src/app/actions.ts","src/app/admin/actions.ts","src/app/admin/page.tsx","src/app/guest/page.tsx","src/app/matches/page.tsx","src/components/admin/AdminEnvironmentTable.tsx","src/components/admin/CreateEnvironmentForm.tsx","src/lib/data.ts","src/types/database.ts"]);
  for (const file of files.filter(file => !scheduling.has(file))) {
    let current = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
    if (file === 'src/components/GlobalPendingIndicator.tsx') {
      assert.match(current, /const SAFETY_TIMEOUT_MS = 8000;/);
      continue; // Its timing and event behavior are exercised by global-pending.browser.cjs.
    }
    for (const [target, before, after] of [...replacements].reverse()) {
      if (file !== target) continue;
      assert.equal(current.split(after).length, 2, 'exact UX change only: ' + file);
      current = current.replace(after, before);
    }
    assert.equal(current, git(['show', base + ':' + file]), file);
  }
});
