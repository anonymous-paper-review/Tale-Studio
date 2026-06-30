---
description: tale-studio 디버깅 루틴 — 한 프로젝트를 "producer 완성" 단계로 롤백(writer 이후 산출물 전부 초기화, producer 출력 보존). 사용자가 "writer 초기화", "producer로 롤백", "producer 완성으로 되돌려", "/reset-producer", "이 프로젝트 리셋" 등 멘션 + projectId 제시 시 사용. writer 파이프라인 반복 검증용.
when_to_use: writer 파이프라인을 다시 검증하려고 한 프로젝트를 핸드오프 직전(producer 완성) 상태로 되돌릴 때. 스냅샷 불요(현재 producer 내용을 그대로 보존). seed:producer:reset(스냅샷 복원)과 다름.
allowed-tools: Bash, Read
---

# reset-to-producer 디버깅 루틴

writer/artist/director/editor 산출물을 전부 지우고 `current_stage='producer'`로 되돌린다.
**producer 출력은 보존** → 재핸드오프('Complete your story')로 writer를 다시 검증할 수 있다.

핵심 스크립트: `scripts/reset-to-producer.mjs <projectId> [--dry]`
(`pnpm reset:producer <projectId> [--dry]` 와 동일)

## 경계 (스크립트 헤더 주석이 source-of-truth)

- **KEEP (producer)**: `projects` 행(story_text/settings/producer_draft/expanded_story/locale),
  `characters(origin='producer')`, `character_relationships`(producer cast 간), `messages(stage='producer'·null)`
- **WIPE (writer 이후)**: writer_runs · scenes · shots · locations · generation_jobs ·
  character/location_image_candidates · editor_states · video_clips · subtext_notes ·
  `characters(origin='writer')` · 비-producer messages
- **FK 안전 순서** 내장: `projects.last_writer_run_id` null → 자식(candidates/jobs/editor/video/subtext)
  → shots/scenes/locations(→writer_runs FK 보유) → 관계 → writer chars → writer_runs.
- 멱등. 재핸드오프가 `producer_draft`에서 cast/배경을 다시 materialize 하므로 WIPE 안전.

## 절차 (반드시 dry-run 먼저 — 파괴적·비가역)

1. **projectId 확인.** 사용자가 안 주면 묻는다. UUID 형식 검증.
2. **dry-run**: `node scripts/reset-to-producer.mjs <projectId> --dry`
   → wipe 예정 건수 + keep(producer) 건수 표를 사용자에게 그대로 보여주고 진행 확인을 받는다.
   - producer characters/messages가 **0이면 경고**(producer 내용이 비어 잘못된 projectId일 수 있음 — 중단하고 재확인).
3. **실행**: `node scripts/reset-to-producer.mjs <projectId>` (확인 후에만).
4. **검증**: 출력의 `DONE — current_stage now 'producer'` 확인. 의심되면 DB로 재확인
   (`scenes/shots/locations/writer_runs/generation_jobs = 0`, `current_stage='producer'`, producer chars/messages 보존).
5. 사용자에게 1줄 보고: wipe 합계 + "재핸드오프하면 writer 재검증 가능".

## 주의

- git 권한 없음 — 사용자가 커밋. DB 변경은 즉시 라이브 반영(되돌리기 불가).
- 환경: `.env.local`의 `SUPABASE_SERVICE_ROLE_KEY` 사용(스크립트가 dotenv로 로드).
- 비슷한 이름 `seed:producer:reset`은 **스냅샷 복원**(현재 내용 덮어씀)이라 다름 — 이 루틴은 현재 producer 내용을 보존한다.
