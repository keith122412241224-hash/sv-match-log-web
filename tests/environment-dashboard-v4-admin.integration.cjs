/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const assert = require('node:assert/strict'), Module = require('node:module');
const { setup, ids } = require('./match-mutations-db.cjs');
let client, activeUser = ids.a;
const invalidated = [], originalLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === '@/lib/supabase/server') return { createSupabaseServerClient: async () => client };
  if (name === 'next/navigation') return { redirect: target => { throw Error('redirect:' + target); } };
  if (name === 'next/cache') return { revalidatePath: target => invalidated.push(target) };
  return originalLoad.call(this, name, ...args);
};
const { updateEnvironmentsBatch } = require('../src/app/admin/actions');
async function run() {
  const { db, claim, Query } = await setup();
  try {
    client = { auth: { getUser: async () => ({ data: { user: activeUser ? { id: activeUser } : null } }) }, from: table => new Query(table) };
    const form = end => {
      const f = new FormData();
      for (const [key, value] of Object.entries({ environment_ids: ids.env, [`name_${ids.env}`]: '検証環境', [`start_date_${ids.env}`]: '2026-08-27', [`allow_match_input_${ids.env}`]: 'on', [`match_input_start_at_${ids.env}`]: '', [`match_input_end_at_${ids.env}`]: '2026-10-01T17:00', [`dashboard_end_at_${ids.env}`]: end })) f.set(key, value);
      return f;
    };
    const read = async () => (await db.query('select dashboard_end_at,match_input_end_at,allow_match_input from public.environments where id=$1', [ids.env])).rows[0];
    await claim(ids.a);
    await updateEnvironmentsBatch(form('2026-09-29T17:00'), true);
    let row = await read();
    assert.equal(new Date(row.dashboard_end_at).toISOString(), '2026-09-29T08:00:00.000Z');
    assert.equal(new Date(row.match_input_end_at).toISOString(), '2026-10-01T08:00:00.000Z');
    assert.equal(row.allow_match_input, true);
    const before = row;
    await updateEnvironmentsBatch(form('invalid'), true);
    assert.deepEqual(await read(), before);
    await updateEnvironmentsBatch(form(''), true); row = await read();
    assert.equal(row.dashboard_end_at, null); assert.deepEqual(row.match_input_end_at, before.match_input_end_at);
    assert.ok(invalidated.includes('/environment') && invalidated.includes('/admin/obs/environment'));
    await claim(ids.b); activeUser = ids.b;
    await assert.rejects(() => updateEnvironmentsBatch(form('2026-09-29T17:00'), true), /redirect:\//);
    assert.equal((await read()).dashboard_end_at, null);
    activeUser = null;
    await assert.rejects(() => updateEnvironmentsBatch(form('2026-09-29T17:00'), true), /redirect:\/login/);
    console.log('PASS: all migrations; actual admin action saves JST cutoff, rejects invalid input, clears to NULL, preserves independent input window, invalidates views and rejects non-admin/unsigned users.');
  } finally { await db.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
