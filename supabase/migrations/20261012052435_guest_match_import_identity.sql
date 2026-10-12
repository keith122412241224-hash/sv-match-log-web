begin;

-- Historical and normal matches remain NULL; do not infer identities or merge rows.
alter table public.matches add column guest_import_id text;
-- A full unique index is inferable by PostgREST on_conflict. PostgreSQL's default
-- NULL-distinct semantics allow any number of ordinary/historical matches.
create unique index matches_user_guest_import_id_key
  on public.matches (user_id, guest_import_id);

comment on column public.matches.guest_import_id is
  'Stable guest local_id, scoped to user_id. NULL for normal and pre-migration matches.';

-- No RPC, policy, role or grant changes. Run once through migration history.
-- Transactional failure leaves neither the column nor the index behind.
commit;
