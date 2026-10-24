/* eslint-disable @typescript-eslint/no-require-imports */
const cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='19abda5448efc18fabbd58e5b92add01fd38426a',file='src/components/environment/EnvironmentData.tsx',hash='03f740bdc27b4f8737e3ff1bc4f9fbebf0df9278a821daa960735201971e8dc7';
const read=require('./match-input-environment-scope.cjs').readBeforeMatchInput;
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
function assertReviewed(){assert.equal(createHash('sha256').update(read(file)).digest('hex'),hash,'unreviewed environment deck display change');}
function readBeforeDeckData(f){if(f!==file)return read(f);assertReviewed();return git('show',base+':'+f);}
// Project only this exact reviewed file for historical inventory comparisons.
function historicalChanges(files,historicalBase){return files.filter(f=>(f!==file&&!Object.hasOwn(require('./match-input-environment-scope.cjs').hashes,f))||readBeforeDeckData(f)!==git('show',historicalBase+':'+f));}
module.exports={base,file,read,git,assertReviewed,readBeforeDeckData,historicalChanges};
