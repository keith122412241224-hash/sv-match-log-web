/* eslint-disable @typescript-eslint/no-require-imports */
const cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='ae1d584c643d63d57b78d434b706d6d125c74a44';
const hashes=require('./fixtures/admin-batch-source-hashes.json');
const added=new Set(['src/lib/admin-batch.ts','src/lib/admin-batch-server.ts','src/components/admin/BatchUpdate.tsx']);
// Project only the byte-pinned Phase 1 patch for historical scope assertions.
// Behaviour and database tests always execute current product code.
function readBeforeAdminBatch(file){
 const source=require('./suggestion-maintenance-scope.cjs').readBeforeSuggestionMaintenance(file);
 if(!Object.hasOwn(hashes,file))return source;
 assert.equal(createHash('sha256').update(source).digest('hex'),hashes[file],'unreviewed batch update change: '+file);
 assert(!added.has(file),'new batch file has no historical source');
 return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
}
module.exports={base,hashes,added,readBeforeAdminBatch};
