-- #F-003 R3 (2026-08-13): scenes/shots 행 소유권 컬럼 — persist 의 프로젝트 전체 DELETE 를
-- 파이프라인 소유 행으로 좁힌다. 사고(dc531572): 채팅 CRUD 가 만든 4씬 16샷은 persist 가
-- 채팅보다 먼저 돌아서 살았을 뿐, 순서가 반대였다면 재런 한 번에 통째로 사라졌다.
-- 씬까지 넣는 이유: 그 16샷은 채팅이 만든 새 씬(sc_05~08) 소속이었다 — 샷만 지키면
-- 씬 행이 사라져 고아가 된다.
--
-- 시멘틱: source='pipeline' 행만 파이프라인이 갈아엎는다(architecture §5 원칙 2 —
-- 자율 실행은 사람의 글을 지우지 않는다. locations 의 origin='producer' 보존과 같은 계열).
-- 수동/채팅 생성 경로는 'manual' 을 명시한다. 기존 행은 전부 'pipeline' 으로 간주 —
-- 재런 시 전량 교체(종전과 동일 동작).
-- 적용: supabase db query --linked, 문장 개별 실행 (db push 막힘 + 셸 "$()" 가 DO 블록의
-- $$ 를 PID 로 치환하므로 이 파일을 통째로 넘기지 말 것). 소유자 경로라 RLS 무관.

alter table public.shots
  add column if not exists source text not null default 'pipeline';

alter table public.shots
  add constraint shots_source_valid check (source in ('pipeline', 'manual'));

alter table public.scenes
  add column if not exists source text not null default 'pipeline';

alter table public.scenes
  add constraint scenes_source_valid check (source in ('pipeline', 'manual'));
