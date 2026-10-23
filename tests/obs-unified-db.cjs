/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs');
const migration='20261023104351_obs_unified_composition.sql';
async function applyUnified(db){
 await db.exec('reset role; create table if not exists public.environments(id uuid primary key, name text); grant select on public.environments to authenticated;');
 const f=require('./obs-environment-fixture.cjs');
 for(const e of [...f.environments,{id:f.id(2),name:'以前の環境'}])await db.query('insert into environments(id,name) values($1,$2) on conflict do nothing',[e.id,e.name]);
 await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
}
module.exports={applyUnified,migration};
