-- 캐릭터 대표 포트레이트 (2026-07-12, artist New UI)
-- 사람: 턴어라운드 시트(view_main)의 좌상단 CHARACTER CONCEPT 박스를 서버(finalize)가 sharp 로
--       크롭해 별도 저장한 URL. 사물(object): view_main 과 동일값.
-- 라이브 DB엔 supabase db query --linked 로 적용됨 — 이 파일은 이력 추적용.
alter table characters add column if not exists portrait text;
comment on column characters.portrait is
  '대표 포트레이트 — 턴어라운드 시트(view_main)의 CHARACTER CONCEPT(좌상단) 크롭. object 캐릭터는 view_main 동일값.';
