-- 시리즈(2026-10-26 오너 승인, 방향 문서 .claude/docs/2026-10-22/series-brief.html): 다음 화가 앞 화에서 받은 것을 프로젝트에 둔다.
--   앞 화 제목 · 이어받은 인물(이름 · 역할 · 외모 · 성격 · 복사한 그림) · 배경(이름 · 설명 · 복사한 그림) · 말투 · 화풍 · 화면 비율 · 대사 언어 ·
--   마지막 장면 잇기 여부. [다음 화 만들기] 때 한 번 쓴다. 앞 화를 지워도(reference_project_id 는 on delete set null) 이 값은 남는다.
--   null = 시리즈가 아닌 프로젝트. 앞 화 줄거리는 여기 두지 않는다(Writer 가 매번 앞 화에서 다시 읽는다).
begin;
alter table public.projects add column if not exists series jsonb;
comment on column public.projects.series is
  '시리즈 다음 화가 앞 화에서 받은 것(2026-10-26): 앞 화 제목 · 인물 · 배경 · 말투 · 화풍 · 화면 비율 · 대사 언어 · 마지막 장면 잇기. null = 시리즈 아님.';
commit;
