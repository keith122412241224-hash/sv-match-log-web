/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable PostgreSQL WASM. No network, credentials or production database.
const fs = require('node:fs'), path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const ids = { a: uuid(1), b: uuid(2), env: uuid(10), env2: uuid(11), deck: uuid(20), deck2: uuid(21), bdeck: uuid(22), arch: uuid(30), arch2: uuid(31), match: uuid(40), other: uuid(41) };
const quote = name => '"' + name.trim().replaceAll('"', '""') + '"';
async function setup() {
  const db = await PGlite.create();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    grant usage on schema auth to anon, authenticated, service_role;`);
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(path.join('supabase/migrations', file), 'utf8'));
  for (const id of [ids.a, ids.b]) await db.query('insert into auth.users(id,email) values($1,$2)', [id, id + '@example.test']);
  await db.query('insert into public.admin_users(user_id) values($1)', [ids.a]);
  for (const [id, name] of [[ids.env, '検証環境'], [ids.env2, '別の環境']]) await db.query('insert into public.environments(id,user_id,name) values($1,$2,$3)', [id, ids.a, name]);
  for (const [id, name, cls] of [[ids.arch, 'デッキA', 'エルフ'], [ids.arch2, 'デッキB', 'ロイヤル']]) await db.query('insert into public.deck_archetypes(id,name,class_name) values($1,$2,$3)', [id, name, cls]);
  for (const [id, owner, name, cls] of [[ids.deck, ids.a, 'デッキA', 'エルフ'], [ids.deck2, ids.a, 'デッキB', 'ロイヤル'], [ids.bdeck, ids.b, '非公開B', 'エルフ']]) await db.query('insert into public.decks(id,user_id,name,class_name) values($1,$2,$3,$4)', [id, owner, name, cls]);
  for (const [id, owner, deck] of [[ids.match, ids.a, ids.deck], [ids.other, ids.b, ids.bdeck]]) await db.query(`insert into public.matches(id,user_id,environment_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,result,turn_order,played_at) values($1,$2,$3,$4,$4,$5,$5,'win','first',now()-interval '1 hour')`, [id, owner, ids.env, deck, ids.arch]);
  async function claim(user = ids.a) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user || '', JSON.stringify(user ? { sub: user, is_anonymous: false } : {})]);
    await db.exec('set role ' + (user ? 'authenticated' : 'anon'));
  }
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.cols = '*'; this.sort = []; }
    select(cols = '*') { this.cols = cols; return this; }
    eq(key, value) { this.filters.push([key, 'eq', value]); return this; }
    in(key, value) { this.filters.push([key, 'in', value]); return this; }
    order(key, options = {}) { this.sort.push(quote(key) + (options.ascending === false ? ' desc' : ' asc')); return this; }
    limit(value) { this.count = value; return this; }
    maybeSingle() { this.single = true; return this; }
    insert(rows) { this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
    upsert(rows, options) { this.insert(rows); this.conflict = options.onConflict; return this; }
    update(values) { this.values = values; return this; }
    delete() { this.remove = true; return this; }
    async execute() {
      try {
        const args = [], bind = v => { args.push(v); return '$' + args.length; };
        const where = this.filters.map(([key, op, value]) => op === 'eq' ? quote(key) + '=' + bind(value) : value.length ? quote(key) + ' in (' + value.map(bind).join(',') + ')' : 'false');
        const condition = where.length ? ' where ' + where.join(' and ') : '';
        const table = 'public.' + quote(this.table); let sql;
        if (this.rows) { const cols = Object.keys(this.rows[0]); sql = 'insert into ' + table + '(' + cols.map(quote).join(',') + ') values ' + this.rows.map(row => '(' + cols.map(col => bind(row[col])).join(',') + ')').join(',') + (this.conflict ? ' on conflict(' + this.conflict.split(',').map(quote).join(',') + ') do nothing' : '') + ' returning *'; }
        else if (this.values) sql = 'update ' + table + ' set ' + Object.entries(this.values).map(([key, value]) => quote(key) + '=' + bind(value)).join(',') + condition + ' returning *';
        else if (this.remove) sql = 'delete from ' + table + condition + ' returning *';
        else sql = 'select ' + (this.cols === '*' ? '*' : this.cols.split(',').map(quote).join(',')) + ' from ' + table + condition + (this.sort.length ? ' order by ' + this.sort.join(',') : '') + (this.count ? ' limit ' + Number(this.count) : '');
        const result = await db.query(sql, args);
        return { data: this.single ? result.rows[0] ?? null : result.rows, error: null };
      } catch (error) { return { data: null, error: { message: error.message, code: error.code } }; }
    }
    then(a, b) { return this.execute().then(a, b); }
  }
  return { db, claim, Query, ids };
}
module.exports = { setup, ids, quote };
