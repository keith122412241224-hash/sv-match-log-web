/* eslint-disable @typescript-eslint/no-require-imports */
// Browser HTTP responses execute the real migrations against a local PostgreSQL
// fixture. Auth transport is simulated; RLS is exercised with authenticated role.
const assert = require('node:assert/strict'), path = require('node:path');
const h = require('./obs-matchups-db.cjs');
const fixture = require('./obs-environment-fixture.cjs');
async function verifySqlMatchups({ page, origin, out, report, setState }) {
  const db = await h.createDb();
  try {
    await db.exec(h.read(h.migration));
    for (const [table, rows] of [['environments', fixture.environments], ['deck_archetypes', fixture.decks]])
      await db.query(`insert into public.${table} select * from jsonb_populate_recordset(null::public.${table},$1::jsonb)`, [JSON.stringify(rows)]);
    await h.identity(db);
    const ranks = ['unranked', 'master:ruby'];
    const anchor = await h.environment(db, fixture.environments[0].id, ranks);
    const source = [];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) for (let k = 0; k <= i + j; k++)
      source.push(h.row({ environment_id: anchor.environmentId, played_at: anchor.current.start,
        my_archetype_id: fixture.decks[i].id, opponent_archetype_id: fixture.decks[j].id,
        result: k % 3 ? 'win' : 'lose', ...(k % 2 ? { rank_tier: 'master', master_group: 'ruby' } : {}) }));
    const excluded = [h.row({ played_at: anchor.current.start }), h.row({ environment_id: anchor.environmentId, played_at: anchor.current.end })];
    await h.seed(db, [...source, ...excluded]);
    await db.exec('begin isolation level repeatable read');
    const state = { db, h, dashboard: null, aggregates: null }; setState(state);
    const query = '?environment=' + anchor.environmentId + '&period=7d&ranks=unranked,master%3Aruby';
    await page.goto(origin + '/admin/obs/environment' + query, { waitUntil: 'networkidle' });
    assert.ok(state.aggregates, 'browser called actual SQL RPC');
    assert.equal(state.dashboard.current.total.totalMatches, source.length);
    assert.equal(state.aggregates.registeredMatches, source.length);
    assert.equal(state.aggregates.perspectives, source.length * 2);
    const table = page.getByRole('table', { name: '遭遇率TOP5の相性表' });
    assert.equal(await table.locator('tbody td').count(), 25);
    const cells = [];
    for (const cell of await table.locator('tbody td').all()) {
      const row = await cell.getAttribute('data-row'), column = await cell.getAttribute('data-column');
      const groups = state.aggregates.groups.filter(g => g.myDeckId === row && g.opponentDeckId === column);
      const count = groups.reduce((s, g) => s + g.total, 0), wins = groups.reduce((s, g) => s + g.wins, 0);
      const expected = row === column ? '—' : (wins / count * 100).toFixed(1) + '%';
      assert.equal(await cell.locator('strong').innerText(), expected);
      if (row === column) {
        assert.equal(await cell.locator('small').count(), 0); assert.equal(wins * 2, count);
        assert.equal(count, source.filter(m => m.my_archetype_id === row && m.opponent_archetype_id === row).length * 2);
      } else {
        assert.ok((await cell.locator('small').innerText()).startsWith(count + '戦'));
        const reverse = state.aggregates.groups.filter(g => g.myDeckId === column && g.opponentDeckId === row);
        assert.equal(count, reverse.reduce((s, g) => s + g.total, 0));
        assert.equal(wins + reverse.reduce((s, g) => s + g.wins, 0), count);
        assert.equal(count, source.filter(m => (m.my_archetype_id === row && m.opponent_archetype_id === column)
          || (m.my_archetype_id === column && m.opponent_archetype_id === row)).length);
      }
      cells.push({ row, column, rate: expected, internalCount: count, internalWins: wins });
    }
    const top = await page.getByRole('region', { name: '遭遇率TOP5', exact: true }).locator('li').allTextContents();
    const names = await table.locator('tbody th').allTextContents();
    top.forEach((text, i) => assert.ok(text.includes(names[i])));
    for (const width of [1056, 1152, 1248, 1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1080 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.getByRole('heading', { name: '遭遇率TOP5｜相性関係', exact: true }).evaluate(n => n.scrollIntoView());
      await page.screenshot({ path: path.join(out, `sql-matrix-${width}.png`) });
    }
    await page.goto(origin + '/environment' + query, { waitUntil: 'networkidle' });
    const normal = await page.locator('section').filter({ has: page.getByRole('heading', { name: '遭遇率TOP5', exact: true }) }).locator('li').allTextContents();
    normal.forEach((text, i) => { assert.ok(text.includes(names[i])); const [, count, total] = text.match(/([\d,]+)件 \/ 登録([\d,]+)件/); assert.ok(top[i].includes(`${count}戦 / 全${total}戦`)); });
    report.checks.push({ actualSql: true, sameSnapshot: true, conditions: { environment: anchor.environmentId, start: anchor.current.start, end: anchor.current.end, ranks }, sourceCount: source.length, cells });
    await db.exec('rollback');
  } finally { setState(null); await db.close(); }
}
module.exports = { verifySqlMatchups };
