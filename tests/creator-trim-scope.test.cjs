/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {base,hashes,added,readBeforeTrim}=require('./creator-trim-scope.cjs');
test('transparent trim scope: image delivery and intrinsic display frames only; all SQL, Auth, uploads, documents, aggregation and dependencies unchanged',()=>{
 const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
 assert.deepEqual(Object.keys(hashes).sort(),["src/app/admin/creator/images/[id]/route.ts","src/components/creator/ImageLibrary.tsx","src/lib/creator/model.ts","src/components/creator/TierArtwork.tsx","src/components/creator/TierCanvas.tsx","src/components/creator/Creator.module.css","src/lib/creator/png.ts"].sort());
 const files=git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const file of files)assert.equal(readBeforeTrim(file),git(['show',base+':'+file]),file);
 assert.deepEqual(git(['ls-files','--cached','--others','--exclude-standard','--','src','supabase']).trim().split('\n').sort(),[...files.filter(f=>/^(src|supabase)\//.test(f)),...added].sort());
});
