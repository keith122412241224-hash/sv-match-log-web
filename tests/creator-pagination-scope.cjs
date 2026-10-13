/* eslint-disable @typescript-eslint/no-require-imports */
const cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='d8c8761efca522b156d4e6a1b247e654946b3601';
const hashes=require('./fixtures/creator-pagination-source-hashes.json');
const added=new Set(['src/lib/creator/pagination.ts','src/components/creator/CreatorPager.tsx',...require('./admin-batch-scope.cjs').added]);
// Historical scope guards alone see the previous snapshot, after checking every
// byte of the reviewed pagination patch. Runtime tests always use current code.
function readBeforeCreatorPagination(file){
 const source=require('./admin-batch-scope.cjs').readBeforeAdminBatch(file);
 if(!Object.hasOwn(hashes,file))return source;
 assert.equal(createHash('sha256').update(source).digest('hex'),hashes[file],'unreviewed Creator pagination change: '+file);
 assert(!added.has(file),'new pagination file has no historical source');
 return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
}
module.exports={base,hashes,added,readBeforeCreatorPagination};
