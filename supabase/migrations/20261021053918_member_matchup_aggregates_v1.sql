-- Exact aggregate-only matrix access for non-anonymous members.
-- Existing tables, RLS, grants and admin RPCs are unchanged.
begin;

create function private.get_member_matchup_aggregates_v1(p_environment_id uuid, p_rank_filters text[])
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
begin
  -- The signed top-level claim must be a JSON boolean, never editable metadata.
  if auth.uid() is null
    or (auth.jwt() -> 'is_anonymous') is distinct from 'false'::jsonb then
    raise exception 'Member authentication required' using errcode = '42501';
  end if;
  if p_rank_filters is null or pg_catalog.array_ndims(p_rank_filters) is distinct from 1
    or pg_catalog.cardinality(p_rank_filters) not between 1 and 17
    or exists (
      select 1 from pg_catalog.unnest(p_rank_filters) v
      where v is null or not (v = any(array[
        'unranked', 'beginner', 'd', 'c', 'b', 'a', 'aa',
        'master:emerald', 'master:topaz', 'master:ruby', 'master:sapphire', 'master:diamond',
        'grandmaster:none', 'grandmaster:epic', 'grandmaster:ultimate', 'grandmaster:legend', 'grandmaster:beyond'
      ]::text[]))
    ) then
    raise exception 'Invalid atomic rank selection' using errcode = '22023';
  end if;
  if p_environment_id is null or not exists (
    select 1 from public.environments e where e.id = p_environment_id
  ) then
    raise exception 'Invalid matchup environment' using errcode = '22023';
  end if;

  return (
    with grouped as (
      select coalesce(m.my_archetype_id, m.my_deck_id) as my_id,
        coalesce(m.opponent_archetype_id, m.opponent_deck_id) as opponent_id,
        pg_catalog.count(*) as total,
        pg_catalog.count(*) filter (where m.result = 'win') as wins
      from public.matches m
      where m.environment_id = p_environment_id
        and (case when m.rank_tier is null then 'unranked'
          when m.rank_tier = 'master' then 'master:' || m.master_group
          when m.rank_tier = 'grandmaster' then 'grandmaster:' || m.grandmaster_rating
          else m.rank_tier end) = any(p_rank_filters)
      -- ANY is a membership test: duplicate ranks never multiply matches.
      -- No reversal, individual records, private deck names or user identifiers.
      group by coalesce(m.my_archetype_id, m.my_deck_id),
        coalesce(m.opponent_archetype_id, m.opponent_deck_id)
    )
    select pg_catalog.jsonb_build_object(
      'version', 1,
      'totalMatches', coalesce(pg_catalog.sum(total), 0),
      'groups', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'myDeckId', my_id, 'opponentDeckId', opponent_id, 'total', total, 'wins', wins
      ) order by my_id, opponent_id), '[]'::jsonb)
    ) from grouped
  );
end;
$function$;

create function public.get_member_matchup_aggregates_v1(p_environment_id uuid, p_rank_filters text[])
returns jsonb language sql stable security invoker set search_path = ''
as $function$
  select private.get_member_matchup_aggregates_v1(p_environment_id, p_rank_filters)
$function$;

alter function private.get_member_matchup_aggregates_v1(uuid,text[]) owner to postgres;
revoke all on function private.get_member_matchup_aggregates_v1(uuid,text[]) from public, anon, authenticated, service_role;
grant execute on function private.get_member_matchup_aggregates_v1(uuid,text[]) to authenticated;
alter function public.get_member_matchup_aggregates_v1(uuid,text[]) owner to postgres;
revoke all on function public.get_member_matchup_aggregates_v1(uuid,text[]) from public, anon, authenticated, service_role;
grant execute on function public.get_member_matchup_aggregates_v1(uuid,text[]) to authenticated;

commit;
