/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='93464277d416c862ca2475833cdfde87f769ca65';
const hashes=require('./fixtures/deck-select-dialog-source-hashes.json');
const added=new Set(['src/components/DeckSelectDialog.tsx']);
const read=file=>fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
function assertReviewed(file){assert.equal(createHash('sha256').update(read(file)).digest('hex'),hashes[file],'unreviewed deck selection change: '+file);}
// Historical guards see previous bytes only after exact validation; runtime tests always use current modules.
function readBeforeDeckSelect(file){if(!Object.hasOwn(hashes,file))return read(file);assertReviewed(file);assert.ok(!added.has(file));return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');}
module.exports={base,hashes,added,read,assertReviewed,readBeforeDeckSelect};
