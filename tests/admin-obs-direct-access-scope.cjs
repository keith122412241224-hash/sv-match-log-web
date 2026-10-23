/* eslint-disable @typescript-eslint/no-require-imports */
const cp = require('node:child_process'), assert = require('node:assert/strict');
const base = 'ef5faae4ffc6433030067170b5c1604c3cdd2df5', file = 'src/app/admin/page.tsx';
const read = require('./admin-tools-cleanup-scope.cjs').readBeforeCleanup;
const before = () => cp.execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
function expected() {
  return before()
    .replace('import { getAdminNavigation }', 'import { ObsEnvironmentSettings } from "@/components/admin/ObsEnvironmentSettings";\nimport { getAdminNavigation }')
    .replace('import { ClassIcon }', 'import { selectInitialEnvironmentId } from "@/lib/environment-selection";\nimport { ClassIcon }')
    .replace('        </div>}', '          <ObsEnvironmentSettings environments={environments} initialEnvironment={selectInitialEnvironmentId(environments)} />\n        </div>}');
}
function assertReviewed() { assert.equal(read(file), expected(), 'only the two imports and existing OBS settings mount are permitted'); }
// Preserve all historical hash assertions after checking the complete current source.
function readBeforeDirectAccess(f) { if (f !== file) return read(f); assertReviewed(); return before(); }
module.exports = { base, file, read, assertReviewed, readBeforeDirectAccess };
