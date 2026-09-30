/* eslint-disable @typescript-eslint/no-require-imports */
// Dedicated unlinked E1.2 stack. Never reads a remote connection string.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),local=path.join(root,'build/e12-local');
fs.mkdirSync(path.join(local,'supabase/migrations'),{recursive:true});
if(fs.existsSync(path.join(local,'supabase/.temp/project-ref')))throw Error('Refusing linked project');
const config=fs.readFileSync(path.join(root,'supabase/config.toml'),'utf8').replace(/^project_id = .*$/m,'project_id = "sv-match-log-e12"').replace(/\b543(\d\d)\b/g,'573$1').replace(/^enable_anonymous_sign_ins = false$/m,'enable_anonymous_sign_ins = true');
fs.writeFileSync(path.join(local,'supabase/config.toml'),config);
for(const file of fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')))fs.copyFileSync(path.join(root,'supabase/migrations',file),path.join(local,'supabase/migrations',file));
fs.mkdirSync(path.join(root,'build/e12'),{recursive:true});console.log('E1.2 localhost API 57321 / DB 57322; unlinked');
