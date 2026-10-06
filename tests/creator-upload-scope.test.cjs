/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {base,hashes,added,readBeforeUpload}=require('./creator-upload-scope.cjs');
test('upload fix scope: only Tier upload preparation changes; API, DB, Storage, auth, dependencies and existing pages remain unchanged',()=>{
 const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
 assert.deepEqual(Object.keys(hashes),['src/components/creator/TierEditor.tsx']);
 const files=git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const file of files)assert.equal(readBeforeUpload(file),git(['show',base+':'+file]),file);
 const actual=git(['ls-files','--cached','--others','--exclude-standard','--','src','supabase']).trim().split('\n').sort();assert.deepEqual(actual,[...files.filter(f=>/^(src|supabase)\//.test(f)),...added].sort());
});
