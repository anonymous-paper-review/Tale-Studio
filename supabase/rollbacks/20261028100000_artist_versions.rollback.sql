-- 되돌리기: 20261028100000_artist_versions(작품 스타일 기록, 2026-10-28) — 마이그레이션이 아니다. 사람이 골라 실행한다(개발 DB 먼저 → 운영).
--   이 파일은 supabase/migrations 밖에 둔다 — 그 폴더의 .sql 은 모두 마이그레이션으로 실행된다.
--   순서: (1) 앱을 이 마이그레이션 전 코드로 먼저 되돌린다(새 코드는 artist_versions 를 읽고 쓴다). (2) 아래를 한 번에 실행한다.
--   남는 것: 보관함의 버전 폴더({ws}/{project}/versions/v{n}/) 파일. 불러온 버전의 그림은 지금 그림이 이 폴더 파일을 가리킨다 —
--   표를 지운 뒤에도 이 파일은 지우지 않는다.
--   주의: 새 규칙에서는 배경 모습마다 "지금 그림"이 하나씩 있다. 옛 색인(배경 한 곳에 하나)을 만들기 전에 겹친 것을 먼저 정리한다.
begin;

-- (1) 배경 한 곳(project, location, view)에 지금 그림이 여럿이면 하나만 남긴다 — 기본 모습(variant_key 없음) 먼저, 그다음 최근 것.
update public.location_image_candidates c
set is_selected = false
from (
  select id, row_number() over (
    partition by project_id, location_id, view
    order by (variant_key is null) desc, generated_at desc, id
  ) as rank
  from public.location_image_candidates
  where is_selected
) ranked
where c.id = ranked.id and ranked.rank > 1;

-- (2) 옛 색인으로.
drop index if exists public.idx_loc_img_candidates_one_selected;
create unique index idx_loc_img_candidates_one_selected
  on public.location_image_candidates (project_id, location_id, view)
  where is_selected;

-- (3) 작품 스타일 기록 표.
drop table if exists public.artist_versions;

-- (4) 마이그레이션 기록에서 뺀다(다시 올릴 수 있게).
delete from supabase_migrations.schema_migrations where version = '20261028100000';

commit;
