/* eslint-disable @typescript-eslint/no-require-imports */
// Local PostgreSQL (PGlite); no external database or real auth credentials.
const fs = require('node:fs');
const base = require('./period-report-environment-db.cjs');
const read = f => fs.readFileSync(f, 'utf8').replaceAll('\r\n', '\n');
const original = read('supabase/migrations/20260930071612_multi_rank_aggregates.sql');
const originalFunction = original.match(/CREATE FUNCTION public\.get_analysis_aggregates_v3\([\s\S]*?\$function\$;/)[0];
const originalAcl = original.split('\n').filter(s => /^(alter function|revoke all|grant execute).*public\.get_analysis_aggregates_v3\(/.test(s)).join('\n');
const migration = 'supabase/migrations/20261004022333_analysis_aggregates_v3_exclusive.sql';
const decks = ['ハイランダーネメシス', 'ミッドレンジロイヤル', 'ランプドラゴン', 'スペルウィッチ', 'ミルティオナイトメア'].map((name, i) => ({ id: base.uuid(200 + i), name, class_name: ['ネメシス', 'ロイヤル', 'ドラゴン', 'ウィッチ', 'ナイトメア'][i], is_active: true }));
async function createDb() {
  const db = await base.createDb();
  await db.exec("create type public.match_result as enum ('win','lose'); create type public.turn_order as enum ('first','second'); alter table public.matches alter column result type public.match_result using result::public.match_result; alter table public.matches add column turn_order public.turn_order default 'first'; grant select on public.matches to service_role;");
  await db.query('insert into public.deck_archetypes select * from jsonb_populate_recordset(null::public.deck_archetypes,$1::jsonb) on conflict(id) do update set name=excluded.name,class_name=excluded.class_name', [JSON.stringify(decks)]);
  await db.exec(originalFunction + '\n' + originalAcl);
  return db;
}
async function environment(db, env = base.NEW, ranks = ['unranked'], period = '7d') {
  return (await db.query('select public.get_environment_dashboard_aggregates_v3($1,$2,$3) as data', [env, period, ranks])).rows[0].data;
}
async function analysis(db, dashboard, { combined = false, all = true, recent = [], name = 'get_analysis_aggregates_v3_exclusive', ...filters } = {}) {
  if (!['get_analysis_aggregates_v3', 'get_analysis_aggregates_v3_exclusive'].includes(name)) throw Error('unexpected RPC');
  return (await db.query(`select public.${name}(p_environment_id=>$1,p_include_all_users=>$2,p_include_reversed=>$3,p_use_archetype=>true,p_played_from=>$4,p_played_to=>$5,p_rank_filters=>$6,p_recent_deck_ids=>$7,p_my_deck_id=>$8,p_opponent_deck_id=>$9,p_result=>$10,p_turn_order=>$11) as data`, [dashboard.environmentId, all, combined, dashboard.current.start, dashboard.current.end, dashboard.rankFilters, recent, filters.my ?? null, filters.opponent ?? null, filters.result ?? null, filters.turn ?? null])).rows[0].data;
}
const row = extra => base.row({ turn_order: 'first', ...extra });
module.exports = { ...base, createDb, read, originalFunction, originalAcl, migration, decks, environment, analysis, row };
