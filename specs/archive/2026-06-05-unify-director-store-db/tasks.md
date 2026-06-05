# unify-director-store-db — Tasks

> PROGRESS.md mirror. 마커: `[ ]` 미착수 · `[c]` 코드완료/검증대기 · `[x]` 검증완료 · `[~]` 보류

## Step 0: canvas-store 샷 편집 → DB write-through (마이그레이션 0)
- [x] 0-1. `director-canvas-store`에 `debouncedShotSaveToDb` 이식 — `@/lib/supabase/client`,
        키 (project_id, shot_id=writerShotId), 컬럼 camera_config/lighting_config/camera_brand/focal_length/aperture/white_balance/prompt
- [x] 0-2. `updateNodeData`에서 camera/lighting/cameraPreset/prompt 변경 + `writerShotId` 존재 시 debounce 저장 트리거
- [x] 0-3. tsc/eslint clean (2026-06-05)
- [ ] 0-4. (검증) 캔버스 편집 → DB `shots` row 반영 + editor/새로고침에서 동일 값 — 브라우저 검증 대기

## Step 1: director-store 제거 (스토어 통합) — 2026-06-05 코드 완료
- [x] 1-1. `editor-store` fallback 제거 — DB 경로(1)가 캐넌(Step 0 write-through로 캔버스 편집도 DB 반영). import 제거
- [x] 1-2. `global-chat-store` director 분기 → 항상 canvas 모드. legacy shotContext/suggestedCamera/Lighting 분기 + import 제거
- [x] 1-3. `src/stores/director-store.ts` 삭제 + `project-store.resetChildStores`에서 제거(canvas-store reset은 기존 존재) — src 내 잔존 ref 0
- [x] 1-4. tsc clean / editor·global-chat·project-store eslint clean (project-store의 require() 경고는 pre-existing)
- [ ] 1-5. (검증) editor 로드 정상 + Director 채팅 정상 — 브라우저 검증 대기

## Step 2: 그래프 구조 DB-back (완전 일원화) — 2026-06-05 코드 완료
- [x] 2-1. decision **#48** (#43 번복, 005 적용 노선 전환) 기록 + #43 superseded 마킹
- [x] 2-2. 마이그레이션 005 라이브 적용 — `_apply_migration.mjs`(shots 28→29) + `NOTIFY pgrst` + `_refresh.py`,
        scenes/shots/video_clips canvas_position + video_clips is_final/take_label/override 확인, drift 0
- [c] 2-3. hydrate — `hydrateFromDb(projectId)` 신설: scenes/shots `canvas_position` 적용 + `video_clips`→Video 노드 생성(누락분).
        `use-writer-director-sync`가 seed 후 1회 호출(projectId 가드) — 코드 ✓ / 검증 대기
- [c] 2-4. write-back — `persistNodePosition`(drag-end), `addVideoTake`(INSERT→videoClipId), `applyVideoOverride`(override),
        `setVideoFinal`(is_final + 형제 demote), `setVideoStatus`(url/status), `deleteNode`(DELETE). `VideoNodeData.videoClipId` 신설 — 코드 ✓ / 검증 대기
- [c] 2-5. localStorage persist 유지하되 진입 시 `hydrateFromDb`가 DB 진실로 재조정(덮어쓰기) — 캐시로 강등 — 코드 ✓ / 검증 대기
- [x] 2-6. tsc/eslint clean (2026-06-05, 변경 4파일 + 내 리뷰로 INSERT/DELETE/hydrate/demote 로직 확인)
- [ ] 2-7. (검증) 노드 위치/테이크 DB 영속 → localStorage 비워도 복원, editor·새로고침 동일 — 브라우저 검증 대기

## Blocked / Notes
- Step 2-2(005 적용)는 사용자 확인 필요(DB 적용 규약).
- 양방향 writer↔director 라이브 sync는 범위 밖(#44 유지) — 단방향 write-through + 1회 hydrate만.
