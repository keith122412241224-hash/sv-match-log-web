-- Starts empty. A stopped row retains its version token to reject stale approvals.
begin;
set local lock_timeout = '3s';

create table public.environment_review_member_releases (
  environment_id uuid primary key,
  run_id uuid not null,
  as_of timestamptz not null,
  source_published_at timestamptz not null,
  published_at timestamptz not null,
  edition uuid not null,
  active boolean not null,
  payload jsonb,
  check (active = (payload is not null)),
  foreign key (environment_id, run_id) references public.environment_review_runs(environment_id,id) on delete cascade
);
alter table public.environment_review_member_releases enable row level security;
revoke all on public.environment_review_member_releases from public, anon, authenticated, service_role;
grant select on public.environment_review_member_releases to authenticated;
create policy read_approved_or_admin on public.environment_review_member_releases for select to authenticated
  using ((select auth.uid()) is not null and ((select auth.jwt())->'is_anonymous') = 'false'::jsonb
    and (active or (select public.is_admin())));

-- Use only scalar report fields, even when the trial edition predates v2.
create function private.review_display_fields(doc jsonb, fields text[]) returns jsonb
language sql immutable security invoker set search_path = '' as $$
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(doc)
  where key = any(fields) and jsonb_typeof(value) in ('string','number','null')
$$;
create function private.review_display_rows(rows jsonb, fields text[]) returns jsonb
language sql immutable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(private.review_display_fields(item, fields) order by i),'[]'::jsonb)
  from jsonb_array_elements(rows) with ordinality t(item,i)
$$;

alter table public.environment_review_events drop constraint environment_review_events_action_check;
alter table public.environment_review_events add constraint environment_review_events_action_check
  check (action in ('snapshot','save','publish','withdraw','restore','failure','member_publish','member_stop'));

create function private.environment_review_member_action(p_environment uuid, p_run uuid,
  p_source_at timestamptz, p_expected_edition uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  trial public.environment_review_publications%rowtype;
  member public.environment_review_member_releases%rowtype;
  new_edition uuid := gen_random_uuid();
  snap jsonb;
  ev jsonb;
  prior jsonb;
  report jsonb;
begin
  perform private.require_environment_review_admin();
  perform pg_advisory_xact_lock(hashtextextended('environment_review:' || p_environment::text,0));
  select * into member from public.environment_review_member_releases where environment_id=p_environment;
  if p_run is null or p_source_at is null or member.edition is distinct from p_expected_edition then
    raise exception 'review_conflict' using errcode='40001';
  end if;
  if p_action = 'member_publish' then
    select * into trial from public.environment_review_publications where environment_id=p_environment;
    if trial.run_id is distinct from p_run or trial.published_at is distinct from p_source_at
       or (member.active and member.run_id=p_run and member.source_published_at=p_source_at) then
      raise exception 'review_conflict' using errcode='40001';
    end if;
    snap := trial.payload->'snapshot';
    ev := trial.payload->'evaluation';
    select coalesce(jsonb_object_agg(d->>'deckId',d->'tier'),'{}'::jsonb) into prior
      from jsonb_array_elements(member.payload#>'{evaluation,decks}') d;
    report := jsonb_build_object('previousTiers',prior,
      'snapshot',private.review_display_fields(snap,array['environmentId','environmentName','asOf','periodStart','matchCount'])
        || jsonb_build_object('decks',private.review_display_rows(snap->'decks',array['deckId','name','className','winRate','encounterRate']),
                              'pairs',private.review_display_rows(snap->'pairs',array['a','b','count','winRate'])),
      'evaluation',jsonb_build_object('overview',private.review_display_fields(ev->'overview',array['facts']),
        'decks',private.review_display_rows(ev->'decks',array['deckId','tier','reason']),
        'pairs',private.review_display_rows(ev->'pairs',array['a','b','rating','reason'])));
    insert into public.environment_review_member_releases values
      (p_environment,p_run,trial.as_of,p_source_at,clock_timestamp(),new_edition,true,report)
      on conflict (environment_id) do update set run_id=excluded.run_id,as_of=excluded.as_of,
        source_published_at=excluded.source_published_at,published_at=excluded.published_at,
        edition=excluded.edition,active=true,payload=excluded.payload;
  elsif p_action = 'member_stop' then
    if member.active is not true or member.run_id is distinct from p_run or member.source_published_at is distinct from p_source_at then
      raise exception 'review_conflict' using errcode='40001';
    end if;
    update public.environment_review_member_releases set active=false,payload=null,edition=new_edition where environment_id=p_environment;
  else
    raise exception 'invalid_action' using errcode='22023';
  end if;
  insert into public.environment_review_events(environment_id,run_id,actor_id,action,after_data)
    values (p_environment,p_run,auth.uid(),p_action,jsonb_build_object('sourcePublishedAt',p_source_at,'edition',new_edition));
end $$;

create function public.environment_review_member_action(p_environment uuid, p_run uuid,
  p_source_at timestamptz, p_expected_edition uuid, p_action text)
returns void language sql security invoker set search_path = '' as $$
  select private.environment_review_member_action(p_environment,p_run,p_source_at,p_expected_edition,p_action)
$$;
revoke all on function private.review_display_fields(jsonb,text[]),private.review_display_rows(jsonb,text[]),
  private.environment_review_member_action(uuid,uuid,timestamptz,uuid,text),
  public.environment_review_member_action(uuid,uuid,timestamptz,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.environment_review_member_action(uuid,uuid,timestamptz,uuid,text),
  public.environment_review_member_action(uuid,uuid,timestamptz,uuid,text) to authenticated;
commit;
