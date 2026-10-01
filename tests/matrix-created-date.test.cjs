/* eslint-disable @typescript-eslint/no-require-imports */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const { readBeforeRouteLoading } = require('./route-loading-scope.cjs');
const cp = require('node:child_process');

test('only matrix creation-date plumbing differs from the Production source', () => {
  const base = '7b1a7179ad79beea22d933c3c1ad716f93ec6295';
  const git = args => cp.execFileSync('git', ['-c', 'safe.directory='+process.cwd().replaceAll('\\','/'), ...args], {encoding:'utf8'}).replaceAll('\r\n','\n');
  const files = git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(f=>f.startsWith('src/'));
  // Save UX exceptions are narrowly guarded by global-pending-scope.test.cjs.
  const saveUx = new Set([...require('./rescue-scope.cjs').rescueSources,"src/app/page.tsx","src/app/analysis/page.tsx","src/app/matrix/page.tsx","src/app/actions.ts","src/app/admin/actions.ts","src/app/admin/page.tsx","src/app/guest/page.tsx","src/app/matches/page.tsx","src/components/admin/AdminEnvironmentTable.tsx","src/components/admin/CreateEnvironmentForm.tsx","src/lib/data.ts","src/types/database.ts","src/app/actions.ts", "src/components/GlobalPendingIndicator.tsx", "src/components/matches/QuickMatchForm.tsx"]);
  for (const file of files.filter(file => !saveUx.has(file))) {
    let current = readBeforeRouteLoading(file);
    if (file === 'src/app/matrix/page.tsx') current = current
      .replace('  const createdAtLabel = new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });\n\n','')
      .replace(' createdAtLabel={createdAtLabel}','');
    if (file === 'src/components/MatchupMatrix.tsx') current = current
      .replace('  createdAtLabel,\n','').replace('  createdAtLabel?: string;\n','')
      .replace('const createdAt = useMemo(\n    () => createdAtLabel ?? new Date().toLocaleDateString("ja-JP"),\n    [createdAtLabel]\n  );','const createdAt = useMemo(() => new Date().toLocaleDateString("ja-JP"), []);');
    assert.equal(current,git(['show',base+':'+file]),file);
  }
});
