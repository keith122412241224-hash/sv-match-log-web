# R3-B: matchup rank filter (local candidate)

Baseline: `8eac48bca95c6f0dd74e55e590694f03b7fde0dc`. Not deployed.

Only the matrix page and its loader change; a matrix-specific form is added.
R3-A's existing rank choices/parser are reused unchanged, so save values and
labels remain shared. The generic EnvironmentFilter, matrix presentation,
analytics, deck catalog resolution, R3-A analysis and period report are unchanged.
The existing matrix date hydration issue (#418) is deliberately not addressed.

## Contract and population

`get_matchup_aggregates_v2(p_environment_id uuid DEFAULT NULL,
p_include_all_users boolean DEFAULT false, p_rank_filter text DEFAULT 'all')`
returns the unchanged `{version:1,totalMatches,groups}` JSON contract. It is
STABLE, SECURITY INVOKER, with empty search_path. PUBLIC/anon execution is
revoked; authenticated/service_role execution is granted.

Allowed filters are exactly R3-A's 14 choices: all, master-plus, master,
grandmaster, master:{emerald,topaz,ruby,sapphire,diamond}, and
grandmaster:{none,epic,ultimate,legend,beyond}. `none` is an explicit child of
GrandMaster, never NULL. Unknown SQL values (including empty string) raise 22023.
The UI parser treats an omitted/empty rank query as all, as R3-A does.

Rank belongs to the original registering player's match. The SQL rank predicate
is applied to source matches before grouping. Both totalMatches and groups/cells
derive from the same grouped population. The existing identity/admin guard and
RLS apply. A member's all-users request remains restricted to that member;
service_role still needs identity and admin status for all-users data. No new
user-id argument or SECURITY DEFINER behavior is introduced.

The UI uses v1 for omitted/all and v2 for selected rank filters, one RPC per
submitted filter change. No raw-match query, count query or fallback is added.
RPC failures and malformed payloads remain errors, not a normal empty matrix.

Within v2, omitted/all/SQL NULL delegates to the existing v1 with identical
arguments. This deliberately preserves even v1's unspecified group-array order,
without rewriting v1 or sorting its JSON. Existing EXECUTE privileges on v1 are
therefore a dependency for this path; Production Step 2 previously confirmed
authenticated/service_role EXECUTE, which must be rechecked before deployment.

Archetype IDs retain precedence over legacy IDs. Hidden/inactive/unknown groups
remain in totalMatches, while only selected visible catalog IDs become matrix
cells, exactly as before. Thus the sum of displayed cells can be less than
totalMatches; no synthetic redistribution or removal is performed. Mirrors and
A-to-B/B-to-A remain distinct and no reverse expansion is introduced.

## Local verification

`tests/matchup-rank.integration.cjs` uses PGlite and synthetic rows. It compares
independent row filtering plus the old `buildWinRateMatrix` with v2 and the
unchanged aggregate adapter. It covers 17 valid stored combinations, NULL-only
old rows, zero, both directions, mirrors, standard/legacy/inactive/unknown IDs,
defensive NULL IDs, scopes/environments, complete JSON equality, 1,600 groups,
stricter RLS, revoked admin, ACLs, invalid filters and identity-less service_role.
Synthetic 10k/100k scale cases record bytes, wall times and EXPLAIN buffers.
PGlite is PostgreSQL 18.3, not Production 17.6; timings are not HTTP or production
estimates. Existing Phase 2-A tests additionally use the full schema fixture.

`tests/matchup-rank.browser.cjs` uses only localhost and the built application:
14 filters x mine/all, URL and selected state, cell text/color compatibility,
non-admin scope enforcement, empty results, one RPC, zero raw matches reads,
deck toggles and filtered PNG without refetch, and RPC error without fallback.

Existing snapshot guards now exclude only the two intentionally changed matrix
entry points. A new Production scope guard freezes every other existing src and
schema file. The R3-A SQL test normalizes CRLF solely for EXPLAIN extraction;
neither its SQL migration nor oracle/expected results change.

## Production boundary

No Production DB operation, commit, push or deploy is part of this task.
`017_matchup_rank_aggregates_v2.sql` adds only v2 and its EXECUTE privileges. No
table/column/CHECK/index/RLS/policy/data/old RPC changes. Before release, audit
latest Production, R1 schema, v1 definition and ACL, v2 absence, timeout and
migration automation/history; apply only the reviewed v2 in a separately
authorized step, then compare real PostgreSQL 17.6 results and performance before
deploying the app. Do not reapply 015/016 or bulk-push unsynchronized migrations.
