-- SV Match Log Web production schema for a new Supabase project.
-- Run this once in Supabase SQL Editor before seed files.
-- This file creates the DB foundation: enums, tables, functions, indexes, triggers, and RLS.

create extension if not exists "pgcrypto";

create type public.deck_type as enum ('my_deck', 'opponent_deck');
create type public.turn_order as enum ('first', 'second');
create type public.match_result as enum ('win', 'lose');
create type public.suggestion_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.environments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  start_date date,
  memo text,
  created_at timestamptz not null default now(),
  unique (name)
);

create table public.deck_archetypes (
  id uuid primary key default gen_random_uuid(),
  class_name text not null,
  name text not null,
  -- Legacy nullable columns retained for compatibility with older migration/type files.
  environment_id uuid references public.environments(id) on delete set null,
  environment_name text,
  is_active boolean not null default true,
  is_other boolean not null default false,
  sort_order integer not null default 0,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_name, name)
);

create table public.deck_aliases (
  id uuid primary key default gen_random_uuid(),
  archetype_id uuid not null references public.deck_archetypes(id) on delete cascade,
  alias_name text not null,
  created_at timestamptz not null default now(),
  unique (archetype_id, alias_name)
);

create table public.user_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  archetype_id uuid not null references public.deck_archetypes(id) on delete restrict,
  custom_name text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deck_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_name text not null,
  suggested_name text not null,
  memo text,
  status public.suggestion_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  class_name text not null,
  deck_type public.deck_type not null default 'my_deck',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, deck_type, name)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  environment_id uuid not null references public.environments(id) on delete restrict,
  my_deck_id uuid not null references public.decks(id) on delete restrict,
  opponent_deck_id uuid not null references public.decks(id) on delete restrict,
  my_user_deck_id uuid references public.user_decks(id) on delete set null,
  my_archetype_id uuid references public.deck_archetypes(id) on delete set null,
  opponent_archetype_id uuid references public.deck_archetypes(id) on delete set null,
  turn_order public.turn_order not null,
  result public.match_result not null,
  played_at timestamptz not null default now(),
  memo text,
  created_at timestamptz not null default now()
);

create index environments_name_idx on public.environments(name);
create index decks_user_id_type_idx on public.decks(user_id, deck_type);
create index deck_archetypes_class_active_idx on public.deck_archetypes(class_name, is_active, sort_order);
create index deck_aliases_alias_name_idx on public.deck_aliases(alias_name);
create index user_decks_user_id_idx on public.user_decks(user_id);
create index deck_suggestions_status_idx on public.deck_suggestions(status, created_at desc);
create index matches_user_id_played_at_idx on public.matches(user_id, played_at desc);
create index matches_environment_id_idx on public.matches(environment_id);
create index matches_my_deck_id_idx on public.matches(my_deck_id);
create index matches_opponent_deck_id_idx on public.matches(opponent_deck_id);
create index matches_archetype_idx on public.matches(user_id, my_archetype_id, opponent_archetype_id);

grant usage on schema public to anon, authenticated;
grant select on public.environments to anon, authenticated;
grant select on public.deck_archetypes to anon, authenticated;
grant select on public.deck_aliases to anon, authenticated;
grant select on public.admin_users to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.decks to authenticated;
grant select, insert, update, delete on public.matches to authenticated;
grant select, insert, update, delete on public.user_decks to authenticated;
grant select, insert, update on public.deck_suggestions to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger deck_archetypes_set_updated_at
  before update on public.deck_archetypes
  for each row execute procedure public.set_updated_at();

create trigger user_decks_set_updated_at
  before update on public.user_decks
  for each row execute procedure public.set_updated_at();

create trigger deck_suggestions_set_updated_at
  before update on public.deck_suggestions
  for each row execute procedure public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.environments enable row level security;
alter table public.deck_archetypes enable row level security;
alter table public.deck_aliases enable row level security;
alter table public.user_decks enable row level security;
alter table public.deck_suggestions enable row level security;
alter table public.decks enable row level security;
alter table public.matches enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "admin_users_select_own_or_admin" on public.admin_users
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

create policy "environments_select_public" on public.environments
  for select to anon, authenticated
  using (true);

create policy "environments_insert_admin" on public.environments
  for insert to authenticated
  with check (public.is_admin() and auth.uid() = user_id);

create policy "environments_update_admin" on public.environments
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "environments_delete_admin" on public.environments
  for delete to authenticated
  using (public.is_admin());

create policy "deck_archetypes_select_public" on public.deck_archetypes
  for select to anon, authenticated
  using (is_active = true or public.is_admin());

create policy "deck_archetypes_admin_insert" on public.deck_archetypes
  for insert to authenticated
  with check (public.is_admin());

create policy "deck_archetypes_admin_update" on public.deck_archetypes
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "deck_aliases_select_public" on public.deck_aliases
  for select to anon, authenticated
  using (true);

create policy "deck_aliases_admin_insert" on public.deck_aliases
  for insert to authenticated
  with check (public.is_admin());

create policy "deck_aliases_admin_delete" on public.deck_aliases
  for delete to authenticated
  using (public.is_admin());

create policy "user_decks_select_own" on public.user_decks
  for select to authenticated
  using (auth.uid() = user_id);

create policy "user_decks_insert_own" on public.user_decks
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "user_decks_update_own" on public.user_decks
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "deck_suggestions_select_own_or_admin" on public.deck_suggestions
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

create policy "deck_suggestions_insert_own" on public.deck_suggestions
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "deck_suggestions_admin_update" on public.deck_suggestions
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "decks_select_own" on public.decks
  for select to authenticated
  using (auth.uid() = user_id);

create policy "decks_insert_own" on public.decks
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "decks_update_own" on public.decks
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "decks_delete_own" on public.decks
  for delete to authenticated
  using (auth.uid() = user_id);

create policy "matches_select_own" on public.matches
  for select to authenticated
  using (auth.uid() = user_id);

create policy "matches_insert_own" on public.matches
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.environments e
      where e.id = environment_id
    )
    and exists (
      select 1 from public.decks d
      where d.id = my_deck_id and d.user_id = auth.uid()
    )
    and exists (
      select 1 from public.decks d
      where d.id = opponent_deck_id and d.user_id = auth.uid()
    )
  );

create policy "matches_update_own" on public.matches
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.environments e
      where e.id = environment_id
    )
    and exists (
      select 1 from public.decks d
      where d.id = my_deck_id and d.user_id = auth.uid()
    )
    and exists (
      select 1 from public.decks d
      where d.id = opponent_deck_id and d.user_id = auth.uid()
    )
  );

create policy "matches_delete_own" on public.matches
  for delete to authenticated
  using (auth.uid() = user_id);
