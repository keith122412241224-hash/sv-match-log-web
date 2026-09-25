# Phase 2-C: Production contract fixed before implementation

Oracle: Git `e430a568dedd847aa38e34b90c7a45e9a63752c8`, not the original dirty workspace. Sources: `src/lib/data.ts` (`getWeeklyReport`, `getWeeklyReportMatchesForPeriod`, `getActiveArchetypes`), `weekly-report.ts`, `weekly-report-config.ts`, `match-perspectives.ts`, and `components/admin/WeeklyReport*`.

## Period and access
- Admin-only. The loader returns null for a non-admin. Data spans all users and environments. No rank, rating, environment, or arbitrary user input is added.
- `buildWeeklyPeriod`: start is JST 00:00:00.000, end is JST 23:59:59.999, including both endpoints (`gte` / `lte`). Default is seven days ending yesterday; an explicit end before the start is clamped to the start day.
- A microsecond after `.999000` is excluded even if still in the same calendar day. Do not replace with next-day exclusive.
- Day count is `max(1, round((end-day-start - start-day-start)/86400000)+1)`. Previous period shifts both dates by negative day count. Date validation/defaults stay in TypeScript.
- Old fetch selects id, both legacy/standard deck IDs, result, played_at; pages of 1000 ordered by played_at DESC, id DESC. Exact multiples require a final empty page. Both periods are fetched separately.
- This report does NOT fetch turn_order and has NO first/second aggregation or display. Adding it would change scope. It also has no recent-match list. Phase 2-B analysis remains independent.

## Counting, identity and stable order
- Registration counts are original row counts, including mirrors and unknown IDs. Opponent encounter counts use only original opponent IDs, divided by original registrations.
- Standard archetype ID takes precedence via nullish fallback to legacy deck ID. Distinct IDs with identical names remain distinct. Missing catalog entries display 不明; inactive/removed decks absent from the active catalog still contribute to all counts. No catalog JOIN in SQL.
- Deck rates combine direct wins and reversed losses-as-wins. A mirror contributes two perspectives (one win and one loss) to normal deck rates; registration/encounter counts stay one.
- Tier samples exclude rows with absent side IDs and mirrors. Mirror-only decks remain as zero-sample Tier candidates, appended in their original first-seen order after eligible decks. Previous Tier samples use the same exclusion.
- Unified matchup counts exclude mirrors and missing sides. Both directions map to one unordered ID pair, oriented by JavaScript `localeCompare`; each original row counts once. Winner is converted to the canonical A side in TypeScript.
- Map insertion follows original row ordering; direct precedes reversed per row. Sorting is stable. Opponent rank: count DESC, share DESC, Japanese name ASC. Deck rank: eligible first, rate DESC, count DESC, Japanese name ASC. Matchups: count DESC, A name ASC, B name ASC. Equal display names keep first-seen order. SQL must preserve that order, including timestamp ties using ID DESC.

## Evaluation retained verbatim in TypeScript
- `weekly-report-config.ts`: ranking minimum 10, major matchup 10; confidence <=9 insufficient, <=19 reference, otherwise sufficient. Comparison high requires both >=300 and smaller/larger >=0.5; medium both >=150; otherwise low.
- Tier: <10 samples or divergence => hold. Divergence is the existing exact integer cross-product comparison at >=25 points, with each side >=20. Tier1/2/3 thresholds are win rate 56/53/50 and Strength 78/66/54; otherwise Tier4.
- Strength = win-rate component * .45 + major-matchup component * .35 + confidence * .15 + trend * .05. Existing clamp, arithmetic order, weighted matchup sum and confidence/trend fallbacks are unchanged.
- Previous counts/rates, deltas, ranking, comparisons, warnings, reasons, confidence, correlation, top-N selection, Japanese labels, rounding, AI JSON and prompt remain existing functions. AI JSON excludes some internal fields and rounds at existing boundaries; no SQL percentages.
- Manual Tier overrides and related client state remain in existing WeeklyReport UI components. No UI files, config, prompt, Phase 2-A/B SQL or loaders are changed.

## RPC contract
`get_period_report_aggregates_v1(p_current_start timestamptz, p_current_end timestamptz, p_previous_start timestamptz, p_previous_end timestamptz)` returns `{version:1,current:{totalMatches,groups},previous:{totalMatches,groups}}`.
Each directed pair group is `{myDeckId,opponentDeckId,total,wins,firstOrdinal}`. IDs are nullable UUIDs. Counts and ordinal are integers; there are no raw rows, identities, raw timestamps, percentages or derived evaluation fields. Groups are ordered by the minimum ordinal in the original played_at DESC/id DESC row stream. TypeScript reduces these groups to all required direct/reversed/mirror-excluded counters without expanding pseudo-matches.

SECURITY INVOKER, empty search_path, explicit admin check (including when called directly); no anonymous access, PUBLIC/anon EXECUTE revoked, authenticated/service_role only. service_role without an admin identity is also denied. Existing RLS remains effective and unchanged. NULL or inverted ranges raise an argument error. Missing RPC, DB failures, permission failures and invalid JSON throw distinct application error categories rather than yielding zero.

This document describes local implementation and verification only. No Production SQL, push, or deployment is authorized in Phase 2-C.
