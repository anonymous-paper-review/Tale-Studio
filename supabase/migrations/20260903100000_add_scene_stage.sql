-- 씬 무대(#stage 2026-09-03, 무대 진단서 1번): 작가가 씬마다 세우는 평면 배치도 —
--   표지(landmarks)·인물의 비트별 위치·향·자세(beats[].characters)·180° 축(axis, camera_side).
--   v4 의 camera_setup 과 함께 화면 안 위치(shots.static_spec.screen_layout)의 계산 원천이다.
--   Expand 단계(nullable, 기본 없음). 채우는 코드: src/lib/writer/pipeline/util/persist_manifest.ts persistSceneStagesToDb.
begin;

alter table public.scenes add column if not exists stage jsonb;

comment on column public.scenes.stage is
  '씬 무대(SceneStage JSON, #stage 2026-09-03): {landmarks, axis, camera_side, beats[{beat, characters[{character_id,x,y,facing_deg,posture,note}], end_characters?}]}. writer sceneStage 단계가 쓴다.';

commit;
