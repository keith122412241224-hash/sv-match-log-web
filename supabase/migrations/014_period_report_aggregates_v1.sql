-- Phase 2-C only. No table, policy, RLS, index, or existing RPC changes.
create or replace function public.get_period_report_aggregates_v1(
  p_current_start timestamptz,
  p_current_end timestamptz,
  p_previous_start timestamptz,
  p_previous_end timestamptz
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

  with periods(label, starts, ends) as (
    values ('current'::text, p_current_start, p_current_end),
           ('previous'::text, p_previous_start, p_previous_end)
  ), ordered as (
    select p.label, coalesce(m.my_archetype_id, m.my_deck_id) as my_id,
      coalesce(m.opponent_archetype_id, m.opponent_deck_id) as opponent_id,
      m.result,
      row_number() over (partition by p.label order by m.played_at desc, m.id desc) as ordinal
    from periods p join public.matches m on m.played_at >= p.starts and m.played_at <= p.ends
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

revoke all on function public.get_period_report_aggregates_v1(timestamptz,timestamptz,timestamptz,timestamptz) from public, anon;
grant execute on function public.get_period_report_aggregates_v1(timestamptz,timestamptz,timestamptz,timestamptz) to authenticated, service_role;
