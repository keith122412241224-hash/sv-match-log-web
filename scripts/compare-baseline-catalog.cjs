/* eslint-disable @typescript-eslint/no-require-imports */
// Offline comparison only; never connects to a database or modifies SQL objects.
const fs=require('node:fs');
const [expectedFile,actualFile]=process.argv.slice(2);
if(!expectedFile||!actualFile)throw new Error('Usage: node scripts/compare-baseline-catalog.cjs expected.json actual.json');
const read=p=>{const x=JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));return x.audit||x;};
const expected=read(expectedFile),actual=read(actualFile);
const sections=['relations','columns','enums','constraints','indexes','policies','functions','triggers','table_grants','default_privileges','schemas'];
for(const [label,catalog] of [['expected',expected],['actual',actual]]) {
 if(catalog.check!=='migration-step1-production-catalog-v1')throw new Error(label+': unexpected catalog format');
 for(const section of sections)if(!Array.isArray(catalog[section])||catalog[section].length===0)throw new Error(label+': missing or empty '+section);
}
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const normalize=(section,rows)=>(rows||[]).filter(r=>section!=='schemas'||r.name==='public').filter(r=>section!=='triggers'||r.schema==='public'||(r.schema==='auth'&&r.table==='users'&&r.name==='on_auth_user_created')).map(r=>{
 const v={...r};if(v.acl)v.acl=v.acl.slice(1,-1).split(',').sort();
 if(section==='functions'){delete v.definition_md5;v.definition=v.definition.replaceAll('\r\n','\n');}
 if(section==='table_grants')delete v.table_catalog;
 return canonical(v);
}).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
const checks=sections.map(section=>{
 const e=normalize(section,expected[section]),a=normalize(section,actual[section]);
 return {section,expected:e.length,actual:a.length,equal:JSON.stringify(e)===JSON.stringify(a)};
});
console.log(JSON.stringify({passed:checks.every(c=>c.equal),checks},null,2));
if(checks.some(c=>!c.equal))process.exitCode=1;
