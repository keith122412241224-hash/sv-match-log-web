/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {base,hashes,added,readBeforeUX}=require('./creator-ux-scope.cjs');
test('UX scope: only creator presentation/API and additive migration; prior schema, RLS, aggregates, dependencies untouched',()=>{
 const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
 assert.deepEqual(Object.keys(hashes).sort(),['src/app/admin/creator/api/route.ts','src/components/creator/CorrelationArtwork.tsx','src/components/creator/CorrelationEditor.tsx','src/components/creator/Creator.module.css','src/components/creator/ImageLibrary.tsx','src/components/creator/TierEditor.tsx','src/lib/creator/correlation-server.ts','src/lib/creator/correlation.ts'].sort());
 const files=git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const file of files)assert.equal(readBeforeUX(file),git(['show',base+':'+file]),file);
 const actual=git(['ls-files','--cached','--others','--exclude-standard','--','src','supabase']).trim().split('\n').sort();assert.deepEqual(actual,[...files.filter(f=>/^(src|supabase)\//.test(f)),...added].sort());
});
