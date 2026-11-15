/* eslint-disable @typescript-eslint/no-require-imports */
// Local files only; never links, resets, or contacts a hosted project.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
assert.equal(process.env.ENVIRONMENT_TRENDS_LOCAL, 'local-only');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'build/environment-trends-local');
const destination = path.join(out, 'local/supabase');
assert(!fs.existsSync(path.join(destination, '.temp/project-ref')), 'Linked projects are forbidden');
fs.mkdirSync(path.join(destination, 'migrations'), { recursive: true });
const config = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8')
  .replaceAll('\r\n', '\n')
  .replace(/^project_id = .*$/m, 'project_id = "svml-environment-trends-20261114"')
  .replace(/\b543(\d\d)\b/g, '163$1')
  .replace('inspector_port = 8083', 'inspector_port = 6283')
  .replace(/^enable_anonymous_sign_ins = false$/m, 'enable_anonymous_sign_ins = true');
assert(config.includes('port = 16321')); assert(/\[db.seed\][^[]*enabled = false/.test(config));
fs.writeFileSync(path.join(destination, 'config.toml'), config);
for (const name of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(n => n.endsWith('.sql')))
  fs.copyFileSync(path.join(root, 'supabase/migrations', name), path.join(destination, 'migrations', name));
console.log('Prepared unlinked local stack: API 127.0.0.1:16321, DB 127.0.0.1:16322.');
