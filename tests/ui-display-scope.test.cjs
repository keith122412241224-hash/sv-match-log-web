/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {base,hashes,readBeforeUiDisplay}=require('./ui-display-scope.cjs');
test('UI cleanup changes only seven pinned presentation files; all RPC, SQL, types, filters and calculations stay byte-identical',()=>{
 const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
 const files=git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 assert.equal(Object.keys(hashes).length,7);
 for(const file of files)assert.equal(readBeforeUiDisplay(file),git(['show',base+':'+file]),file);
 assert.deepEqual(git(['ls-files','--cached','--others','--exclude-standard','--','src','supabase']).trim().split('\n').filter(f=>!require('./obs-environment-scope.cjs').added.has(f) && !require('./match-mutations-scope.cjs').added.has(f)).sort(),files.filter(f=>/^(src|supabase)\//.test(f)).sort(),'no unrelated new app or migration files');
});
