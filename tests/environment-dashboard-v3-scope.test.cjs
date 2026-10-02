/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {base,changed,added}=require('./environment-dashboard-v3-scope.cjs');
const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
test('Environment v3 changes only its own display/loading paths and adds one RPC; all old SQL, RLS, analysis, matrix and dependencies unchanged',()=>{
 const files=git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const f of files)if(!changed.has(f))assert.equal(require('./period-report-environment-scope.cjs').readBeforePeriodEnvironment(f),git(['show',base+':'+f]),f);
 const actual=git(['ls-files','--cached','--others','--exclude-standard','--','src','supabase']).trim().split('\n').sort();
 assert.deepEqual(actual,[...files.filter(f=>/^(src|supabase)\//.test(f)),...added,...require('./period-report-environment-scope.cjs').added].sort());
 const sql=fs.readFileSync([...added].find(f=>f.endsWith('.sql')),'utf8');
 assert.doesNotMatch(sql,/privacy_suppressed|\buser_id\b|\bcontributors\b|create or replace|\bdrop\b|\bpolicy\b/i);
 assert.equal((sql.match(/create function/gi)||[]).length,2);
 assert.match(sql,/is distinct from 'false'::jsonb/);assert.match(sql,/from public, anon, authenticated, service_role/);
 const loader=fs.readFileSync('src/lib/environment-dashboard-data.ts','utf8');assert.match(loader,/aggregates_v3/);assert.doesNotMatch(loader,/aggregates_v[12]/);
});
