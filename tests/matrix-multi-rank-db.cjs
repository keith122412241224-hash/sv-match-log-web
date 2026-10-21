/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic local PostgreSQL. Existing functions/ACLs are loaded verbatim.
const h = require('./obs-matchups-db.cjs');
const baseline = h.read('supabase/migrations/20260928010000_production_baseline.sql');
async function createDb() {
  const db = await h.createDb();
  for (const version of [1, 2]) {
    const name = 'get_matchup_aggregates_v' + version;
    const definition = baseline.match(new RegExp('CREATE OR REPLACE FUNCTION public\\.' + name + '\\([\\s\\S]*?\\$function\\$;'))[0];
    const acl = baseline.split('\n').filter(s => /^(alter function|revoke all|grant execute)/.test(s) && s.includes('public.' + name + '(')).join('\n');
    await db.exec(definition + '\n' + acl);
  }
  await db.exec(baseline.split('\n').find(s => s.includes('add constraint "matches_rank_metadata_check"')));
  await db.exec(h.read('supabase/migrations/20261010042525_environment_dashboard_v4.sql'));
  return db;
}
async function rpc(db, name, args) {
  if (!['get_matchup_aggregates_v1', 'get_matchup_aggregates_v2', 'get_analysis_aggregates_v3', 'get_environment_dashboard_aggregates_v4'].includes(name)) throw Error('Unexpected RPC ' + name);
  const types = { p_environment_id: 'uuid', p_include_all_users: 'boolean', p_rank_filter: 'text', p_rank_filters: 'text[]', p_period: 'text', p_include_reversed: 'boolean', p_use_archetype: 'boolean', p_my_deck_id: 'uuid', p_opponent_deck_id: 'uuid', p_result: 'public.match_result', p_turn_order: 'public.turn_order', p_played_from: 'timestamptz', p_played_to: 'timestamptz', p_recent_deck_ids: 'uuid[]' };
  const entries = Object.entries(args);
  for (const [key] of entries) if (!types[key]) throw Error('Unexpected argument');
  return (await db.query(`select public.${name}(${entries.map(([k], i) => `${k}=>$${i + 1}::${types[k]}`).join(',')}) as data`, entries.map(([, v]) => v))).rows[0].data;
}
const atom = r => r.rank_tier === null ? 'unranked' : r.rank_tier === 'master' ? 'master:' + r.master_group : r.rank_tier === 'grandmaster' ? 'grandmaster:' + r.grandmaster_rating : r.rank_tier;
function fixture() {
  return h.ranks.flatMap(rank => Array.from({ length: 24 }, (_, i) => h.row({ ...rank,
    user_id: [h.MEMBER, h.OTHER, h.ADMIN][i % 3], environment_id: i % 7 ? h.NEW : h.OLD,
    my_deck_id: h.uuid(300 + i % 2), opponent_deck_id: h.uuid(300 + (i + 1) % 2),
    my_archetype_id: i % 5 ? h.decks[i % 3].id : null, opponent_archetype_id: i % 4 ? h.decks[(i + 1) % 3].id : null,
    result: i % 3 ? 'win' : 'lose', turn_order: i % 2 ? 'first' : 'second'
  })));
}
module.exports = { ...h, createDb, rpc, atom, fixture };
