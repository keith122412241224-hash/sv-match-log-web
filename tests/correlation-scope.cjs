/* eslint-disable @typescript-eslint/no-require-imports */
const cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='d8ef73c';
const hashes=require('./fixtures/correlation-source-hashes.json');
const added=new Set([
 'src/app/admin/creator/tier/[id]/correlation/page.tsx',
 'src/app/admin/obs/correlation/[id]/page.tsx','src/app/admin/obs/set/[id]/page.tsx',
 'src/components/creator/CorrelationArtwork.tsx','src/components/creator/CorrelationCanvas.tsx',
 'src/components/creator/CorrelationEditor.tsx','src/components/creator/CorrelationObs.tsx',
 'src/components/creator/useUnsavedChanges.ts','src/lib/creator/correlation.ts','src/lib/creator/correlation-server.ts',
 'supabase/migrations/20261006032427_creator_correlations.sql', ...require('./creator-upload-scope.cjs').added
]);
function readBeforeCorrelation(file){
 const source=require('./creator-upload-scope.cjs').readBeforeUpload(file);
 if(!Object.hasOwn(hashes,file))return source;
 assert.equal(createHash('sha256').update(source).digest('hex'),hashes[file],'unreviewed correlation change: '+file);
 return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
}
module.exports={base,hashes,added,readBeforeCorrelation};
