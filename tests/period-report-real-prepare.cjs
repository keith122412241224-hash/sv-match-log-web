/* eslint-disable @typescript-eslint/no-require-imports */
// Creates a NEW, unlinked local stack only. Never resets or reuses another stack.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'build/period-real'),stack=path.join(out,'stack');
if(fs.existsSync(stack))throw Error('Dedicated stack already exists; inspect it rather than overwriting');
fs.mkdirSync(path.join(stack,'supabase/migrations'),{recursive:true});
const config=fs.readFileSync(path.join(root,'supabase/config.toml'),'utf8').replace(/^project_id = .*$/m,'project_id = "sv-match-log-period-real-20261002"').replace(/\b543(\d\d)\b/g,'593$1');
fs.writeFileSync(path.join(stack,'supabase/config.toml'),config);
const migration='20261002111149_period_report_environment_filter.sql';
const files=cp.execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src','supabase','tests','package.json','package-lock.json'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).sort();
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
fs.writeFileSync(path.join(out,'source-before.json'),JSON.stringify({branch:cp.execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim(),sha:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),files:Object.fromEntries(files.map(f=>[f,sha(f)])),project:'sv-match-log-period-real-20261002',api:'http://127.0.0.1:59321',dbHost:'127.0.0.1',dbPort:59322},null,2));
for(const file of fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')&&f!==migration))fs.copyFileSync(path.join(root,'supabase/migrations',file),path.join(stack,'supabase/migrations',file));
console.log('Prepared new unlinked stack with existing seven migrations; new migration withheld for before/after validation.');
