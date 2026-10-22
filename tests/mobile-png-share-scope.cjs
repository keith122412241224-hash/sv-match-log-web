/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='b4e5631435bc36b4da3534ce6f008485fbb49ca0',hashes=require('./fixtures/mobile-png-share-source-hashes.json');
const added=new Set(['src/components/analysis/AnalysisPngPreview.tsx']);
const read=file=>fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
function assertReviewed(file){assert.ok(Object.hasOwn(hashes,file));assert.equal(createHash('sha256').update(read(file)).digest('hex'),hashes[file],'unreviewed mobile PNG: '+file);}
// Only historical byte guards receive the previous version after exact current-byte validation.
// Behaviour tests and browsers always execute the current implementation.
function readBeforeMobilePng(file){if(!Object.hasOwn(hashes,file))return read(file);assertReviewed(file);assert.ok(!added.has(file));return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');}
module.exports={base,hashes,added,read,assertReviewed,readBeforeMobilePng};
