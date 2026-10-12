begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- NULL preserves legacy writers and existing matches; no backfill or deduplication.
alter table public.matches add column request_id uuid;
create unique index matches_user_request_id_key
  on public.matches (user_id, request_id);

notify pgrst, 'reload schema';
commit;
