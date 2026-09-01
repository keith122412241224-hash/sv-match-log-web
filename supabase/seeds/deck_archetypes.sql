-- Initial standard deck archetype data.
-- Add or edit rows for the current Shadowverse: Worlds Beyond metagame.

insert into public.deck_archetypes (class_name, name, is_active, is_other, sort_order)
select v.class_name, v.name, v.is_active, v.is_other, v.sort_order
from (
  select
    null::text as class_name,
    null::text as name,
    null::boolean as is_active,
    null::boolean as is_other,
    null::integer as sort_order
  where false
) as v(class_name, name, is_active, is_other, sort_order)
where not exists (
  select 1
  from public.deck_archetypes d
  where d.class_name = v.class_name
    and d.name = v.name
);
