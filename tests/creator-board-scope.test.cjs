/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {base,hashes,added,readBeforeBoard}=require('./creator-board-scope.cjs');
test('creator board scope: only Creator UI/API/data adapter; all existing auth, SQL, RPC, aggregation and ordinary pages unchanged',()=>{
 const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
 const expected=['src/app/admin/creator/api/route.ts','src/app/admin/creator/tier/[id]/correlation/page.tsx','src/components/creator/CorrelationEditor.tsx','src/components/creator/Creator.module.css','src/components/creator/ImageLibrary.tsx','src/components/creator/TierArtwork.tsx','src/components/creator/TierCanvas.tsx','src/components/creator/TierEditor.tsx','src/lib/creator/correlation.ts','src/lib/creator/model.ts'];
 assert.deepEqual(Object.keys(hashes).sort(),expected.sort());
 const files=git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const f of files)assert.equal(readBeforeBoard(f),git(['show',base+':'+f]),f);
 assert.deepEqual(git(['ls-files','--cached','--others','--exclude-standard','--','src','supabase']).trim().split('\n').sort(),[...files.filter(f=>/^(src|supabase)\//.test(f)),...added].sort());
});
