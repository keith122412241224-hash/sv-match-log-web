/* eslint-disable @typescript-eslint/no-require-imports */
const cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='da7030053542d1f2c798661e1bb7328025069dd6',hashes=require('./fixtures/obs-unified-source-hashes.json');
const added=new Set(['src/components/creator/ObsEnvironmentSection.tsx','src/components/creator/ScaledObsEnvironment.tsx','supabase/migrations/20261023104351_obs_unified_composition.sql']);
const read=require('./admin-obs-direct-access-scope.cjs').readBeforeDirectAccess;
function assertReviewed(f){assert(Object.hasOwn(hashes,f));assert.equal(createHash('sha256').update(read(f)).digest('hex'),hashes[f],'unreviewed unified OBS change: '+f);}
function readBeforeUnified(f){if(!Object.hasOwn(hashes,f))return read(f);assertReviewed(f);assert(!added.has(f));return cp.execFileSync('git',['show',base+':'+f],{encoding:'utf8'}).replaceAll('\r\n','\n');}
module.exports={base,hashes,added,read,assertReviewed,readBeforeUnified};
