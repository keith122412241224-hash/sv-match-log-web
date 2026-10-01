/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
test('fresh installs discover the baseline and ordered migrations through Environment v3; legacy SQL is outside migrations',()=>{
 const files=fs.readdirSync('supabase/migrations').filter(n=>/^([0-9]+)_(.*)\.sql$/.test(n));
 assert.deepEqual(files,['20260928010000_production_baseline.sql','20260928060000_environment_match_input_schedule.sql','20260929053719_analysis_rank_tiers.sql','20260930004618_environment_dashboard_aggregates_v1.sql','20260930040027_environment_dashboard_rank_filters.sql','20260930071612_multi_rank_aggregates.sql','20261001080455_environment_dashboard_aggregates_v3.sql']);
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync('supabase/migrations/'+files[0])).digest('hex'),'013fe4297dd057efcf2762cbcbf7071bb3b318bd5f9a02f836617707369ab20b');
 const manifest=JSON.parse(fs.readFileSync('supabase/legacy-migrations/pre-baseline/manifest.json','utf8'));
 assert.equal(manifest.length,16);
 for(const item of manifest)assert.equal(crypto.createHash('sha256').update(fs.readFileSync('supabase/legacy-migrations/pre-baseline/'+item.name)).digest('hex'),item.sha256,item.name);
});
