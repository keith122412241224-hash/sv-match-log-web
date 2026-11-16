/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
test('responsive matrix changes only three reviewed UI files; all calculations, filters, auth, DB and dependencies stay exact',()=>{
  const s=require('./matrix-density-scope.cjs');
  const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
  assert.deepEqual(Object.keys(s.hashes).sort(),['src/app/matrix/page.tsx','src/components/AppShell.tsx','src/components/MatchupMatrix.tsx'].sort());
  const files=git('ls-tree','-r','--name-only',s.base).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
  for(const file of files)assert.equal(s.readBeforeDensity(file),git('show',s.base+':'+file),file);
  assert.deepEqual(git('ls-files','--cached','--others','--exclude-standard','--','src','supabase').trim().split('\n').sort(),files.filter(f=>/^(src|supabase)\//.test(f)).sort());
});
