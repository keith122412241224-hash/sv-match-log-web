/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='e7900d4ce4c065f584e2aaf4730f9ac55dea4511',hashes=require('./fixtures/creator-independent-source-hashes.json');
const added=new Set(['src/app/admin/creator/correlation/page.tsx','src/app/admin/creator/correlation/[id]/page.tsx','src/app/admin/creator/images/page.tsx','src/app/admin/creator/obs-sets/page.tsx','src/app/admin/obs/composition/[id]/page.tsx','src/app/admin/obs/correlation-work/[id]/page.tsx','src/components/creator/CompositionObs.tsx','src/components/creator/CorrelationList.tsx','src/components/creator/ObsSetEditor.tsx','src/lib/creator/independent-server.ts','src/lib/creator/obs-set.ts','supabase/migrations/20261022101117_creator_independent_correlation.sql']);
const read=file=>fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
function assertReviewed(file){assert.ok(Object.hasOwn(hashes,file));assert.equal(createHash('sha256').update(read(file)).digest('hex'),hashes[file],'unreviewed independent Creator change: '+file);}
// Historical scope assertions retain their exact original byte expectations only
// after current code passes this new, explicit hash review. Runtime tests use current code.
function readBeforeIndependent(file){if(!Object.hasOwn(hashes,file))return read(file);assertReviewed(file);assert.ok(!added.has(file));return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');}
module.exports={base,hashes,added,read,assertReviewed,readBeforeIndependent};
