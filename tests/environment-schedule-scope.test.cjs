/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');

const fs=require('node:fs');
const {setup,boundary}=require('./server-page-fixture.cjs');
const {state}=setup();
const {getInputEnabledEnvironments}=require('../src/lib/data');
test('scheduled input loader uses the server clock, preserves metadata and respects manual closure',async t=>{
 const original=structuredClone(state.environments);
 for(const delta of [-1,0,1]){
  t.mock.method(Date,'now',()=>boundary+delta);
  assert.deepEqual(await getInputEnabledEnvironments(),[original[delta<0?1:0]]);
 }
 assert.deepEqual(state.environments,original);
 state.environments=original.map(e=>({...e,allow_match_input:false}));
 assert.deepEqual(await getInputEnabledEnvironments(),[]);
 // Retain the narrowly scoped migration safety contract; no historical app SHA.
 const sql=fs.readFileSync('supabase/migrations/20260928060000_environment_match_input_schedule.sql','utf8').replace(/--[^\n]*/g,'');
 assert.doesNotMatch(sql,/\b(policy|index|cron|security\s+definer|update\s+public\.)\b/i);
 assert.match(sql,/before insert on public.matches/i);
});
