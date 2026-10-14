/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='81ceee42d371ddf51573a753bd8464082c948001';
const hashes=require('./fixtures/suggestion-approval-source-hashes.json');
const added=new Set(['src/lib/suggestion-decision.ts','src/components/admin/SuggestionDecisionForm.tsx','supabase/migrations/20261014005220_atomic_suggestion_approval.sql']);
// Only historical scope assertions project a byte-verified Phase 2 patch away.
// Behaviour, SQL and security tests always execute current product files.
function readBeforeSuggestionApproval(file){
 const source=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
 if(!Object.hasOwn(hashes,file))return source;
 assert.equal(createHash('sha256').update(source).digest('hex'),hashes[file],'unreviewed approval change: '+file);
 assert(!added.has(file),'new approval file has no historical source');
 return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
}
module.exports={base,hashes,added,readBeforeSuggestionApproval};
