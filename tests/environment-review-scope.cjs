/* eslint-disable @typescript-eslint/no-require-imports */
// Historical byte-for-byte tests compare the pre-feature version of each
// entrance only after verifying the complete current source. Runtime imports
// continue to load the live application.
const fs = require('node:fs');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const base = 'c9a2d3481405aca3f6b844ee23018cc22f263fbe';
const changed = new Map([
  ['src/app/admin/page.tsx', 'f75dbca474940e1186c411caae0d949d5922eb94fbde88df1742f9d3b47e785d'],
  ['src/app/environment/page.tsx', '01e9ce716945f976a3d2f04ef5676a52b98d3ddacae0d031b23d7dafc12e340e'],
  ['src/components/environment/EnvironmentFilters.tsx', '13708ef4981772a8da452cf040c6107f6f6aee701bd16e58b649adc5082aadda']
]);
const added = new Set([
  'supabase/migrations/20261126015443_environment_review_member_release.sql',
  'src/components/environment-review/MemberReleaseControls.tsx',
  'src/lib/environment-review/assessment-v3.ts',
  'src/lib/environment-review/guide-comparison.ts',
  'src/lib/environment-review/research-plan.ts',
  'src/lib/environment-review/judgment.ts',
  'src/lib/environment-review/method-v3.ts',
  'src/lib/environment-review/research-v3.ts',
  'supabase/migrations/20261124045000_environment_review_v3_manual.sql',
  'src/app/admin/environment-review/api/route.ts',
  'src/app/admin/environment-review/page.tsx',
  'src/app/api/environment/review/route.ts',
  'src/components/environment-review/ReviewEditor.tsx',
  'src/components/environment-review/ReviewReport.tsx',
  'src/components/environment-review/ReviewTab.tsx',
  'src/components/environment-review/ReviewWorkspace.tsx',
  'src/lib/environment-review/period-source.ts',
  'src/lib/environment-review/data-model.ts',
  'src/lib/environment-review/evaluation-v1.ts',
  'src/lib/environment-review/evidence-v2.ts',
  'src/lib/environment-review/policy-v2.ts',
  'supabase/migrations/20261124025218_environment_review_v2_publication.sql',
  'supabase/migrations/20261124025343_environment_review_source_v2.sql',
  'src/lib/environment-review/evaluation.ts',
  'src/lib/environment-review/metrics.ts',
  'src/lib/environment-review/publication.ts',
  'src/lib/environment-review/snapshot.ts',
  'src/lib/environment-review/workflow.ts',
  'supabase/migrations/20261124014618_environment_review_snapshot.sql',
  'supabase/migrations/20261124014639_environment_review.sql'
]);
const before = new Map();
function readBeforeReview(file, source = fs.readFileSync(file, 'utf8')) {
  const normalized = source.replaceAll('\r\n', '\n');
  if (!changed.has(file)) return normalized;
  assert.equal(createHash('sha256').update(normalized).digest('hex'), changed.get(file), 'unreviewed theme change or environment review entrance: ' + file);
  if (!before.has(file)) before.set(file, cp.execFileSync('git', ['show', base + ':' + file], {encoding:'utf8'}).replaceAll('\r\n', '\n'));
  return before.get(file);
}
function historicalFiles(files, ref) {
  return files.filter(file => {
    if (added.has(file)) return false;
    if (!ref || !changed.has(file)) return true;
    const original = readBeforeReview(file);
    const old = cp.spawnSync('git', ['show', ref + ':' + file], {encoding:'utf8'});
    return old.status !== 0 || original !== old.stdout.replaceAll('\r\n', '\n');
  });
}
module.exports = {readBeforeReview, historicalFiles, added, changed};
