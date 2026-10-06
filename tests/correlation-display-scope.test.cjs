/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {base,hashes,added,readBeforeDisplay}=require('./correlation-display-scope.cjs');
test('correlation presentation scope: all Tier, image persistence, SQL, RPC, aggregation and other production source unchanged',()=>{
 const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
 assert.deepEqual(Object.keys(hashes).sort(),['src/app/admin/creator/tier/[id]/correlation/page.tsx','src/components/creator/CorrelationArtwork.tsx','src/components/creator/CorrelationCanvas.tsx','src/components/creator/CorrelationEditor.tsx','src/components/creator/CorrelationObs.tsx','src/lib/creator/correlation-server.ts'].sort());
 const files=git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const file of files)assert.equal(readBeforeDisplay(file),git(['show',base+':'+file]),file);
 assert.deepEqual(git(['ls-files','--cached','--others','--exclude-standard','--','src','supabase']).trim().split('\n').sort(),[...files.filter(f=>/^(src|supabase)\//.test(f)),...added].sort());
});
