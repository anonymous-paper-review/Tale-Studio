-- SVC design tokens → DB (additive, hybrid) — DESIGN ONLY, 미적용
-- Created: 2026-06-05 KST
-- change: unify-svc-writer-pipeline §2-1 (저장 위치 = 하이브리드, 사용자 결정 2026-06-05)
--
-- 현재 producer 핸드오프(src/stores/producer-store.ts)는 두 파이프라인을 병렬 발사:
--   · line 94  /api/write/generate-scenes → characters.fixed_prompt 등 DB 저장
--   · line 107 /api/svc/start             → appearance/art_style/palette 등 "로그 파일"에만 저장
-- 이 마이그레이션은 svc 산출물 중 "영속 소비 대상" 디자인 토큰을 DB로 끌어올린다(DB化).
--
-- ⚠️ 가산적(additive)이다. fixed_prompt 를 드롭하지 않는다.
--   사유: fixed_prompt 는 (1) 라이브에 실제 채워져 있고 (2) 이미지 생성 소스
--   (src/lib/prompts.ts buildCharacterPrompt) (3) artist/director/writer 스토어 5곳이 소비.
--   writer 경로(generate-scenes)는 appearance 를 만들지 않고 fixed_prompt 를 직접 생성하므로,
--   드롭은 파이프라인 일원화(§3)로 소비측을 appearance 우선·fixed_prompt 폴백으로 전환 +
--   기존 행 백필 완료 후 별도 009_drop_fixed_prompt.sql 에서 수행.
--   (소비측은 이미 svc appearance 우선/fixed_prompt 폴백 의도를 가짐: src/lib/artist/turnaround.ts:34,39)

-- 1. 전역 디자인 토큰 (svc L0Visual + L1Style + L2Design 전역부) → projects 1개 컬럼
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS design_tokens JSONB;
COMMENT ON COLUMN projects.design_tokens IS
  'SVC 파이프라인 전역 디자인 토큰(프로젝트 1:1). 형식:
   { l0:{medium,resolution:{width,height},fps,aspect_ratio,rendering_method},
     l1:{art_style,shape_language,line_quality,character_proportion,texture_philosophy},
     palette:{primary,secondary,accent,forbidden[]}, color_meaning:{<color>:<meaning>}, vfx_approach }.
   null = svc 미실행/미생성. 소비: artist 턴어라운드 시트, director.';

-- 2. 캐릭터별 토큰 (svc S2Character.appearance_description + L2Design.costumes[id])
--    appearance 는 fixed_prompt 와 공존(중복 해소는 §3 이후 009). costume 은 신규.
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS appearance TEXT,
  ADD COLUMN IF NOT EXISTS costume    TEXT[];
COMMENT ON COLUMN characters.appearance IS
  'SVC appearance_description (외형 prose, richer). 소비측은 appearance 우선 → 없으면 fixed_prompt 폴백.
   fixed_prompt 와 의미 중복이나, fixed_prompt 는 image-gen 전용 concise prompt라 즉시 대체 금지(009에서 정리).';
COMMENT ON COLUMN characters.costume IS 'SVC L2Design.costumes[character_id] — 의상 아이템 목록.';

-- 3. 로케이션별 토큰 (svc L2Design.locations[])
--    NOTE: writer 의 visual_description / lighting_direction 과 의미 중복(같은 패턴).
--    가산적으로 추가하고, 중복 해소는 §3 일원화에서.
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS style_description TEXT,
  ADD COLUMN IF NOT EXISTS lighting_sources  TEXT[],
  ADD COLUMN IF NOT EXISTS props             TEXT[];
COMMENT ON COLUMN locations.style_description IS
  'SVC L2Design.locations[].style_description. writer visual_description 와 중복 — §3에서 정리.';
COMMENT ON COLUMN locations.lighting_sources IS 'SVC L2Design.locations[].lighting_sources (광원 목록).';
COMMENT ON COLUMN locations.props IS 'SVC L2Design.locations[].props (소품 목록).';

-- 후속(이 SQL 범위 밖):
--   · src/lib/svc/pipeline 가 위 컬럼에 기록하도록 wire-up (§2-2)
--   · artist/director 소비측을 로그파일 → DB 읽기로 전환 (§2-3)
--   · 009_drop_fixed_prompt.sql: 백필+소비측 전환 검증 후 characters.fixed_prompt DROP (§3)
