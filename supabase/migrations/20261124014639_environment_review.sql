-- One immutable measurement snapshot per run. Only the member projection is
-- readable by ordinary members; no draft or audit columns exist in that table.
begin;
set local lock_timeout = '3s';

create table public.environment_review_runs (
  id uuid primary key,
  environment_id uuid not null references public.environments(id) on delete cascade,
  as_of timestamptz not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  mode text not null check (mode in ('manual', 'auto')),
  revision integer not null default 0 check (revision >= 0),
  status text not null default 'snapshot' check (status in ('snapshot', 'draft', 'published', 'archived')),
  analysis jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment_id, as_of),
  unique (environment_id, id)
);

create table public.environment_review_publications (
  environment_id uuid primary key,
  run_id uuid not null,
  as_of timestamptz not null,
  published_at timestamptz not null,
  payload jsonb not null,
  foreign key (environment_id, run_id)
    references public.environment_review_runs(environment_id, id) on delete cascade
);

create table public.environment_review_events (
  id bigint generated always as identity primary key,
  environment_id uuid not null references public.environments(id) on delete cascade,
  run_id uuid,
  actor_id uuid not null,
  action text not null check (action in ('snapshot','save','publish','withdraw','restore','failure')),
  reason text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now(),
  foreign key (environment_id, run_id)
    references public.environment_review_runs(environment_id, id) on delete cascade
);
create index environment_review_events_env_id on public.environment_review_events(environment_id, id desc);
create index environment_review_events_run_id on public.environment_review_events(run_id, id desc);

alter table public.environment_review_runs enable row level security;
alter table public.environment_review_publications enable row level security;
alter table public.environment_review_events enable row level security;
revoke all on public.environment_review_runs, public.environment_review_publications,
  public.environment_review_events from public, anon, authenticated, service_role;
grant select on public.environment_review_runs, public.environment_review_publications,
  public.environment_review_events to authenticated;
revoke all on sequence public.environment_review_events_id_seq from public, anon, authenticated, service_role;

create policy read_review_runs_admin on public.environment_review_runs for select to authenticated
  using ((select auth.uid()) is not null and ((select auth.jwt())->'is_anonymous') = 'false'::jsonb and (select public.is_admin()));
create policy read_review_events_admin on public.environment_review_events for select to authenticated
  using ((select auth.uid()) is not null and ((select auth.jwt())->'is_anonymous') = 'false'::jsonb and (select public.is_admin()));
-- Pilot audience. Keep the member-safe projection but authorize only admins.
create policy read_published_reviews_admin on public.environment_review_publications for select to authenticated
  using ((select auth.uid()) is not null and ((select auth.jwt())->'is_anonymous') = 'false'::jsonb and (select public.is_admin()));

create function private.require_environment_review_admin() returns void
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null or (auth.jwt()->'is_anonymous') is distinct from 'false'::jsonb
     or public.is_admin() is not true then
    raise exception 'admin_required' using errcode = '42501';
  end if;
end $$;

create function private.environment_review_create(
  p_id uuid, p_environment_id uuid, p_as_of timestamptz, p_snapshot jsonb, p_mode text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_environment_review_admin();
  if (p_snapshot->>'snapshotId')::uuid is distinct from p_id
     or (p_snapshot->>'environmentId')::uuid is distinct from p_environment_id
     or (p_snapshot->>'asOf')::timestamptz is distinct from p_as_of
     or p_as_of > now() + interval '1 minute' then
    raise exception 'invalid_snapshot_identity' using errcode = '22023';
  end if;
  insert into public.environment_review_runs(id, environment_id, as_of, snapshot, mode)
    values (p_id, p_environment_id, p_as_of, p_snapshot, p_mode);
  insert into public.environment_review_events(environment_id, run_id, actor_id, action)
    values (p_environment_id, p_id, auth.uid(), 'snapshot');
  return p_id;
end $$;

-- Explicit projection also rejects substituted measurements, irrespective of
-- the analysis editor. Preserve source order when stripping admin-only fields.
create function private.review_keys(doc jsonb, allowed text[]) returns jsonb
language sql immutable security invoker set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(doc) where key = any(allowed)
$$;

create function private.review_member_snapshot(doc jsonb) returns jsonb
language sql immutable security invoker set search_path = '' as $$
  select private.review_keys(doc, array['snapshotId','environmentId','environmentName','asOf',
    'periodStart','shortPeriodStart','ranks','matchCount','shortMatchCount']) ||
    jsonb_build_object(
      'decks', coalesce((select jsonb_agg(private.review_keys(d, array['deckId','name','className',
        'count','winRate','encounterRate','useWinRate','dataTier','short','byRank','byDay']) order by i)
        from jsonb_array_elements(doc->'decks') with ordinality t(d,i)), '[]'::jsonb),
      'pairs', coalesce((select jsonb_agg(private.review_keys(d, array['a','b','count','winRate','dataRating']) order by i)
        from jsonb_array_elements(doc->'pairs') with ordinality t(d,i)), '[]'::jsonb))
$$;

-- Preserve the public field contract even for a direct admin RPC caller.
create function private.review_public_shape(doc jsonb) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare
  kind text;
  item jsonb;
  gap jsonb;
  fields text[];
begin
  if jsonb_typeof(doc) is distinct from 'object'
    or doc - array['overview','comparison','changes','decks','pairs'] <> '{}'::jsonb
    or jsonb_typeof(doc->'overview') is distinct from 'object'
    or (doc->'overview') - array['facts','hypothesis'] <> '{}'::jsonb
    or jsonb_typeof(doc#>'{overview,facts}') is distinct from 'string'
    or jsonb_typeof(doc#>'{overview,hypothesis}') is distinct from 'string'
    or jsonb_typeof(doc->'changes') is distinct from 'string'
    or coalesce(doc->>'comparison','') not in ('available','partial','unavailable') then
    return false;
  end if;
  foreach kind in array array['decks','pairs'] loop
    if jsonb_typeof(doc->kind) is distinct from 'array' then return false; end if;
    fields := case when kind = 'decks' then array['deckId','tier'] else array['a','b','rating'] end;
    for item in select value from jsonb_array_elements(doc->kind) loop
      if jsonb_typeof(item) is distinct from 'object'
        or item - (fields || array['reason','confidence','divergence']) <> '{}'::jsonb
        or jsonb_typeof(item->'reason') is distinct from 'string'
        or coalesce(item->>'confidence','') not in ('高','中','低','判断保留')
        or (kind = 'decks' and (jsonb_typeof(item->'deckId') is distinct from 'string'
            or coalesce(item->'tier','{}') not in ('null','1','2','3','4','5')))
        or (kind = 'pairs' and (jsonb_typeof(item->'a') is distinct from 'string'
            or jsonb_typeof(item->'b') is distinct from 'string'
            or coalesce(item->'rating','{}') not in ('null','-2','-1','0','1','2'))) then
        return false;
      end if;
      gap := item->'divergence';
      if gap = 'null'::jsonb then continue; end if;
      if jsonb_typeof(gap) is distinct from 'object'
        or gap - array['status','direction','importance','facts','hypothesis'] <> '{}'::jsonb
        or coalesce(gap->>'status','') not in ('確認済み','要検証')
        or coalesce(gap->>'direction','') not in ('過小評価の可能性','過大評価の可能性','評価が分かれている','判断保留')
        or coalesce(gap->'importance','{}') not in ('1','2','3','4','5')
        or jsonb_typeof(gap->'facts') is distinct from 'string'
        or jsonb_typeof(gap->'hypothesis') is distinct from 'string' then return false; end if;
    end loop;
  end loop;
  return true;
end $$;

create function private.environment_review_transition(
  p_id uuid, p_revision integer, p_action text, p_analysis jsonb, p_public jsonb,
  p_reason text, p_expected_publication_id uuid, p_restore_event_id bigint)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  item public.environment_review_runs%rowtype;
  current_pub public.environment_review_publications%rowtype;
  current_env uuid;
  next_payload jsonb;
  expected_tiers jsonb;
  next_analysis jsonb;
  next_published_at timestamptz;
  note text := nullif(btrim(p_reason), '');
  previous_state jsonb;
  next_state jsonb;
begin
  perform private.require_environment_review_admin();
  select environment_id into strict current_env from public.environment_review_runs where id = p_id;
  -- Always acquire the environment lock first. It covers the initial empty
  -- publication slot as well as edits to separate runs of the same environment.
  perform pg_advisory_xact_lock(hashtextextended('environment_review:' || current_env::text, 0));
  select * into strict item from public.environment_review_runs where id = p_id for update;
  select * into current_pub from public.environment_review_publications where environment_id = current_env;
  if p_revision is distinct from item.revision
     or p_expected_publication_id is distinct from current_pub.run_id then
    raise exception 'review_conflict' using errcode = '40001';
  end if;
  if p_action is null or p_action not in ('save','publish','withdraw','restore')
     or char_length(note) > 1200 or (p_restore_event_id is not null and p_action <> 'restore') then
    raise exception 'invalid_action_or_reason' using errcode = '22023';
  end if;
  if (p_action = 'restore' or (p_action = 'save' and item.analysis is not null)) and note is null then
    raise exception 'review_reason_required' using errcode = '22023';
  end if;
  if p_action in ('save', 'publish') and exists (
    select 1 from public.environment_review_runs
    where environment_id = current_env and as_of > item.as_of and analysis is not null
  ) then
    raise exception 'older_review' using errcode = '23514';
  end if;
  previous_state := jsonb_build_object('status', item.status, 'revision', item.revision,
    'publicationId', current_pub.run_id);

  if p_action = 'save' then
    if jsonb_typeof(p_analysis) is distinct from 'object'
       or (p_analysis->>'snapshotId')::uuid is distinct from p_id
       or (p_analysis->>'environmentId')::uuid is distinct from current_env
       or not private.review_public_shape(p_analysis->'public') then
      raise exception 'invalid_review_identity' using errcode = '22023';
    end if;
    if p_analysis = item.analysis then
      raise exception 'duplicate_analysis' using errcode = '23505';
    end if;
    update public.environment_review_runs set analysis = p_analysis, status = 'draft' where id = p_id;
    previous_state := previous_state || jsonb_build_object('analysis', item.analysis);
    next_state := jsonb_build_object('analysis', p_analysis);
  elsif p_action = 'withdraw' then
    if current_pub.run_id is distinct from p_id then
      raise exception 'not_current_publication' using errcode = '23514';
    end if;
    delete from public.environment_review_publications where environment_id = current_env and run_id = p_id;
    update public.environment_review_runs set status = case when item.status = 'draft' then 'draft' else 'archived' end
      where id = p_id;
    next_state := jsonb_build_object('publicationId', null);
  else
    if p_action = 'publish' then
      if current_pub.run_id = p_id then
        expected_tiers := current_pub.payload->'previousTiers';
      else
        select coalesce(jsonb_object_agg(d->>'deckId', d->'tier'), '{}'::jsonb) into expected_tiers
          from jsonb_array_elements(current_pub.payload->'evaluation'->'decks') d;
      end if;
      if item.status <> 'draft' or item.analysis is null
         or jsonb_typeof(p_public) is distinct from 'object'
         or (p_public - array['snapshot','evaluation','previousTiers']) <> '{}'::jsonb
         or (p_public->'snapshot') is distinct from private.review_member_snapshot(item.snapshot)
         or (p_public->'evaluation') is distinct from (item.analysis->'public')
         or (p_public->'previousTiers') is distinct from expected_tiers then
        raise exception 'invalid_review_projection' using errcode = '22023';
      end if;
      if exists (select 1 from jsonb_each(p_public->'previousTiers') where
        key !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' or
        value not in ('null'::jsonb,'1'::jsonb,'2'::jsonb,'3'::jsonb,'4'::jsonb,'5'::jsonb)) then
        raise exception 'invalid_previous_tiers' using errcode = '22023';
      end if;
      next_payload := p_public;
      next_analysis := item.analysis;
      next_published_at := clock_timestamp();
    else
      -- Both a selected historic edition and the default last approved edition
      -- come from an immutable publication event of this very run.
      select after_data->'payload', after_data->'analysis', (after_data->>'publishedAt')::timestamptz
        into next_payload, next_analysis, next_published_at
        from public.environment_review_events where run_id = p_id and action = 'publish'
          and (p_restore_event_id is null or id = p_restore_event_id)
        order by id desc limit 1;
      if next_payload is null or (current_pub.run_id = p_id and item.status = 'published'
          and current_pub.published_at = next_published_at and current_pub.payload = next_payload) then
        raise exception 'review_not_restorable' using errcode = '23514';
      end if;
      previous_state := previous_state || jsonb_build_object('analysis', item.analysis);
    end if;
    if current_pub.run_id is not null and current_pub.run_id <> p_id then
      update public.environment_review_runs
        set status = case when status = 'published' then 'archived' else status end,
            revision = revision + 1, updated_at = clock_timestamp()
        where id = current_pub.run_id;
    end if;
    insert into public.environment_review_publications (environment_id, run_id, as_of, published_at, payload)
      values (current_env, p_id, item.as_of, next_published_at, next_payload)
      on conflict (environment_id) do update set run_id = excluded.run_id, as_of = excluded.as_of,
        published_at = excluded.published_at, payload = excluded.payload;
    update public.environment_review_runs set status = 'published', analysis = next_analysis,
      published_at = next_published_at where id = p_id;
    next_state := jsonb_build_object('publicationId', p_id, 'publishedAt', next_published_at,
      'analysis', next_analysis, 'payload', next_payload);
  end if;

  update public.environment_review_runs set revision = revision + 1, updated_at = clock_timestamp()
    where id = p_id returning * into item;
  insert into public.environment_review_events(environment_id, run_id, actor_id, action, reason, before_data, after_data)
    values (current_env, p_id, auth.uid(), p_action, note, previous_state,
      next_state || jsonb_build_object('status', item.status, 'revision', item.revision));
  return item.revision;
end $$;

create function private.environment_review_failure(p_environment_id uuid, p_run_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_environment_review_admin();
  if nullif(btrim(p_reason), '') is null or char_length(p_reason) > 1200 then
    raise exception 'invalid_failure_reason' using errcode = '22023';
  end if;
  insert into public.environment_review_events(environment_id, run_id, actor_id, action, reason)
    values (p_environment_id, p_run_id, auth.uid(), 'failure', p_reason);
end $$;

create function public.environment_review_create(
  p_id uuid, p_environment_id uuid, p_as_of timestamptz, p_snapshot jsonb, p_mode text default 'manual')
returns uuid language sql volatile security invoker set search_path = '' as $$
  select private.environment_review_create(p_id, p_environment_id, p_as_of, p_snapshot, p_mode)
$$;
create function public.environment_review_transition(
  p_id uuid, p_revision integer, p_action text, p_analysis jsonb, p_public jsonb, p_reason text,
  p_expected_publication_id uuid, p_restore_event_id bigint default null)
returns integer language sql volatile security invoker set search_path = '' as $$
  select private.environment_review_transition(p_id, p_revision, p_action, p_analysis, p_public, p_reason, p_expected_publication_id, p_restore_event_id)
$$;
create function public.environment_review_failure(p_environment_id uuid, p_run_id uuid, p_reason text)
returns void language sql volatile security invoker set search_path = '' as $$
  select private.environment_review_failure(p_environment_id, p_run_id, p_reason)
$$;

revoke all on function private.require_environment_review_admin(), private.review_keys(jsonb,text[]),
  private.review_member_snapshot(jsonb), private.review_public_shape(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.environment_review_create(uuid,uuid,timestamptz,jsonb,text),
  private.environment_review_transition(uuid,integer,text,jsonb,jsonb,text,uuid,bigint),
  private.environment_review_failure(uuid,uuid,text),
  public.environment_review_create(uuid,uuid,timestamptz,jsonb,text),
  public.environment_review_transition(uuid,integer,text,jsonb,jsonb,text,uuid,bigint),
  public.environment_review_failure(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function private.environment_review_create(uuid,uuid,timestamptz,jsonb,text),
  private.environment_review_transition(uuid,integer,text,jsonb,jsonb,text,uuid,bigint),
  private.environment_review_failure(uuid,uuid,text),
  public.environment_review_create(uuid,uuid,timestamptz,jsonb,text),
  public.environment_review_transition(uuid,integer,text,jsonb,jsonb,text,uuid,bigint),
  public.environment_review_failure(uuid,uuid,text) to authenticated;

commit;
