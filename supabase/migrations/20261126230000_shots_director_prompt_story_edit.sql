-- Director 고친 샷 글(shots.director_prompt) 비우기를 Writer 콘티 · Writer 채팅의 "샷 이야기" 고침에도 (m1126 · 리드 승인 규칙 "Writer 글을 고치면 비운다"의 실제 길)
--   20261126220000 의 방아쇠는 shots.prompt 만 보았다. 그런데 Writer 콘티(writer-store updateShot)와 Writer · Storyboard 채팅(chat-tools/writer-save SHOT_TOOL_FIELDS)은
--   샷 이야기를 고칠 때 action_description(+ _native)만 쓰고 prompt 는 쓰지 않는다 — 그래서 콘티에서 이야기를 고쳐도 Director 고친 글이 남아 새 이야기를 덮었다.
--   이제 action_description 이 바뀌어도 비운다. action_description_native 만 바뀌는 번역 채우기(derive-en)는 보지 않는다 — 이야기가 바뀐 것이 아니다.
--   같은 갱신에서 director_prompt 도 쓰면 그 값을 남긴다(지금 규칙 그대로). 칸은 그대로라 database.ts 는 바뀌지 않는다.
--   약속: tests/director/director-prompt-persist.test.ts. 되돌리기: supabase/rollbacks/20261126230000_shots_director_prompt_story_edit.rollback.sql
begin;

create or replace function public.clear_director_prompt_on_writer_prompt_change()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (new.prompt is distinct from old.prompt or new.action_description is distinct from old.action_description)
     and new.director_prompt is not distinct from old.director_prompt then
    new.director_prompt := null;
  end if;
  return new;
end;
$$;

drop trigger if exists shots_clear_director_prompt on public.shots;
create trigger shots_clear_director_prompt
before update of prompt, action_description on public.shots
for each row execute function public.clear_director_prompt_on_writer_prompt_change();

comment on column public.shots.director_prompt is 'Director 에서 고친 샷 프롬프트(채팅 [적용] · 샷 상세 프롬프트 칸). null = Writer 글(prompt) 그대로. Writer 가 prompt 나 샷 이야기(action_description)를 바꾸면 비운다(shots_clear_director_prompt).';

commit;
