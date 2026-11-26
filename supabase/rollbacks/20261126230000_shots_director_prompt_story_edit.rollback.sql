-- 되돌리기: 20261126230000_shots_director_prompt_story_edit.sql — 방아쇠를 20261126220000 모양(prompt 만 본다)으로 되돌린다. 칸 · 고친 글은 그대로.
begin;

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

comment on column public.shots.director_prompt is 'Director 에서 고친 샷 프롬프트(채팅 [적용] · 샷 상세 프롬프트 칸). null = Writer 글(prompt) 그대로. Writer 가 prompt 를 바꾸면 비운다(shots_clear_director_prompt).';

commit;
