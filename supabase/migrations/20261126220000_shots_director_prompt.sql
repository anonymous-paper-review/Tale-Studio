-- Director 에서 고친 샷 프롬프트(m1126, 오너 2026-11-26 O5 "이미지 영상 등 모든 작업은 채팅창에 있는 기능 활용" · 리드 승인 2026-11-26).
--   채팅 [적용] · 샷 상세 프롬프트 칸이 고친 글은 지금까지 그 브라우저 기억(promptOverride)에만 있었다 — 다른 기기에서는 원래 글이고,
--   같은 브라우저도 다른 프로젝트를 열었다 오면 사라져 다음 영상 · 다시 만들기가 옛 글로 나갔다. 이 칸에 남긴다.
--   null = Writer 글(shots.prompt) 그대로. Director 는 shots.prompt 를 쓰지 않는다(architecture §5 원칙1 · #F-005) — 고친 글은 이 칸에만.
--
--   Writer 가 샷 글(prompt)을 다시 쓰면 이 칸을 비운다(아래 방아쇠): 고친 글은 옛 Writer 글 전체를 고친 것이라, 남겨 두면 새 이야기를 말없이 덮는다.
--   같은 갱신에서 director_prompt 도 함께 쓰면 그 값을 남긴다. 화면은 들어올 때 DB 값을 읽어 브라우저 기억을 맞춘다(DB 가 진실).
--   쓰기 = 프로젝트 소유자(지금 shots 쓰기 정책 그대로) — 화면이 고칠 때 0.5초 뒤 쓴다.
--   약속: tests/director/director-prompt-persist.test.ts
--   되돌리기: supabase/rollbacks/20261126220000_shots_director_prompt.rollback.sql(이 폴더 밖 — 이 폴더의 .sql 은 모두 마이그레이션으로 실행된다).
begin;

alter table public.shots add column if not exists director_prompt text;

comment on column public.shots.director_prompt is
  'Director 에서 고친 샷 프롬프트(채팅 [적용] · 샷 상세 프롬프트 칸). null = Writer 글(prompt) 그대로. Writer 가 prompt 를 바꾸면 비운다(shots_clear_director_prompt).';

create or replace function public.clear_director_prompt_on_writer_prompt_change()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.prompt is distinct from old.prompt and new.director_prompt is not distinct from old.director_prompt then
    new.director_prompt := null;
  end if;
  return new;
end;
$$;

drop trigger if exists shots_clear_director_prompt on public.shots;
create trigger shots_clear_director_prompt
before update of prompt on public.shots
for each row execute function public.clear_director_prompt_on_writer_prompt_change();

commit;
