-- Backfill existing matches so matchup matrix can aggregate by standard deck IDs.
-- Safe to run multiple times.

update public.matches m
set my_archetype_id = da.id
from public.decks d
join public.deck_archetypes da
  on da.name = d.name
  and da.class_name = d.class_name
  and da.is_active = true
where m.my_archetype_id is null
  and m.my_deck_id = d.id;

update public.matches m
set opponent_archetype_id = da.id
from public.decks d
join public.deck_archetypes da
  on da.name = d.name
  and da.class_name = d.class_name
  and da.is_active = true
where m.opponent_archetype_id is null
  and m.opponent_deck_id = d.id;
