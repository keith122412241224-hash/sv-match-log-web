begin;
-- R4 only: additive period-report rank filter. Existing v1 and schema stay unchanged.
create or replace function public.get_period_report_aggregates_v2(
  p_current_start timestamptz,
  p_current_end timestamptz,
  p_previous_start timestamptz,
  p_previous_end timestamptz,
  p_rank_filter text default 'all'
) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare report_payload jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_current_start is null or p_current_end is null or p_previous_start is null or p_previous_end is null
    or p_current_start > p_current_end or p_previous_start > p_previous_end then
    raise exception 'Invalid period bounds' using errcode = '22023';
  end if;

  if p_rank_filter is not null and p_rank_filter not in ('all', 'master-plus', 'master', 'grandmaster', 'master:emerald', 'master:topaz', 'master:ruby', 'master:sapphire', 'master:diamond', 'grandmaster:none', 'grandmaster:epic', 'grandmaster:ultimate', 'grandmaster:legend', 'grandmaster:beyond') then
    raise exception 'Invalid period report rank filter' using errcode = '22023';
  end if;
  if p_rank_filter is null or p_rank_filter = 'all' then
    return public.get_period_report_aggregates_v1(p_current_start, p_current_end, p_previous_start, p_previous_end);
  end if;

  with periods(label, starts, ends) as (
    values ('current'::text, p_current_start, p_current_end),
           ('previous'::text, p_previous_start, p_previous_end)
  ), ordered as (
    select p.label, coalesce(m.my_archetype_id, m.my_deck_id) as my_id,
      coalesce(m.opponent_archetype_id, m.opponent_deck_id) as opponent_id,
      m.result,
      row_number() over (partition by p.label order by m.played_at desc, m.id desc) as ordinal
    from periods p join public.matches m on m.played_at >= p.starts and m.played_at <= p.ends
    where (p_rank_filter = 'master-plus' and m.rank_tier in ('master', 'grandmaster'))
      or (p_rank_filter = 'master' and m.rank_tier = 'master')
      or (p_rank_filter = 'grandmaster' and m.rank_tier = 'grandmaster')
      or (m.rank_tier = 'master' and p_rank_filter = 'master:' || m.master_group)
      or (m.rank_tier = 'grandmaster' and p_rank_filter = 'grandmaster:' || m.grandmaster_rating)
  ), grouped as (
    select label, my_id, opponent_id, count(*) as total,
      count(*) filter (where result = 'win') as wins, min(ordinal) as first_ordinal
    from ordered group by label, my_id, opponent_id
  ), payloads as (
    select label, jsonb_build_object('totalMatches', sum(total), 'groups',
      jsonb_agg(jsonb_build_object('myDeckId', my_id, 'opponentDeckId', opponent_id,
        'total', total, 'wins', wins, 'firstOrdinal', first_ordinal) order by first_ordinal)) as payload
    from grouped group by label
  )
  select jsonb_build_object('version', 1,
    'current', coalesce((select payload from payloads where label = 'current'), '{"totalMatches":0,"groups":[]}'::jsonb),
    'previous', coalesce((select payload from payloads where label = 'previous'), '{"totalMatches":0,"groups":[]}'::jsonb))
  into report_payload;
  return report_payload;
end;
$$;

revoke all on function public.get_period_report_aggregates_v2(timestamptz,timestamptz,timestamptz,timestamptz,text) from public, anon;
grant execute on function public.get_period_report_aggregates_v2(timestamptz,timestamptz,timestamptz,timestamptz,text) to authenticated, service_role;

commit;
