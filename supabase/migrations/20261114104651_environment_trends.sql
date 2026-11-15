-- pg-delta: transaction=false
-- Phase 1 only. CLI 2.118.0 standalone execution; never wrap in BEGIN/COMMIT.
-- No IF NOT EXISTS: a failed/invalid or unexpected index must stop deployment.
set lock_timeout = '2s';
set statement_timeout = '30s';

do $guard$
begin
  if exists (
    select 1 from pg_catalog.pg_index i
    where i.indrelid = 'public.matches'::regclass
      and i.indnkeyatts = 2 and i.indnatts = 2
      and i.indpred is null and i.indexprs is null
      and pg_catalog.pg_get_indexdef(i.indexrelid, 1, true) = 'environment_id'
      and pg_catalog.pg_get_indexdef(i.indexrelid, 2, true) = 'played_at'
  ) then
    raise exception 'Equivalent environment trend index exists; inspect definition, validity and migration history';
  end if;
end;
$guard$;

create index concurrently matches_environment_played_at_idx on public.matches (environment_id, played_at);

do $guard$
begin
  if not exists (
    select 1 from pg_catalog.pg_index i
    join pg_catalog.pg_class c on c.oid = i.indexrelid
    join pg_catalog.pg_am am on am.oid = c.relam
    where i.indexrelid = pg_catalog.to_regclass('public.matches_environment_played_at_idx')
      and i.indrelid = 'public.matches'::regclass
      and i.indisvalid and i.indisready and i.indislive
      and not i.indisunique and not i.indisexclusion
      and i.indnkeyatts = 2 and i.indnatts = 2 and am.amname = 'btree'
      and i.indpred is null and i.indexprs is null and i.indoption::text = '0 0'
      and pg_catalog.pg_get_indexdef(i.indexrelid, 1, true) = 'environment_id'
      and pg_catalog.pg_get_indexdef(i.indexrelid, 2, true) = 'played_at'
  ) then
    raise exception 'Valid environment trend index required; stop and inspect before RPC deployment';
  end if;
end;
$guard$;

reset lock_timeout;
reset statement_timeout;
