-- Drop characters.fixed_prompt — writer 일원화로 appearance 단일화 (§3)
-- Created: 2026-06-05 KST
--
-- 새 writer(=svc) 단일 파이프라인이 characters.appearance 를 생산하고, 소비측
-- (artist/director/writer 스토어의 buildCharacterPrompt 입력)이 appearance 를 읽도록 전환 완료.
-- fixed_prompt(옛 writer 전용 이미지 프롬프트)는 더 이상 코드에서 참조하지 않음 → 드롭.
ALTER TABLE characters DROP COLUMN IF EXISTS fixed_prompt;
