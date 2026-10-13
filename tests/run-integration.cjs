/* eslint-disable @typescript-eslint/no-require-imports */
// node tests/run-integration.cjs
// PGLITE_MODULE may point to an existing local PGlite install. No remote DB URL.
// The first 17 files reproduce the audit's 34-test suite. The remaining two
// cover current environment permissions, Analysis date/API and batch results.
const fs = require('node:fs'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = [
  'analysis-rank', 'analysis-rpc', 'correlation', 'creator-matchups', 'creator-ux',
  'creator', 'environment-dashboard-v4', 'guest-import', 'matchup-rank',
  'matchup-rpc', 'obs-matchups', 'period-report-environment', 'period-report-rank',
  'period-report-rpc', 'rank-save', 'match-mutations', 'environment-dashboard-v4-admin',
  'environment-permissions', 'analysis-date', 'admin-batch'
].map(name => path.join(__dirname, name + '.integration.cjs'));
const env = {};
for (const [key, value] of Object.entries(process.env)) {
  if (/^(PATH|PATHEXT|SystemRoot|WINDIR|COMSPEC|TEMP|TMP|APPDATA|LOCALAPPDATA|USERPROFILE|HOMEDRIVE|HOMEPATH|ProgramFiles|ProgramFiles\(x86\)|ProgramW6432|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(key)) env[key] = value;
}
const installed = process.env.PGLITE_MODULE || path.join(root, 'build/migration-step2-baseline/tools/node_modules/@electric-sql/pglite');
env.PGLITE_MODULE = require.resolve(installed);
const output = path.join(root, 'build/qa2-006-test-maintenance');
fs.mkdirSync(output, { recursive: true });
const log = fs.openSync(path.join(output, 'db-after.log'), 'w');
const result = spawnSync(process.execPath, ['--require', path.join(__dirname, 'register.cjs'), '--test', '--test-concurrency=1', ...files], {
  cwd: root, env, windowsHide: true, timeout: 900000, stdio: ['ignore', log, log]
});
fs.closeSync(log);
const summary = { localOnly: true, engine: 'fresh in-memory PGlite per suite', files: files.map(f => path.basename(f)), exit: result.status, error: result.error?.message };
fs.writeFileSync(path.join(output, 'db-run.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
process.exitCode = result.status === 0 && !result.error ? 0 : 1;
