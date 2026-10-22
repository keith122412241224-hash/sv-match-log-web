/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='836f95579ebca6e655b8949d763adb10fe955561',hashes=require('./fixtures/analysis-deck-multi-source-hashes.json');
const added=new Set(['src/components/DeckMultiSelectDialog.tsx','src/lib/analysis-deck-selection.ts','supabase/migrations/20261022050000_analysis_deck_sets.sql']);
const read=file=>fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
function assertReviewed(file){assert.ok(Object.hasOwn(hashes,file));assert.equal(createHash('sha256').update(read(file)).digest('hex'),hashes[file],'unreviewed analysis multi-selection change: '+file);}
// Only historical byte guards use this projection; all runtime/DB/browser tests load current source.
function readBeforeMulti(file){if(!Object.hasOwn(hashes,file))return read(file);assertReviewed(file);assert.ok(!added.has(file));return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');}
module.exports={base,hashes,added,read,assertReviewed,readBeforeMulti};
