begin;

-- Only a bounded public projection is cached. Neither clients nor the Data API
-- can read or modify the cache table directly.
create table private.public_encounter_cache (
  environment_id uuid primary key references public.environments(id) on delete cascade,
  period_start timestamptz,
  period_end timestamptz not null,
  refreshed_at timestamptz not null,
  snapshot jsonb
);
alter table private.public_encounter_cache enable row level security;
revoke all on private.public_encounter_cache from public, anon, authenticated, service_role;

create function private.current_public_encounters(p_expected_environment_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  as_of constant timestamptz := statement_timestamp();
  env record;
  starts timestamptz;
  ends timestamptz;
  result jsonb;
begin
  -- The caller's ID is a consistency check, never a history/filter selector.
  select e.id, e.name, e.dashboard_end_at into env
    from public.environments e
    where public.is_match_input_window_open(e.allow_match_input, e.match_input_start_at, e.match_input_end_at, as_of)
    order by e.created_at desc, e.start_date desc nulls last, e.id limit 1;
  if not found or env.id is distinct from p_expected_environment_id then return null; end if;

  if env.dashboard_end_at <= as_of then
    ends := env.dashboard_end_at; -- v4 default is all time, no lower bound
  else
    ends := date_bin(interval '30 minutes', as_of, timestamptz '1970-01-01 00:00Z');
    starts := ends - interval '168 hours';
  end if;

  select c.snapshot into result from private.public_encounter_cache c
   where c.environment_id = env.id and c.period_start is not distinct from starts and c.period_end = ends
     and c.refreshed_at > as_of - interval '5 minutes';
  if not found then
    -- Concurrent misses elect a single refresher. The claim and the computed
    -- value commit together; errors leave no partially refreshed snapshot.
    insert into private.public_encounter_cache as c(environment_id, period_start, period_end, refreshed_at)
      values (env.id, starts, ends, as_of)
    on conflict (environment_id) do update
      set period_start = excluded.period_start, period_end = excluded.period_end, refreshed_at = excluded.refreshed_at
      where c.period_start is distinct from excluded.period_start or c.period_end <> excluded.period_end
         or c.refreshed_at <= excluded.refreshed_at - interval '5 minutes';
    if found then
      -- v4 all-ranks population: matches_rank_metadata_check enforces the 17
      -- supported atoms (including unranked). An encounter always qualifies
      -- as a target registration, including a mirror. Count each match once.
      with counts as materialized (
        select m.opponent_archetype_id as id, count(*) as n
        from public.matches m
        where m.environment_id = env.id and m.played_at < ends
          and (starts is null or m.played_at >= starts)
        group by m.opponent_archetype_id
      ), top_three as (
        select a.name, c.id, c.n from counts c join public.deck_archetypes a on a.id = c.id
        order by c.n desc, c.id limit 3
      ), population as (
        select sum(n)::bigint as total from counts -- includes unclassified opponents
      )
      select case when count(*) > 0 then jsonb_build_object(
        'periodStart', starts, 'periodEnd', ends, 'updatedAt', as_of,
        'totalMatches', max(p.total), 'decks', jsonb_agg(jsonb_build_object(
          'name', t.name, 'encounterRate', t.n::double precision / p.total * 100
        ) order by t.n desc, t.id)
      ) end into result from top_three t cross join population p;
      update private.public_encounter_cache set snapshot = result where environment_id = env.id;
    else
      select c.snapshot into result from private.public_encounter_cache c
        where c.environment_id = env.id and c.period_start is not distinct from starts and c.period_end = ends;
    end if;
  end if;
  return result || jsonb_build_object('environmentName', env.name);
end;
$$;

-- A parsed SQL body binds the private function at creation. No additional
-- private-schema USAGE or table privileges are needed by the public caller.
create function public.get_current_public_encounters(p_expected_environment_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
return private.current_public_encounters(p_expected_environment_id);

alter function private.current_public_encounters(uuid) owner to postgres;
alter function public.get_current_public_encounters(uuid) owner to postgres;
revoke all on function private.current_public_encounters(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_current_public_encounters(uuid) from public, anon, authenticated, service_role;
grant execute on function private.current_public_encounters(uuid) to anon, authenticated;
grant execute on function public.get_current_public_encounters(uuid) to anon, authenticated;

commit;
