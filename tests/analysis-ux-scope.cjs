/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const deckUx=require('./deck-management-ux-scope.cjs');
const base='cb54d3c7d2b460cbc3ef7ca793314f2c3bb818f3',hashes={...require('./fixtures/analysis-ux-source-hashes.json'),...deckUx.hashes};
const added=new Set(['src/lib/analysis-presentation.ts','src/components/analysis/AnalysisPeriodFields.tsx','src/components/analysis/AnalysisWinRates.tsx']);
const read=file=>fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
function assertReviewed(file){if(Object.hasOwn(deckUx.hashes,file))return deckUx.assertReviewed(file);assert.equal(createHash('sha256').update(read(file)).digest('hex'),hashes[file],'unreviewed Analysis UX change: '+file);}
// Only historical source-scope guards receive pre-UX bytes, after strict hash validation.
// Current components, aggregate logic, SQL and browser tests never use this projection.
function readBeforeAnalysisUx(file){const source=deckUx.readBeforeDeckManagement(file);if(Object.hasOwn(deckUx.hashes,file)||!Object.hasOwn(hashes,file))return source;assertReviewed(file);assert.ok(!added.has(file));return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');}
module.exports={base,hashes,added,read,assertReviewed,readBeforeAnalysisUx};
