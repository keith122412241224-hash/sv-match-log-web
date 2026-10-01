/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), local = path.join(root, 'build/ux-local');
fs.mkdirSync(path.join(local, 'supabase/migrations'), { recursive: true });
if (fs.existsSync(path.join(local, 'supabase/.temp/project-ref'))) throw Error('Refusing linked project');
const config = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8')
  .replace(/^project_id = .*$/m, 'project_id = "sv-match-log-environment-ux"')
  .replace(/\b543(\d\d)\b/g, '583$1').replace(/^enable_anonymous_sign_ins = false$/m, 'enable_anonymous_sign_ins = true');
fs.writeFileSync(path.join(local, 'supabase/config.toml'), config);
for (const file of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')))
  fs.copyFileSync(path.join(root, 'supabase/migrations', file), path.join(local, 'supabase/migrations', file));
fs.mkdirSync(path.join(root, 'build/ux-evidence'), { recursive: true });
console.log('Dedicated unlinked stack: localhost API 58321 / DB 58322');
