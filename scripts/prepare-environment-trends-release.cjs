/* eslint-disable @typescript-eslint/no-require-imports */
// Files only: never runs CLI, connects to a database, links a project, or deploys.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'build/environment-trends-release-package');
assert(!fs.existsSync(output), 'Package already exists; inspect it before preparing another release');
const migrations = path.join(root, 'supabase/migrations');
const index = '20261114104651_environment_trends.sql', rpc = '20261114212352_environment_trends_rpc.sql';
const files = fs.readdirSync(migrations).filter(f => f.endsWith('.sql')).sort();
assert.equal(files.at(-1), rpc, 'Unexpected pending migration: review release contents');
assert.equal(files.length, 24);assert(files.includes('20261026111607_phase2a_minimize_database_privileges.sql'));
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file, 'utf8').replaceAll('\r\n','\n')).digest('hex');
const hashes = Object.fromEntries(files.map(f => [f, digest(path.join(migrations, f))]));
const reviewed = require('../tests/fixtures/environment-trends-source-hashes.json');
for (const f of [index, rpc, '20261026111607_phase2a_minimize_database_privileges.sql']) assert.equal(hashes[f],reviewed['supabase/migrations/'+f]);
for (const [phase, include] of [['index', files.filter(f=>f!==rpc)], ['rpc', files]]) {
  const dest=path.join(output,phase,'supabase');fs.mkdirSync(path.join(dest,'migrations'),{recursive:true});
  fs.copyFileSync(path.join(root,'supabase/config.toml'),path.join(dest,'config.toml'));
  for(const f of include)fs.copyFileSync(path.join(migrations,f),path.join(dest,'migrations',f));
}
const operations=path.join(root,'supabase/operations/environment-trends');
fs.mkdirSync(path.join(output,'operations'));
const operationHashes={};
for(const f of fs.readdirSync(operations).filter(f=>f.endsWith('.sql'))) {
  operationHashes[f]=digest(path.join(operations,f));
  assert.equal(operationHashes[f],reviewed['supabase/operations/environment-trends/'+f]);
  fs.copyFileSync(path.join(operations,f),path.join(output,'operations',f));
}
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),requiresExplicitProductionApproval:true,cliVersion:'2.118.0',projectRef:'xbwxapwaadsrtckxewvx',indexPhasePending:[index],rpcPhasePending:[rpc],sha256NormalizedLF:hashes,operationSha256NormalizedLF:operationHashes},null,2));
console.log('Prepared index/RPC workdirs and manifest. No CLI or database operation was executed.');
