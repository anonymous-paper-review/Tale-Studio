-- 샷별 배경(location) 참조 (2026-07-12, artist New UI asset-shot board)
-- null = 씬(scenes.location) 상속(기본), [] = 명시적으로 배경 없음, [ids] = 명시 참조.
-- 라이브 DB엔 supabase db query --linked 로 적용됨 — 이 파일은 이력 추적용.
alter table shots add column if not exists location_ids text[];
comment on column shots.location_ids is
  '샷별 배경(location_id) 참조. null=씬(scenes.location) 상속, []=명시적 없음. artist New UI 에서 편집.';
