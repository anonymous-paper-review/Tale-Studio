-- 되돌리기: 20261126220000_shots_director_prompt.sql — 방아쇠 · 함수 · 칸을 지운다(고친 글은 함께 사라진다).
begin;
drop trigger if exists shots_clear_director_prompt on public.shots;
drop function if exists public.clear_director_prompt_on_writer_prompt_change();
alter table public.shots drop column if exists director_prompt;
commit;
