# R3-A: analysis rank filter (local candidate)

Baseline: `27f3dbb4b14706774d63dbd26282803a7ca0e8c4`.

Only the analysis screen changes. Rank is the registering player's attribute at match time. Filter original matches before expanding direct/reversed perspectives; directional deck/result/turn predicates still apply after expansion. No rank swapping, opponent rank inference, raw matches fetch, or UI scan is added.

## Contract

`get_analysis_aggregates_v2` retains v1's first eleven arguments and adds `p_rank_filter text DEFAULT 'all'` as its twelfth argument. SQL NULL also means all. Unknown strings (including empty SQL strings) raise SQLSTATE `22023`.

Allowed values: `all`, `master-plus`, `master`, `grandmaster`, `master:emerald`, `master:topaz`, `master:ruby`, `master:sapphire`, `master:diamond`, `grandmaster:none`, `grandmaster:epic`, `grandmaster:ultimate`, `grandmaster:legend`, `grandmaster:beyond`.

`all` includes every NULL/legacy rank row. `master-plus` includes Master and GrandMaster. `grandmaster:none` selects the explicit GrandMaster value; it never means NULL or unregistered. Counts, JSON fields, `version: 1`, recent identities and ordering retain the v1 response contract. The v2 suffix versions RPC inputs, not the unchanged response format.

The UI uses query parameter `rank`. Omitted/empty/all UI input retains the existing v1 call and all other filters. Selected conditions call v2 exactly once. Invalid query values fail rather than silently broadening results. A missing/denied/invalid v2 result remains an error, never zero or a fallback v1 call. Reset clears rank and directional/date conditions according to the existing reset behavior. No separate unregistered counter is needed or added.

## Database scope / deployment boundary

`016_analysis_rank_aggregates_v2.sql` creates/replaces v2 only, revokes PUBLIC/anon execution and grants authenticated/service_role execution. SECURITY INVOKER, STABLE, empty search_path. Existing RLS plus the v1 identity/admin scope guards remain effective, including service_role requiring identity to return rows. No existing RPC, table, CHECK, Index, RLS, Policy or data mutation.

Requires R1's already installed three columns and CHECK. Do not reapply 015. Production migration history is unsynchronized (manual installations); investigate history separately before using bulk `supabase db push`. This candidate has not been applied to Production. Before app deployment: inspect latest Production and R1 schema, audit/apply only v2 through an approved step, verify actual PostgreSQL 17.6 definition/permissions/results and HTTP latency, then release the app separately.

## Local verification

Use `node --require ./tests/register.cjs --test tests/analysis-rank.test.cjs` for the filter contract/loader and scope guard. `tests/analysis-rank.integration.cjs` uses PGlite through `PGLITE_MODULE`: 17 source combinations, independent rank predicate plus unchanged old analytics, entire model/order comparisons, v1/v2 JSON equality, auth/RLS, source semantics, microseconds, mirrors, 10k/100k synthetic data and EXPLAIN buffers. It never connects to Production. PostgreSQL WASM here is 18.3; not a claim of a Production 17.6 execution or HTTP timing.

`tests/analysis-rank.browser.cjs` runs the built app against localhost:54329 (same URL as build), checks all 14 choices across mine/all and direct/combined, directional combinations, reset, filtered PNG without refetch, no raw matches reads, and v2 error behavior. The HTTP mock is a boundary test; actual SQL semantics are independently tested above.

The pre-existing Phase 2-C snapshot guard excludes only the two intentionally adapted analysis entry points; all other protected files remain frozen. New scope checks protect all other baseline application/schema files; the original Phase 2-B SQL full-page comparison still runs with no filter and unchanged old analytics.
