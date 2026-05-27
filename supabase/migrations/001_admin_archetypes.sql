-- Existing DB migration: admin users, standard deck archetypes, suggestions, and match archetype links.
-- Safe to run multiple times. Does not delete user data.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'suggestion_status') then
    create type public.suggestion_status as enum ('pending', 'approved', 'rejected');
  end if;
end
$$;

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.deck_archetypes (
  id uuid primary key default gen_random_uuid(),
  class_name text not null,
  name text not null,
  environment_id uuid references public.environments(id) on delete set null,
  environment_name text,
  is_active boolean not null default true,
  is_other boolean not null default false,
  sort_order integer not null default 0,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deck_aliases (
  id uuid primary key default gen_random_uuid(),
  archetype_id uuid not null references public.deck_archetypes(id) on delete cascade,
  alias_name text not null,
  created_at timestamptz not null default now(),
  unique (archetype_id, alias_name)
);

create table if not exists public.user_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  archetype_id uuid not null references public.deck_archetypes(id) on delete restrict,
  custom_name text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deck_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_name text not null,
  suggested_name text not null,
  memo text,
  status public.suggestion_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.matches add column if not exists my_user_deck_id uuid references public.user_decks(id) on delete set null;
alter table public.matches add column if not exists my_archetype_id uuid references public.deck_archetypes(id) on delete set null;
alter table public.matches add column if not exists opponent_archetype_id uuid references public.deck_archetypes(id) on delete set null;

create index if not exists deck_archetypes_class_name_idx
  on public.deck_archetypes(class_name, name);
create index if not exists deck_archetypes_class_active_idx on public.deck_archetypes(class_name, is_active, sort_order);
create index if not exists deck_aliases_alias_name_idx on public.deck_aliases(alias_name);
create index if not exists user_decks_user_id_idx on public.user_decks(user_id);
create index if not exists deck_suggestions_status_idx on public.deck_suggestions(status, created_at desc);
create index if not exists matches_archetype_idx on public.matches(user_id, my_archetype_id, opponent_archetype_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists deck_archetypes_set_updated_at on public.deck_archetypes;
create trigger deck_archetypes_set_updated_at
  before update on public.deck_archetypes
  for each row execute procedure public.set_updated_at();

drop trigger if exists user_decks_set_updated_at on public.user_decks;
create trigger user_decks_set_updated_at
  before update on public.user_decks
  for each row execute procedure public.set_updated_at();

drop trigger if exists deck_suggestions_set_updated_at on public.deck_suggestions;
create trigger deck_suggestions_set_updated_at
  before update on public.deck_suggestions
  for each row execute procedure public.set_updated_at();

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

alter table public.admin_users enable row level security;
alter table public.deck_archetypes enable row level security;
alter table public.deck_aliases enable row level security;
alter table public.user_decks enable row level security;
alter table public.deck_suggestions enable row level security;

drop policy if exists "admin_users_select_own_or_admin" on public.admin_users;
create policy "admin_users_select_own_or_admin" on public.admin_users
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "deck_archetypes_select_all" on public.deck_archetypes;
drop policy if exists "deck_archetypes_select_public" on public.deck_archetypes;
create policy "deck_archetypes_select_public" on public.deck_archetypes
  for select to anon, authenticated
  using (is_active = true or public.is_admin());

drop policy if exists "deck_archetypes_admin_insert" on public.deck_archetypes;
create policy "deck_archetypes_admin_insert" on public.deck_archetypes
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "deck_archetypes_admin_update" on public.deck_archetypes;
create policy "deck_archetypes_admin_update" on public.deck_archetypes
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "deck_aliases_select_all" on public.deck_aliases;
drop policy if exists "deck_aliases_select_public" on public.deck_aliases;
create policy "deck_aliases_select_public" on public.deck_aliases
  for select to anon, authenticated
  using (true);

drop policy if exists "deck_aliases_admin_insert" on public.deck_aliases;
create policy "deck_aliases_admin_insert" on public.deck_aliases
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "deck_aliases_admin_delete" on public.deck_aliases;
create policy "deck_aliases_admin_delete" on public.deck_aliases
  for delete to authenticated
  using (public.is_admin());

drop policy if exists "user_decks_select_own" on public.user_decks;
create policy "user_decks_select_own" on public.user_decks
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_decks_insert_own" on public.user_decks;
create policy "user_decks_insert_own" on public.user_decks
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_decks_update_own" on public.user_decks;
create policy "user_decks_update_own" on public.user_decks
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "deck_suggestions_select_own_or_admin" on public.deck_suggestions;
create policy "deck_suggestions_select_own_or_admin" on public.deck_suggestions
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "deck_suggestions_insert_own" on public.deck_suggestions;
create policy "deck_suggestions_insert_own" on public.deck_suggestions
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "deck_suggestions_admin_update" on public.deck_suggestions;
create policy "deck_suggestions_admin_update" on public.deck_suggestions
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
