-- 020_project_settings_story_gate.sql
-- producer-story-gate (결정 1·2): projects.settings JSONB 일괄 마이그레이션.
--   MVP 실험 데이터라 lazy 폴백 불필요 → 한 번에 형태 변환.
--
-- 변환:
--   * toneStyle (string) → tone (string[]):  비었으면 [], 값 있으면 [값].
--   * aspectRatio → format (합집합 enum):  '16:9'→horizontal_16:9 / '9:16'→vertical_9:16 / '1:1'→square_1:1.
--   * targetEmotion (string[]) 신설:  기본 [].
--   * 옛 키(toneStyle, aspectRatio) 제거.
--   * subGenre 는 optional → 미설정으로 둠(없으면 키 없음).
--
-- 빈 settings('{}')·NULL 행은 코드 DEFAULT_SETTINGS(format=horizontal_16:9, tone=[], targetEmotion=[])로 흡수되므로
--   변환은 멱등하게 안전한 기본값을 채워준다.
--
-- ⚠️ 라이브 DB는 마이그레이션과 분리 운영 → Supabase 대시보드 SQL 에디터에서 직접 실행 필요.

UPDATE projects
SET settings = (settings - 'toneStyle' - 'aspectRatio')
  || jsonb_build_object(
       'tone',
         CASE
           WHEN settings ? 'tone' THEN settings->'tone'
           WHEN settings ? 'toneStyle' AND COALESCE(settings->>'toneStyle', '') <> ''
             THEN jsonb_build_array(settings->>'toneStyle')
           ELSE '[]'::jsonb
         END,
       'targetEmotion', COALESCE(settings->'targetEmotion', '[]'::jsonb),
       'format',
         CASE
           WHEN settings ? 'format' THEN settings->>'format'
           WHEN settings->>'aspectRatio' = '16:9' THEN 'horizontal_16:9'
           WHEN settings->>'aspectRatio' = '9:16' THEN 'vertical_9:16'
           WHEN settings->>'aspectRatio' = '1:1'  THEN 'square_1:1'
           ELSE 'horizontal_16:9'
         END
     )
WHERE settings IS NOT NULL;
