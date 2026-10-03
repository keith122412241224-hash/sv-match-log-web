// Synthetic HTTP boundary for UI verification. Never connects to a database.
const id = n => `f7000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const environments = [{ id: id(1), name: '能力調整後の環境', start_date: '2026-10-01', created_at: '2026-10-01T00:00:00Z', allow_match_input: true, match_input_start_at: null, match_input_end_at: null }];
const names = ['ハイランダーネメシス', 'ミッドレンジロイヤル', 'ランプドラゴン', 'スペルウィッチ', 'ミルティオナイトメア', 'コントロールビショップ'];
const classes = ['ネメシス', 'ロイヤル', 'ドラゴン', 'ウィッチ', 'ナイトメア', 'ビショップ'];
const decks = names.map((name, i) => ({ id: id(10 + i), name, class_name: classes[i], is_active: true, sort_order: i, aliases: [], memo: null }));
const empty = () => ({ encounter: { status: 'no_data', count: null }, winrate: { status: 'no_data', targetRegistrations: null, evaluationCount: null, wins: null } });
const metric = (count, targets, wins, evaluations = targets) => ({ encounter: { status: 'available', count }, winrate: { status: 'available', targetRegistrations: targets, evaluationCount: evaluations, wins } });
function dashboard(args, mode = 'full') {
  const end = Date.parse('2026-10-03T03:00:00Z'), span = ({ '24h': 1, '3d': 3, '7d': 7, '30d': 30 }[args.p_period]) * 86400000;
  const total = mode === 'empty' ? { status: 'no_data', totalMatches: null } : { status: 'available', totalMatches: 800 };
  return { version: 3, environmentId: args.p_environment_id, period: args.p_period, rankFilters: args.p_rank_filters,
    aggregatedAt: '2026-10-03T03:12:00Z', dataThrough: '2026-10-03T03:00:00Z',
    current: { start: new Date(end - span).toISOString(), end: new Date(end).toISOString(), total },
    previous: { start: new Date(end - 2 * span).toISOString(), end: new Date(end - span).toISOString(), total },
    decks: [...decks.map((d, i) => ({ key: d.id, name: d.name, className: d.class_name,
      current: mode === 'empty' ? empty() : metric([180, 150, 120, 100, 80, 70][i], 250, [160, 155, 130, 120, 100, 90][i], [269, 300, 260, 280, 290, 310][i]),
      previous: mode === 'empty' ? empty() : metric([80, 60, 50, 190, 170, 150][i], 250, 125) })),
    { key: 'unclassified', name: '未分類', className: null, current: empty(), previous: empty() }] };
}
module.exports = { id, environments, decks, dashboard };
