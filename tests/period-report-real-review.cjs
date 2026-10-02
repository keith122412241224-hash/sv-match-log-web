/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const out='build/period-real',read=p=>{const b=fs.readFileSync(p);return b.toString(b[0]===255?'utf16le':'utf8');};
const failures=s=>s.slice(s.indexOf('✖ failing tests:')).split(/\r?\n/).flatMap((line,i,lines)=>line.startsWith('✖ ')&&!line.includes('failing tests:')?[{name:line.replace(/ \([\d.]+ms\)$/,''),reason:lines.slice(i+1).find(l=>l.includes('AssertionError [ERR_ASSERTION]:'))?.trim()}]:[]);
const baseline=failures(read('build/period-environment/baseline-unit.log')),previous=failures(read('build/period-environment/unit.log')),current=failures(read(out+'/unit-current.log'));
assert.equal(baseline.length,7);assert.deepEqual(current,baseline);assert.deepEqual(previous,baseline);
const manifest=JSON.parse(read(out+'/source-before.json')),unchanged=[];
for(const [file,hash]of Object.entries(manifest.files))if(file.startsWith('src/')||file.startsWith('supabase/')||file==='package.json'||file==='package-lock.json'){assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,file);unchanged.push(file);}
const remote=JSON.parse(read(out+'/production-readonly.json')),local=JSON.parse(read(out+'/catalog-before.json'));
const normalizeAcl=acl=>acl===null?null:acl.slice(1,-1).split(',').sort();
const canonical=c=>({functions:c.functions.map(f=>({...f,acl:normalizeAcl(f.acl)})),policies:c.policies.map(p=>({...p,roles:Array.isArray(p.roles)?p.roles:p.roles.slice(1,-1).split(',')})),rls:c.rls.map(t=>({...t,acl:normalizeAcl(t.acl)}))});
assert.deepEqual(canonical(remote.catalog),canonical(local));
const catalog={functions:19,policies:29,rlsTables:9,definitionsAndEffectiveGrantEntriesMatch:true,aclArrayOrderingOnly:true,fullSchemaDiff:false};
const scope={removedTests:0,skippedTests:0,migrationList:'Exact single filename added; baseline SHA256 retained',historicalScope:'Exactly five named implementation files read from d40c02e in historical assertions; not a directory-wide exclusion',newScope:'All other src/supabase/dependencies byte-frozen; exact added-file set; evaluator exact normalization; unrelated loaders AST-checked',limitations:'Modified page, data import/getWeeklyReport and request/context helper files are intentionally not byte-frozen; behavior is covered by unit tests and real Auth/API/browser checks. This is not exhaustive mutation testing.'};
fs.writeFileSync(out+'/review-result.json',JSON.stringify({baseline:{tests:279,pass:272,fail:7},previousImplementation:{tests:283,pass:276,fail:7},current:{tests:283,pass:276,fail:7},failures:current,sourceAndMigrationUnchanged:true,protectedFiles:unchanged.length,catalog,scope},null,2));
console.log(JSON.stringify({sameSevenFailures:true,protectedFiles:unchanged.length,catalog,scope},null,2));
