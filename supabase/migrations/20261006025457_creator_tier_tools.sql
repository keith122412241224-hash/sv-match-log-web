-- Phase 1 only. Additive migration; no existing tables, RPCs or policies altered.
begin;

create table public.creator_images (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  object_path text not null unique check (object_path ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'),
  archetype_id uuid references public.deck_archetypes(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index creator_images_archetype_idx on public.creator_images(archetype_id);
create index creator_images_creator_idx on public.creator_images(created_by);

create table public.creator_tier_works (
  id uuid primary key default gen_random_uuid(),
  document jsonb not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index creator_tier_works_updated_idx on public.creator_tier_works(updated_at desc);
create index creator_tier_works_creator_idx on public.creator_tier_works(created_by);

-- Derived references protect deletion with an actual FK, including concurrent saves.
create table public.creator_tier_image_refs (
  work_id uuid not null references public.creator_tier_works(id) on delete cascade,
  image_id uuid not null references public.creator_images(id) on delete restrict,
  primary key(work_id, image_id)
);
create index creator_tier_image_refs_image_idx on public.creator_tier_image_refs(image_id);

-- Outbox intentionally has no FK: paths survive image deletion/replacement.
create table public.creator_storage_cleanup (
  object_path text primary key check (object_path ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'),
  ready_after timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index creator_storage_cleanup_ready_idx on public.creator_storage_cleanup(ready_after);

create function public.creator_validate_tier_document() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare r jsonb; image jsonb; row_ids text[] := '{}'; total integer := 0;
begin
  if jsonb_typeof(new.document) is distinct from 'object'
    or new.document->'version' is distinct from '1'::jsonb
    or jsonb_typeof(new.document->'title') is distinct from 'string'
    or length(new.document->>'title') > 120
    or jsonb_typeof(new.document->'showTitle') is distinct from 'boolean'
    or jsonb_typeof(new.document->'rows') is distinct from 'array' then
    raise exception 'Invalid Tier document' using errcode = '23514';
  end if;
  if jsonb_array_length(new.document->'rows') not between 1 and 30 then
    raise exception 'Invalid Tier row count' using errcode = '23514';
  end if;
  for r in select value from jsonb_array_elements(new.document->'rows') loop
    if jsonb_typeof(r) is distinct from 'object'
      or jsonb_typeof(r->'id') is distinct from 'string'
      or (r->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or r->>'id' = any(row_ids)
      or jsonb_typeof(r->'name') is distinct from 'string'
      or length(btrim(r->>'name')) not between 1 and 40
      or jsonb_typeof(r->'color') is distinct from 'string'
      or (r->>'color') !~* '^#[0-9a-f]{6}$'
      or jsonb_typeof(r->'imageIds') is distinct from 'array' then
      raise exception 'Invalid Tier row' using errcode = '23514';
    end if;
    row_ids := array_append(row_ids, r->>'id');
    if jsonb_array_length(r->'imageIds') > 100 then
      raise exception 'Too many images in row' using errcode = '23514';
    end if;
    total := total + jsonb_array_length(r->'imageIds');
    for image in select value from jsonb_array_elements(r->'imageIds') loop
      if jsonb_typeof(image) is distinct from 'string' or (image #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Invalid image ID' using errcode = '23514';
      end if;
    end loop;
  end loop;
  if total > 300 then raise exception 'Too many images' using errcode = '23514'; end if;
  return new;
end;
$$;

create function public.creator_sync_tier_refs() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.creator_tier_image_refs where work_id = new.id;
  insert into public.creator_tier_image_refs(work_id, image_id)
    select distinct new.id, image.value::uuid
    from jsonb_array_elements(new.document->'rows') r
    cross join lateral jsonb_array_elements_text(r.value->'imageIds') image;
  return new;
end;
$$;

create function public.creator_touch_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.created_at := old.created_at;
  -- Preserve provenance on ordinary updates, while allowing the FK's
  -- ON DELETE SET NULL when the creator's account is removed.
  if new.created_by is not null then new.created_by := old.created_by; end if;
  new.revision := old.revision + 1;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create function public.creator_queue_old_image() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' or old.object_path is distinct from new.object_path then
    insert into public.creator_storage_cleanup(object_path) values(old.object_path)
      on conflict(object_path) do update set ready_after = now();
  end if;
  return null;
end;
$$;

create trigger creator_tier_validate before insert or update on public.creator_tier_works for each row execute function public.creator_validate_tier_document();
create trigger creator_tier_refs after insert or update of document on public.creator_tier_works for each row execute function public.creator_sync_tier_refs();
create trigger creator_tier_revision before update on public.creator_tier_works for each row execute function public.creator_touch_revision();
create trigger creator_image_revision before update on public.creator_images for each row execute function public.creator_touch_revision();
create trigger creator_image_cleanup after delete or update of object_path on public.creator_images for each row execute function public.creator_queue_old_image();

revoke all on function public.creator_validate_tier_document(), public.creator_sync_tier_refs(), public.creator_touch_revision(), public.creator_queue_old_image() from public, anon, authenticated;

alter table public.creator_images enable row level security;
alter table public.creator_tier_works enable row level security;
alter table public.creator_tier_image_refs enable row level security;
alter table public.creator_storage_cleanup enable row level security;
revoke all on public.creator_images, public.creator_tier_works, public.creator_tier_image_refs, public.creator_storage_cleanup from public, anon, authenticated;
grant select, insert, update, delete on public.creator_images, public.creator_tier_works, public.creator_tier_image_refs, public.creator_storage_cleanup to authenticated;

-- Shared admin workspace; created_by is audit provenance, not per-user ownership.
create policy creator_images_admin on public.creator_images for all to authenticated
  using ((select public.is_admin()) and coalesce((select auth.jwt()->>'is_anonymous'), 'true') = 'false')
  with check ((select public.is_admin()) and coalesce((select auth.jwt()->>'is_anonymous'), 'true') = 'false');
create policy creator_tier_works_admin on public.creator_tier_works for all to authenticated
  using ((select public.is_admin()) and coalesce((select auth.jwt()->>'is_anonymous'), 'true') = 'false')
  with check ((select public.is_admin()) and coalesce((select auth.jwt()->>'is_anonymous'), 'true') = 'false');
create policy creator_tier_refs_admin on public.creator_tier_image_refs for all to authenticated
  using ((select public.is_admin()) and coalesce((select auth.jwt()->>'is_anonymous'), 'true') = 'false')
  with check ((select public.is_admin()) and coalesce((select auth.jwt()->>'is_anonymous'), 'true') = 'false');
create policy creator_cleanup_admin on public.creator_storage_cleanup for all to authenticated
  using ((select public.is_admin()) and coalesce((select auth.jwt()->>'is_anonymous'), 'true') = 'false')
  with check ((select public.is_admin()) and coalesce((select auth.jwt()->>'is_anonymous'), 'true') = 'false');

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('creator-images', 'creator-images', false, 4194304, array['image/jpeg', 'image/png', 'image/webp']);

-- Scope all additions to the new bucket. Existing Storage policies are untouched.
create policy creator_storage_guard on storage.objects as restrictive for all to public
  using (bucket_id <> 'creator-images' or ((select public.is_admin()) and coalesce((select auth.jwt()->>'is_anonymous'), 'true') = 'false'))
  with check (bucket_id <> 'creator-images' or ((select public.is_admin()) and coalesce((select auth.jwt()->>'is_anonymous'), 'true') = 'false'));
create policy creator_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'creator-images' and (select public.is_admin()));
create policy creator_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'creator-images' and (select public.is_admin()) and name ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$');
-- Immutable object names: no UPDATE policy, even for administrators.
create policy creator_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'creator-images' and (select public.is_admin())
    and not exists(select 1 from public.creator_images i where i.object_path = storage.objects.name));
commit;
