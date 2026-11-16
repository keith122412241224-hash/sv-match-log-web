/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
test('environment matrix changes only reviewed page, filter, renderer, guide and new pure module; all DB/auth/analysis/input/dependencies identical',()=>{
  const s=require('./environment-matrix-scope.cjs');
  const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
  const files=git('ls-tree','-r','--name-only',s.base).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
  assert.deepEqual(Object.keys(s.hashes).sort(),['src/app/matrix/page.tsx','src/app/guide/page.tsx','src/components/matrix/MatrixFilters.tsx','src/components/MatchupMatrix.tsx','src/lib/environment-matrix.ts'].sort());
  for(const f of Object.keys(s.hashes))s.assertReviewed(f);
  for(const f of files)assert.equal(s.readBeforeEnvironmentMatrix(f),git('show',s.base+':'+f),f);
  assert.deepEqual(git('ls-files','--cached','--others','--exclude-standard','--','src','supabase').trim().split('\n').sort(),[...files.filter(f=>/^(src|supabase)\//.test(f)),...s.added].sort());
});
