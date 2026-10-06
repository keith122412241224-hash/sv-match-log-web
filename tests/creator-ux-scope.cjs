/* eslint-disable @typescript-eslint/no-require-imports */
const cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='a2d155a';
const hashes=require('./fixtures/creator-ux-source-hashes.json');
const added=new Set(['src/components/creator/TierCanvas.tsx','supabase/migrations/20261006045006_creator_ux.sql',...require('./creator-board-scope.cjs').added]);
function readBeforeUX(file){
 const source=require('./creator-board-scope.cjs').readBeforeBoard(file);
 if(!Object.hasOwn(hashes,file))return source;
 assert.equal(createHash('sha256').update(source).digest('hex'),hashes[file],'unreviewed UX change: '+file);
 return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
}
module.exports={base,hashes,added,readBeforeUX};
