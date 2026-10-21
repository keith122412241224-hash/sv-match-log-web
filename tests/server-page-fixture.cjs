/* eslint-disable @typescript-eslint/no-require-imports */
// Actual page/loaders; only the network boundary is synthetic. Writes are absent.
const assert = require('node:assert/strict');
const { analysisFixture } = require('./analysis-browser-fixture.cjs');
const boundary = Date.parse('2026-09-29T08:00:00Z');
function setup() {
  const state = { admin: false, calls: [], reads: [], environments: [
    { id: 'new', name: 'New', created_at: '2026-09-28', allow_match_input: true, match_input_start_at: new Date(boundary).toISOString(), match_input_end_at: null },
    { id: 'old', name: 'Old', created_at: '2026-08-26', allow_match_input: true, match_input_start_at: null, match_input_end_at: new Date(boundary).toISOString() }
  ], decks: [{ id: 'a', name: 'A', class_name: 'エルフ', is_active: true }] };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner', is_anonymous: false } } }) },
    rpc: async (name, args) => {
      state.calls.push({ name, args });
      assert.ok(['get_home_dashboard', 'get_analysis_aggregates_v1', 'get_analysis_aggregates_v3', 'get_matchup_aggregates_v1', 'get_matchup_aggregates_v2', 'get_member_matchup_aggregates_v1'].includes(name));
      return { error: null, data: name === 'get_home_dashboard'
        ? { summary: { total: 0, wins: 0, winRate: null, firstWinRate: null, secondWinRate: null }, recent: [] }
        : name.startsWith('get_analysis_') ? analysisFixture([], args) : { version: 1, totalMatches: 0, groups: [] } };
    },
    from(table) {
      state.reads.push(table);
      assert.ok(['environments', 'decks', 'deck_archetypes', 'admin_users'].includes(table), 'page must not download raw matches');
      const data = () => table === 'environments' ? state.environments : table === 'admin_users' ? (state.admin ? { user_id: 'owner' } : null) : state.decks;
      const query = { select: () => query, eq: () => query, order: () => query,
        maybeSingle: async () => ({ data: data(), error: null }),
        then: (a, b) => Promise.resolve({ data: data(), error: null }).then(a, b) };
      return query;
    }
  };
  const id = require.resolve('../src/lib/supabase/server');
  require.cache[id] = { id, filename: id, loaded: true, exports: { createSupabaseServerClient: async () => client } };
  const pages = { home: require('../src/app/page').default, analysis: require('../src/app/analysis/page').default, matrix: require('../src/app/matrix/page').default };
  return { state, pages };
}
function findElement(tree, name) {
  if (!tree || typeof tree !== 'object') return undefined;
  if (Array.isArray(tree)) return tree.map(v => findElement(v, name)).find(Boolean);
  if (tree.type?.name === name) return tree;
  return findElement(tree.props?.children, name);
}
module.exports = { setup, boundary, findElement };
