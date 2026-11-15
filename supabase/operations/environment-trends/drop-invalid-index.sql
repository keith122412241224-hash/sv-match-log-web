-- Incident recovery only, after explicit production approval.
-- Execute with psql -X -v ON_ERROR_STOP=1 -f (no -1/BEGIN/pipeline).
-- Stop concurrent schema deployments first. Never drop a valid index using this file.
set lock_timeout = '2s';
set statement_timeout = '30s';
do $guard$
begin
  if not exists (
    select 1 from pg_catalog.pg_index i
    where i.indexrelid = pg_catalog.to_regclass('public.matches_environment_played_at_idx')
      and i.indrelid = 'public.matches'::regclass and not i.indisvalid
      and not i.indisunique and not i.indisexclusion
      and i.indnkeyatts = 2 and i.indnatts = 2
      and i.indpred is null and i.indexprs is null
      and pg_catalog.pg_get_indexdef(i.indexrelid, 1, true) = 'environment_id'
      and pg_catalog.pg_get_indexdef(i.indexrelid, 2, true) = 'played_at'
  ) then
    raise exception 'Expected failed trend index not found; manual review required';
  end if;
end;
$guard$;
drop index concurrently public.matches_environment_played_at_idx;
reset lock_timeout;
reset statement_timeout;
