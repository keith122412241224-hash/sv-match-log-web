-- Remove the unused built-in "その他○○" archetypes from existing projects.
-- Rows referenced by user_decks are kept inactive to avoid deleting user-owned data.

with removed_archetypes(class_name, name) as (
  values
    (U&'\30A8\30EB\30D5', U&'\305D\306E\4ED6\30A8\30EB\30D5'),
    (U&'\30ED\30A4\30E4\30EB', U&'\305D\306E\4ED6\30ED\30A4\30E4\30EB'),
    (U&'\30A6\30A3\30C3\30C1', U&'\305D\306E\4ED6\30A6\30A3\30C3\30C1'),
    (U&'\30C9\30E9\30B4\30F3', U&'\305D\306E\4ED6\30C9\30E9\30B4\30F3'),
    (U&'\30CA\30A4\30C8\30E1\30A2', U&'\305D\306E\4ED6\30CA\30A4\30C8\30E1\30A2'),
    (U&'\30D3\30B7\30E7\30C3\30D7', U&'\305D\306E\4ED6\30D3\30B7\30E7\30C3\30D7'),
    (U&'\30CD\30E1\30B7\30B9', U&'\305D\306E\4ED6\30CD\30E1\30B7\30B9')
)
update public.deck_archetypes da
set is_active = false
from removed_archetypes r
where da.class_name = r.class_name
  and da.name = r.name;

with removed_archetypes(class_name, name) as (
  values
    (U&'\30A8\30EB\30D5', U&'\305D\306E\4ED6\30A8\30EB\30D5'),
    (U&'\30ED\30A4\30E4\30EB', U&'\305D\306E\4ED6\30ED\30A4\30E4\30EB'),
    (U&'\30A6\30A3\30C3\30C1', U&'\305D\306E\4ED6\30A6\30A3\30C3\30C1'),
    (U&'\30C9\30E9\30B4\30F3', U&'\305D\306E\4ED6\30C9\30E9\30B4\30F3'),
    (U&'\30CA\30A4\30C8\30E1\30A2', U&'\305D\306E\4ED6\30CA\30A4\30C8\30E1\30A2'),
    (U&'\30D3\30B7\30E7\30C3\30D7', U&'\305D\306E\4ED6\30D3\30B7\30E7\30C3\30D7'),
    (U&'\30CD\30E1\30B7\30B9', U&'\305D\306E\4ED6\30CD\30E1\30B7\30B9')
)
delete from public.deck_archetypes da
using removed_archetypes r
where da.class_name = r.class_name
  and da.name = r.name
  and not exists (
    select 1
    from public.user_decks ud
    where ud.archetype_id = da.id
  );
