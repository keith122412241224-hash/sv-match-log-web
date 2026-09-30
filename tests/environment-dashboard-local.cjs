/* eslint-disable @typescript-eslint/no-require-imports */
// Prepare a dedicated, unlinked local stack; never reuse the repository's existing stack.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const local = path.join(root, 'build/e1-local');
const baselineOnly = process.argv.includes('--baseline');
fs.mkdirSync(path.join(local, 'supabase/migrations'), { recursive: true });
if (fs.existsSync(path.join(local, 'supabase/.temp/project-ref'))) throw Error('Refusing linked project');
let config = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');
config = config.replace(/^project_id = .*$/m, 'project_id = "sv-match-log-e1-step2"')
  .replace(/\b543(\d\d)\b/g, '553$1')
  .replace(/^enable_anonymous_sign_ins = false$/m, 'enable_anonymous_sign_ins = true');
fs.writeFileSync(path.join(local, 'supabase/config.toml'), config);
for (const file of fs.readdirSync(path.join(root, 'supabase/migrations'))) {
  if (!file.endsWith('.sql') || (baselineOnly && file.includes('environment_dashboard'))) continue;
  fs.copyFileSync(path.join(root, 'supabase/migrations', file), path.join(local, 'supabase/migrations', file));
}
fs.mkdirSync(path.join(root, 'build/e1-evidence'), { recursive: true });
console.log('Dedicated local stack:', local, 'API 55321 / DB 55322; no remote link');
