-- Phase 2: additive child of a Phase 1 Tier work. Never cascade a parent deletion.
begin;
create table public.creator_correlations (
  id uuid primary key default gen_random_uuid(),
  tier_work_id uuid not null unique references public.creator_tier_works(id) on delete restrict,
  document jsonb not null,
  revision integer not null default 1 check (revision > 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index creator_correlations_created_by_idx on public.creator_correlations(created_by);
create table public.creator_correlation_image_refs (
  correlation_id uuid not null references public.creator_correlations(id) on delete cascade,
  image_id uuid not null references public.creator_images(id) on delete restrict,
  primary key(correlation_id,image_id)
);
create index creator_correlation_refs_image_idx on public.creator_correlation_image_refs(image_id);

create function public.creator_validate_correlation() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare n jsonb; e jsonb; node_ids text[] := '{}'; edge_ids text[] := '{}'; pairs text[] := '{}'; pair text; field text;
begin
  if tg_op = 'UPDATE' and new.tier_work_id is distinct from old.tier_work_id then
    raise exception 'A correlation cannot be reparented' using errcode = '23514';
  end if;
  if jsonb_typeof(new.document) is distinct from 'object'
    or new.document->'version' is distinct from '1'::jsonb
    or jsonb_typeof(new.document->'showTitle') is distinct from 'boolean'
    or jsonb_typeof(new.document->'showNames') is distinct from 'boolean'
    or jsonb_typeof(new.document->'nodes') is distinct from 'array'
    or jsonb_typeof(new.document->'edges') is distinct from 'array' then
    raise exception 'Invalid correlation document' using errcode = '23514';
  end if;
  if jsonb_array_length(new.document->'nodes') > 300 or jsonb_array_length(new.document->'edges') > 600 then
    raise exception 'Correlation capacity exceeded' using errcode = '23514';
  end if;
  for n in select value from jsonb_array_elements(new.document->'nodes') loop
    foreach field in array array['id','imageId'] loop
      if jsonb_typeof(n->field) is distinct from 'string' or (n->>field) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Invalid node ID' using errcode = '23514';
      end if;
    end loop;
    if n->>'id' = any(node_ids) then raise exception 'Duplicate node ID' using errcode = '23514'; end if;
    node_ids := array_append(node_ids,n->>'id');
    foreach field in array array['x','y','width','height'] loop
      if jsonb_typeof(n->field) is distinct from 'number' then raise exception 'Invalid node coordinate' using errcode = '23514'; end if;
    end loop;
    if (n->>'width')::numeric not between 24 and 480 or (n->>'height')::numeric not between 24 and 480
      or (n->>'x')::numeric < 0 or (n->>'y')::numeric < 0
      or (n->>'x')::numeric + (n->>'width')::numeric > 1920
      or (n->>'y')::numeric + (n->>'height')::numeric > 1080 then
      raise exception 'Node is outside logical canvas' using errcode = '23514';
    end if;
  end loop;
  for e in select value from jsonb_array_elements(new.document->'edges') loop
    if jsonb_typeof(e->'id') is distinct from 'string'
      or (e->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or e->>'id' = any(edge_ids)
      or jsonb_typeof(e->'sourceNodeId') is distinct from 'string'
      or jsonb_typeof(e->'targetNodeId') is distinct from 'string'
      or not (e->>'sourceNodeId' = any(node_ids)) or not (e->>'targetNodeId' = any(node_ids))
      or e->>'sourceNodeId' = e->>'targetNodeId'
      or e->>'origin' is distinct from 'manual'
      or jsonb_typeof(e->'label') is distinct from 'string' or length(e->>'label') > 60
      or jsonb_typeof(e->'visible') is distinct from 'boolean' then
      raise exception 'Invalid correlation edge' using errcode = '23514';
    end if;
    pair := least(e->>'sourceNodeId',e->>'targetNodeId') || ':' || greatest(e->>'sourceNodeId',e->>'targetNodeId');
    if pair = any(pairs) then raise exception 'Duplicate edge pair' using errcode = '23514'; end if;
    edge_ids := array_append(edge_ids,e->>'id'); pairs := array_append(pairs,pair);
  end loop;
  return new;
end;
$$;
create function public.creator_sync_correlation_refs() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.creator_correlation_image_refs where correlation_id = new.id;
  insert into public.creator_correlation_image_refs(correlation_id,image_id)
    select distinct new.id,(n->>'imageId')::uuid from jsonb_array_elements(new.document->'nodes') n;
  return new;
end;
$$;
revoke all on function public.creator_validate_correlation(),public.creator_sync_correlation_refs() from public,anon,authenticated;
create trigger creator_correlation_validate before insert or update on public.creator_correlations for each row execute function public.creator_validate_correlation();
create trigger creator_correlation_refs after insert or update of document on public.creator_correlations for each row execute function public.creator_sync_correlation_refs();
create trigger creator_correlation_revision before update on public.creator_correlations for each row execute function public.creator_touch_revision();
alter table public.creator_correlations enable row level security;
alter table public.creator_correlation_image_refs enable row level security;
revoke all on public.creator_correlations,public.creator_correlation_image_refs from public,anon,authenticated;
grant select,insert,update,delete on public.creator_correlations,public.creator_correlation_image_refs to authenticated;
create policy creator_correlations_admin on public.creator_correlations for all to authenticated
  using ((select public.is_admin()) and coalesce((select auth.jwt()->>'is_anonymous'),'true') = 'false')
  with check ((select public.is_admin()) and coalesce((select auth.jwt()->>'is_anonymous'),'true') = 'false');
create policy creator_correlation_refs_admin on public.creator_correlation_image_refs for all to authenticated
  using ((select public.is_admin()) and coalesce((select auth.jwt()->>'is_anonymous'),'true') = 'false')
  with check ((select public.is_admin()) and coalesce((select auth.jwt()->>'is_anonymous'),'true') = 'false');
commit;
