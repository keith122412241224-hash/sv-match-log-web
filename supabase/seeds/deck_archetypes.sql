-- Initial standard deck archetype data.
-- Add or edit rows for the current Shadowverse: Worlds Beyond metagame.

insert into public.deck_archetypes (class_name, name, is_active, is_other, sort_order)
values
  ('エルフ', 'その他エルフ', true, true, 999),
  ('ロイヤル', 'その他ロイヤル', true, true, 999),
  ('ウィッチ', 'その他ウィッチ', true, true, 999),
  ('ドラゴン', 'その他ドラゴン', true, true, 999),
  ('ナイトメア', 'その他ナイトメア', true, true, 999),
  ('ビショップ', 'その他ビショップ', true, true, 999),
  ('ネメシス', 'その他ネメシス', true, true, 999)
on conflict (class_name, name) do nothing;
