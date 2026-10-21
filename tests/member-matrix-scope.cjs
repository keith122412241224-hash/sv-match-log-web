/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='1784bc53067bb07d94666da800db437a7d5766a5';
const hashes={
  'src/app/matrix/page.tsx':'db2fa7235e7673ca1dbeba5d0c634a721caaeeee94242bb137e5042d37f72c61',
  'src/components/matrix/MatrixFilters.tsx':'5c5b77790944ff06cd88499f43719758a14413df81e233bb817cfc3992cd8ab1',
  'src/lib/matchup-data.ts':'e6d5d9552ea50d73eda6d05843c0ccca397f01748aefb8124d320abb67af4834',
  'supabase/migrations/20261021053918_member_matchup_aggregates_v1.sql':'09b7cb6cb34c292f88977ff1d1f11fa77b071ff38f8dc30fdf2f57d91835bdab'
};
const added=new Set(['supabase/migrations/20261021053918_member_matchup_aggregates_v1.sql']);
// Historical guards retain their exact baselines only for these reviewed bytes.
// Behaviour/security tests execute current modules and the actual SQL migration.
function readBeforeMemberMatrix(file){
  const source=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
  if(!Object.hasOwn(hashes,file))return source;
  assert.equal(createHash('sha256').update(source).digest('hex'),hashes[file],'unreviewed member matrix change: '+file);
  assert.ok(!added.has(file),'new migration has no historical source');
  return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
}
module.exports={base,hashes,added,readBeforeMemberMatrix};
