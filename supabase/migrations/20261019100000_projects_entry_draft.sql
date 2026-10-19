-- 리뉴얼 1차(2026-10-19, 프로토타입 20261013): Producer 시작 화면의 초안을 프로젝트에 둔다.
--   아이디어 글 · 올린 파일(읽은 글) · AI 추천과 이유 · 고른 장르·분위기/길이/바꿈 정도/화면 비율 · 시작 시각.
--   1안(화면에서 고르기)과 2안(채팅으로 만들기) 탭이 같은 값을 쓴다. producer_draft(예전 Producer 카드)와 따로 둔다.
begin;
alter table public.projects add column if not exists entry_draft jsonb;
comment on column public.projects.entry_draft is
  'Producer 시작 화면 초안(리뉴얼 1차 2026-10-19): 아이디어 · 파일 · AI 추천 · 고른 조건 · 시작 시각. 1안 · 2안 탭이 같이 쓴다.';
commit;
