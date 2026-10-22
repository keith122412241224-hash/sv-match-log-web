/* eslint-disable @typescript-eslint/no-require-imports */
const cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='673600f7864bb03c885034add1d221c943af40ff',hashes=require('./fixtures/matrix-mobile-png-share-source-hashes.json');
const independent=require('./creator-independent-scope.cjs');
const added=new Set(['src/components/PngSharePreview.tsx','src/lib/matrix-png.ts',...independent.added]);
const read=file=>independent.readBeforeIndependent(file);
function assertReviewed(file){if(independent.added.has(file))return independent.assertReviewed(file);assert.ok(Object.hasOwn(hashes,file));assert.equal(createHash('sha256').update(read(file)).digest('hex'),hashes[file],'unreviewed matrix PNG change: '+file);}
// Only historical byte guards use this projection after exact current-byte validation.
// Rendering/behaviour/browser tests always execute the current implementation.
function readBeforeMatrixPng(file){if(!Object.hasOwn(hashes,file))return read(file);assertReviewed(file);assert.ok(!added.has(file));return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');}
module.exports={base,hashes,added,read,assertReviewed,readBeforeMatrixPng};
