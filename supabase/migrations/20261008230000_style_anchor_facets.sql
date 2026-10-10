-- 스타일 프리셋 facet 조각을 앵커 행에 둔다 (2026-10-08 오너 · facet 인계 .claude/docs/2026-10-08/facet-presets/README.md §5).
--   값 = { version, probe_anchors, figure, priority, negative, 출처 기록 } — scripts/style-anchor-facets-seed.mjs 가 넣는다.
--   null 이면 생성은 종전 조립(앵커 이미지 + 역할 문장 + style_clause) 그대로다.
begin;

alter table public.style_anchors add column if not exists facets jsonb;

comment on column public.style_anchors.facets is
  'facet 조각(인계 v3): probe_anchors="Style anchors:" 캡슐, figure="Figure rules:"(인물 장면만), priority, negative. null = facet 없음.';

commit;
