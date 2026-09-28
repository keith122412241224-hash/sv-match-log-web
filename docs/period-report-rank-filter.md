# R4: period-report rank population filter

Local candidate based on `089f7e27b69694cce68513bca9d50d0be1f6187f`.
No Production DB operation, commit, push or deploy is performed by this work.

## RPC and data path

`get_period_report_aggregates_v2(p_current_start timestamptz,
p_current_end timestamptz, p_previous_start timestamptz,
p_previous_end timestamptz, p_rank_filter text DEFAULT 'all') RETURNS jsonb`
keeps the v1 JSON contract, including version 1 and ordered current/previous
groups with firstOrdinal. It is STABLE, SECURITY INVOKER, empty search_path.
PUBLIC/anon cannot execute; authenticated/service_role can execute but an
authenticated admin identity is still required. No identity or non-admin
identity is rejected even with service_role. Existing RLS remains effective.

Omitted/all/SQL NULL delegates to unchanged v1. The app uses v1 for all and v2
only for a selected rank, exactly one RPC for both periods. Errors remain
errors; there is no v1 fallback for a failed v2 or false empty report.
Unknown SQL filters, including empty string, are rejected with 22023.
The existing UI parser treats omitted/empty rank URL values as all, and rejects
unknown nonempty values before requesting report data.

Rank belongs to the registering player at match time. The original matches are
filtered identically in both periods, before row numbering and aggregation.
The unchanged TypeScript report adapter then derives direct/reversed views,
mirror-inclusive win rates and mirror-exclusive Tier evaluation. Rank is never
converted on reversal. NULL records remain included in all; GrandMaster none is
an explicit stored value. The shared R3-A/B list supplies all 14 options.

Existing JST period construction, inclusive .999 end, previous-period length,
deck ID resolution, ranking, tie order, Tier, Strength Score, confidence,
warnings and AI prompt builder remain byte-identical to the Production baseline.

## Presentation and exports

The form carries rank in the URL and retains start/end dates. Selecting all
clears the population restriction; omitting rank also uses all.
Selected ranks are shown above the report and inside every PNG capture block,
including environment changes, encounter rankings, win rates, matchups, Tier
and correlations. A scoped React context supplies only this export label;
it has no DOM wrapper and adds no label when all is selected.

For selected ranks only, `withPeriodReportRank` appends `rankFilter` metadata to
AI JSON (value, label, registering-player/current-and-previous explanation),
then invokes the unchanged prompt builder. All returns the original report
object, AI JSON and prompt unchanged. Evaluation fields are never recalculated
by the labeling helper. Manual Tier changes retain this metadata through the
existing AI JSON spread and appear in the existing tables/PNG/prompt. The
interactive sections are keyed by period and rank so adjustments do not leak
between different report populations. No adjustment or rank filter writes DB.

## Verification

- SQL: independent JavaScript rank selection on ordered SQL source rows, then
  the frozen pre-RPC Production `weekly-report-e430a56` calculation. Compare the
  entire report model (including all evaluation, order, AI and PNG inputs), not
  only aggregates. SQL v1/v2 all comparisons retain JSON array order.
- Scenarios include all 17 valid stored combinations, NULL-only, none, empty,
  current-only/previous-only, both directions, mirrors, standard/legacy/inactive/
  unknown/same-name IDs, ties, inclusive microsecond/JST/month boundaries,
  different rank populations across periods, restrictive RLS and admin removal.
- Synthetic scale: 10k+10k and 100k+100k, all/Master-plus/Master/GrandMaster/
  sapphire/none, three timings and EXPLAIN ANALYZE BUFFERS each. PGlite PostgreSQL
  18.3 is not Production PostgreSQL 17.6; results are not Production or HTTP
  estimates. Some 100k+100k sorts spill to temp, recorded in local evidence.
- Browser: 14 filters x two date ranges, full AI JSON against the old oracle,
  prompt clipboard (Windows CRLF normalized only at clipboard boundary), labels
  inside all six PNG capture blocks, actual PNG exports, manual Tier editing,
  population switch reset, one RPC, zero raw matches reads, export without
  refetch, genuine zero, invalid filter, denied/missing/failed/malformed RPC.
- Old snapshot guards allow only the four intentionally adapted period entry
  points. A new R4 guard freezes every other existing Production source/schema
  file and every non-report data.ts declaration. No expected calculation or
  existing migration/RPC was changed to make tests pass.

## Before Production

Audit latest Production commit, PostgreSQL 17.6, v1 definition/ACL, rank columns,
CHECK/RLS and v2 absence. Inspect 018 alone. Do not replay manually applied
015/016/017 or mutate unsynchronized migration history. In a separately
authorized DB step, add only v2 and its EXECUTE rights, then compare real data
and measure actual timeout/work_mem/temp/plans. Only afterwards deploy the app
in a separately authorized step. Keep the known matrix React #418 separate.
