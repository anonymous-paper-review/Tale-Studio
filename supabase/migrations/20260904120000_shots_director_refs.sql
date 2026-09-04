-- 약속 F·G (2026-09-04): Director 캔버스에서 참조 선을 지우거나 팝업에서 참조를 빼면 그 샷의 참조 목록이 실제로 바뀌고
--   되살아나지 않는다. 사람이 손댄 목록만 여기에 남는다(null = Writer 가 정한 인물·배경을 그대로 따른다).
--   형태: {"characters": ["char_1", ...], "locations": ["loc_1"]} — 실사 생성(단건·배치)은 이 목록 ∩ shots.characters 만 붙인다.
alter table public.shots add column if not exists director_refs jsonb;
comment on column public.shots.director_refs is
  'Director reference override: {characters: string[], locations: string[]}; null = follow writer (characters/scene location).';
