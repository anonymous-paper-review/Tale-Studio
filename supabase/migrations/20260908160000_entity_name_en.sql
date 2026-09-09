-- 이름 영어 표기 한 번 정해 저장 (#name-en 2026-09-08, 오너 지시)
--   실측 겨울_8: 러프 요청마다 이름을 새로 번역해 프레임 밖 인물이 "Fairy Clan Chief" 였다가 "Yojeong Sujang" 이 됐다.
--   name_en 을 저장하고, name_en_source(정할 때의 원문 name)가 지금 name 과 다르면(이름 바뀜) 다시 정한다.
alter table public.characters
  add column if not exists name_en text,
  add column if not exists name_en_source text;

alter table public.locations
  add column if not exists name_en text,
  add column if not exists name_en_source text;

comment on column public.characters.name_en is '영어 표기 — 한 번 정해 저장(#name-en 2026-09-08). name_en_source ≠ name 이면 다시 정한다.';
comment on column public.characters.name_en_source is 'name_en 을 정할 때의 원문 name — 이름이 바뀌었는지 판정.';
comment on column public.locations.name_en is '영어 표기 — 한 번 정해 저장(#name-en 2026-09-08). name_en_source ≠ name 이면 다시 정한다.';
comment on column public.locations.name_en_source is 'name_en 을 정할 때의 원문 name — 이름이 바뀌었는지 판정.';
