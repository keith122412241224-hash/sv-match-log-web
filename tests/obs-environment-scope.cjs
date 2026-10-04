/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const base = 'ad215c55460fa29da01f3f701e8dbd1b043c5d31';
const hashes = require('./fixtures/obs-source-hashes.json');
const changed = new Set(['src/app/admin/page.tsx', 'src/components/admin/AdminEnvironmentTable.tsx']);
const added = new Set(['src/lib/admin-navigation.ts', 'src/components/admin/ObsEnvironmentSettings.tsx', 'src/app/admin/obs/environment/page.tsx', 'src/components/environment/ObsEnvironmentView.tsx', 'src/components/environment/ObsEnvironmentView.module.css']);
for (const file of ['src/lib/obs-environment-matchups.ts', 'src/components/environment/ObsMatchupMatrix.tsx', 'src/components/environment/ObsMatchupMatrix.module.css', 'supabase/migrations/20261004022333_analysis_aggregates_v3_exclusive.sql']) added.add(file);
const read = file => fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
// Project only the reviewed UI edits back through the existing historical guards.
// This feature's separate scope test freezes every other existing source/SQL file.
function readBeforeObs(file) {
  const source = read(file);
  if (!changed.has(file)) return source;
  assert.equal(createHash('sha256').update(source).digest('hex'), hashes[file], 'unreviewed admin UI change: ' + file);
  return cp.execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
}
module.exports = { base, hashes, changed, added, read, readBeforeObs };
