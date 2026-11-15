-- Incident recovery only, after explicit production approval. Not an automatic migration.
-- Revoke both entrypoints; old summary/analysis and match input remain available.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '5s';
revoke execute on function public.get_environment_trend_aggregates_v1(uuid,text,text[],uuid[]) from authenticated;
revoke execute on function private.get_environment_trend_aggregates_v1(uuid,text,text[],uuid[]) from authenticated;
commit;
-- Already running queries are not cancelled by REVOKE. Inspect them separately.
