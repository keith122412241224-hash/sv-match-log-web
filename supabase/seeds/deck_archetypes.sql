-- Initial standard deck archetype data.
-- Add or edit rows for the current Shadowverse: Worlds Beyond metagame.

insert into public.deck_archetypes (class_name, name, is_active, is_other, sort_order)
select v.class_name, v.name, v.is_active, v.is_other, v.sort_order
from (
  values
    ('エルフ', 'その他エルフ', true, true, 999),
    ('ロイヤル', 'その他ロイヤル', true, true, 999),
    ('ウィッチ', 'その他ウィッチ', true, true, 999),
    ('ドラゴン', 'その他ドラゴン', true, true, 999),
    ('ナイトメア', 'その他ナイトメア', true, true, 999),
    ('ビショップ', 'その他ビショップ', true, true, 999),
    ('ネメシス', 'その他ネメシス', true, true, 999)
) as v(class_name, name, is_active, is_other, sort_order)
where not exists (
  select 1
  from public.deck_archetypes d
  where d.class_name = v.class_name
    and d.name = v.name
);
