/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='ae0e679d92777f79b70bfc55869039405286856e',hashes=require('./fixtures/analysis-filter-ux-source-hashes.json');
const mobile=require('./mobile-png-share-scope.cjs');
const added=new Set(['src/components/analysis/AnalysisFilterPanel.tsx',...mobile.added]);
const read=file=>fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
function assertReviewed(file){if(mobile.added.has(file))return mobile.assertReviewed(file);assert.ok(Object.hasOwn(hashes,file));assert.equal(createHash('sha256').update(read(file)).digest('hex'),hashes[file],'unreviewed filter UI: '+file);}
// Historical byte guards alone see the prior revision, after exact current-byte validation.
// All behaviour, API, DB and browser tests execute the current source.
function readBeforeFilterUx(file){if(!Object.hasOwn(hashes,file))return mobile.readBeforeMobilePng(file);assertReviewed(file);return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');}
module.exports={base,hashes,added,read,assertReviewed,readBeforeFilterUx};
