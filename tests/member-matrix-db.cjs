/* eslint-disable @typescript-eslint/no-require-imports */
const h = require('./matrix-multi-rank-db.cjs');
const migration = 'supabase/migrations/20261021053918_member_matchup_aggregates_v1.sql';
async function createDb() {
  const db = await h.createDb();
  await db.exec(h.read(migration));
  return db;
}
async function rpc(db, name, args) {
  if (name !== 'get_member_matchup_aggregates_v1') return h.rpc(db, name, args);
  return (await db.query('select public.get_member_matchup_aggregates_v1($1::uuid,$2::text[]) as data', [args.p_environment_id, args.p_rank_filters])).rows[0].data;
}
module.exports = { ...h, migration, createDb, rpc };
