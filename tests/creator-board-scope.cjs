/* eslint-disable @typescript-eslint/no-require-imports */
const cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='9aa41e0';
const hashes=require('./fixtures/creator-board-source-hashes.json');
const added=new Set(['src/lib/creator/matchup-data.ts','src/lib/creator/matchup-server.ts',...require('./creator-trim-scope.cjs').added]);
function readBeforeBoard(file){
 const source=require('./creator-trim-scope.cjs').readBeforeTrim(file);
 if(!Object.hasOwn(hashes,file))return source;
 assert.equal(createHash('sha256').update(source).digest('hex'),hashes[file],'unreviewed creator board change: '+file);
 return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
}
module.exports={base,hashes,added,readBeforeBoard};
