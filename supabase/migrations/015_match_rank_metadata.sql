-- R1-A: nullable match rank metadata only, based on Production dcf18d2.
-- Existing rows and older clients may omit all three values.
begin;

alter table public.matches
  add column rank_tier text null,
  add column master_group text null,
  add column grandmaster_rating text null;

alter table public.matches
  add constraint matches_rank_metadata_check check ((
    (rank_tier is null and master_group is null and grandmaster_rating is null)
    or (
      rank_tier in ('beginner', 'd', 'c', 'b', 'a', 'aa')
      and master_group is null
      and grandmaster_rating is null
    )
    or (
      rank_tier = 'master'
      and master_group in ('emerald', 'topaz', 'ruby', 'sapphire', 'diamond')
      and grandmaster_rating is null
    )
    or (
      rank_tier = 'grandmaster'
      and master_group is null
      and grandmaster_rating in ('none', 'epic', 'ultimate', 'legend', 'beyond')
    )
  ) is true);

commit;
