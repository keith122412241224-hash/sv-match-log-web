/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs');
const base='3d9d12d';
const allowed=new Set([
  'src/app/admin/page.tsx','src/app/admin/weekly-report/page.tsx','src/app/auth/reset-password/page.tsx',
  'src/app/globals.css','src/app/guide/page.tsx','src/app/layout.tsx','src/app/login/page.tsx','src/app/page.tsx','src/app/privacy/page.tsx',
  'src/components/AppShell.tsx','src/components/MatchupMatrix.tsx','src/components/creator/CorrelationEditor.tsx',
  'src/components/creator/CorrelationList.tsx','src/components/creator/Creator.module.css','src/components/creator/ObsSetEditor.tsx',
  'src/components/creator/TierEditor.tsx','src/components/environment/EnvironmentTrendChart.tsx','src/components/environment/EnvironmentTrends.tsx','src/components/guest/GuestApp.tsx',
  'src/lib/report-png-snapshot.ts'
]);
test('theme scope leaves DB/RPC/auth/aggregation/OBS artwork/dependencies byte-identical',()=>{
  const files=cp.execFileSync('git',['ls-tree','-r','--name-only',base],{encoding:'utf8'}).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
  for(const file of files){if(allowed.has(file))continue;const before=cp.execFileSync('git',['show',base+':'+file],{maxBuffer:8e6}).toString().replaceAll('\r\n','\n');assert.equal(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'),before,file);}
});
