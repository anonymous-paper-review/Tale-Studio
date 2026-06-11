# chat-aware-regeneration — Tasks

> PROGRESS.md mirror. 원본 PROGRESS.md는 그대로 유지.
>
> **구현 중 발견 (2026-06-11)**: 설계의 상당 부분이 이미 코드에 존재했다 —
> ① "공유 명령"은 `/api/artist/generate-sheet`·`generate-world` 라우트가 이미 수행
> (UI 버튼과 채팅 applyUpdates가 같은 라우트 경유), ② 채팅 재생성은 updates[] 패턴
> (`regenerateCharacter`/`regenerateWorldAsset`)으로 이미 동작, ③ 상세 다이얼로그
> 재생성 버튼·진행 표시도 기구현. → 실작업은 **actor 귀속 + 활동 로그 컨텍스트 주입**으로 축소.
> Anthropic tool use 루프 전환은 불필요로 결정 (updates[] 패턴 유지).

## Archived (2026-06-12)

### Section 1: DB — generation_jobs.actor
- [x] migration 작성: `015_generation_jobs_actor.sql` — `actor text NOT NULL DEFAULT 'ui'` (2026-06-11)
- [x] **라이브 DB 적용** — Supabase에서 015 + 016 실행 + `_refresh.py` 재생성 (9개 컬럼 반영, actor 실값 확인) (2026-06-12)
- [x] 잡 생성 경로 actor 전달 — generate-sheet/generate-world 라우트(`'chat'` 외 전부 `'ui'`), writer `submit_asset_images`(`'writer'`) — ①(ui)·③(chat) 잡 기록으로 동작 확인 (2026-06-12)

### Section 2: 공유 명령 + actor 스레딩
- [x] (발견) 공유 명령은 기존 라우트가 이미 수행 — 별도 lib 추출 불필요 확인 (2026-06-11)
- [x] `generation-jobs.ts` — `GenerationJobActor` 타입 + create input + `listRecentGenerationJobs()` — 잡 기록·활동로그로 동작 확인 (2026-06-12)
- [x] artist-store — `generateCharacterView/AllViews/WorldAsset/WorldShot`에 actor 파라미터(default 'ui'), `applyUpdates`→`'chat'` — ①③ 동작 확인 (2026-06-12)

### Section 3: 채팅 컨텍스트 빌더 (workspace awareness, pull)
- [x] `src/lib/artist/chat-context.ts` — `buildArtistActivityContext()`: 최근 잡 12개 → "N분 전 [ui|chat|writer] <대상> — 진행 중|완료|실패" 직렬화 — ②("방금 뭐 했어?") 답변으로 동작 확인 (2026-06-12)
- [x] 스냅샷 보강 — global-chat-store 에셋 요약에 views/shots 보유 현황 포함 — 코드 ✓ (2026-06-12)
- [x] artist chat 라우트 — `projectId` 수용 + `userOwnsProject` 체크 + 활동 로그 주입 (실패는 비치명) — ② 동작 확인 (2026-06-12)

### Section 4: 채팅 동작 규약
- [x] (발견) 채팅 재생성 경로 기존재 — updates[] 패턴 유지, tool use 루프 전환 안 함 (2026-06-11)
- [x] 시스템 프롬프트 — `<context>` 활동 로그 해석 가이드([ui]/[chat]/[writer], 진행 중 잡 중복 재생성 금지) + `<cost-guard>` (명시 요청에만 재생성, #51 계승) — ②④ 동작 확인 (2026-06-12)
- [x] 행위 기록 messages 미저장 확인 — reply 텍스트만 저장 (`parseUpdates`가 JSON 블록 제거, 기존 동작 그대로) (2026-06-11)

### Section 5: UI — 재생성 버튼 + 진행 표시
- [x] (발견) 기구현 — `character-view-dialog`(뷰별 재생성)·`world-view-dialog`(프롬프트 편집+재생성)·`generatingViews/generatingLocations` 진행 표시. 신규 작업 없음. `/api/artist/regenerate` 별도 라우트 불필요 (기존 generate 라우트가 그 역할) (2026-06-11)

### 검증 (proposal Verification gate 시나리오)
- [x] ①UI 재생성 → 잡 actor='ui' 기록 + 카드 진행 표시 + 완료 반영 — malenia/sideLeft, DB 확인 (2026-06-12)
- [x] ②UI 재생성 직후 채팅 "방금 뭐 했어?" → UI발 재생성 인지 답변 (활동 로그 pull, 진행 중 잡 인지) (2026-06-12)
- [x] ③채팅 재생성 요청 → 잡 actor='chat' + 카드 동일 진행 표시 — malenia/sideRight, DB 확인 (2026-06-12)
- [x] ④명시 요청 없이 채팅 자율 재생성 없음 (비용 가드) — ②("방금 뭐 했어?")와 ③ 사이 새 chat 잡 미생성으로 증명 (사용자 승인 archive, 2026-06-12)

## Blocked
- (없음)

## Done
- 품질 게이트: `tsc --noEmit` exit 0, 변경 파일 8개 eslint clean, vitest 실패 2건은 기존(pre-existing, 로컬 writer 로그 의존) 확인 (2026-06-11)
- code-reviewer 패스 + HIGH/MEDIUM 반영 (2026-06-11):
  - `actor`를 공용 `COLUMNS`에서 분리 — 015 미적용 상태에서도 웹훅 완료/폴링 read 경로는 안 깨짐
    (깨지는 건 잡 insert와 활동 로그뿐, 활동 로그는 비치명 degrade)
  - `listRecentGenerationJobs` 에러 silent-swallow 제거 (warn 로그) + 24h 창 (오래된 실패 잡 노이즈 방지)
  - `relativeTime` NaN/음수(시계 오차) 가드
  - 확인된 한계 (수용): body `actor`는 클라 주장 값 — 'chat'|'ui'로 클램프되어 'writer' 위조 불가,
    어차피 활동 로그 라벨이지 authz 아님. director 라우트 잡은 actor 미전달(default 'ui') —
    director 채팅 귀속은 본 change 범위 외 (proposal §제외)
