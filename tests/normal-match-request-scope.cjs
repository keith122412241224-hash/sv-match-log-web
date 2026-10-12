/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='b14538fc70651293173efec95886b8c2241552a8';
const hashes=require('./fixtures/normal-match-request-source-hashes.json');
const added=new Set(['src/lib/match-request.ts','src/lib/match-submission.ts','src/components/matches/PendingMatchRecovery.tsx','supabase/migrations/20261012090650_normal_match_request_identity.sql']);
const read=file=>fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
function readBeforeNormalRequest(file){
 const source=read(file);if(!Object.hasOwn(hashes,file))return source;
 assert.equal(createHash('sha256').update(source).digest('hex'),hashes[file],'unreviewed normal match request change: '+file);
 assert.ok(!added.has(file),'new files have no historical source');
 return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
}
module.exports={base,hashes,added,read,readBeforeNormalRequest};
