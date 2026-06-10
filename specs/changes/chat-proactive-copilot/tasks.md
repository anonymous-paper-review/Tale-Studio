# chat-proactive-copilot — Tasks

> PROGRESS.md mirror. 원본 PROGRESS.md는 그대로 유지.
> Phase 1만 상세 분해 (autopilot 입력용). Phase 2~5는 상위 placeholder — Phase 1 검증 후 분해.

## Active

### Phase 1: 프로액티브 넛지 1종 (구현 완료, 검증 waive 2026-06-10)
> **구현 중 재정의 (2026-06-09):** 코드 검증 결과 `saveAndHandoff`(producer-store.ts:69)가 writer
> 파이프라인을 fire-and-forget(~2분)로 띄우므로 **핸드오프 순간엔 DB가 비어** "지금 생성?" 제안이 불가.
> 또한 artist 진입 시 `autoGenerateBaseImages()`(artist-store.ts:716)가 **이미 자동 생성**을 수행 →
> "생성할까요?" 제안은 중복. 따라서 사용자 결정으로 **Option B = '다음 단계' 넛지**로 전환:
> 자동생성 완료 후 채팅이 "캐릭터 N·배경 M 준비됐어요 — Director로 갈까요?" 1회 제안(비용 무발생).
- [x] 트리거 지점 확정 — artist 진입 후 자동생성 settle(생성 중 0 + mainReady) 1.5s debounce (page.tsx) — 검증 waive 2026-06-10
- [x] 감지 소스 — DB 로드된 `characterAssets`/`worldAssets` 카운트 (writer 완료 후 실데이터) — 검증 waive 2026-06-10
- [x] system-initiated 제안 주입 — `global-chat-store`: `ChatSuggestion` 타입 + `suggestion` 상태 + — 검증 waive 2026-06-10
      `offerSuggestion`/`dismissSuggestion` (유저 입력 없이 채팅 버블 표시)
- [x] 제안 UI — `global-chat.tsx` actionable 버블 + "Director로 가기" / "나중에"(dismiss) — 검증 waive 2026-06-10
- [~] 승인 시 생성경로 재사용 — Option B 재정의로 **생성 트리거 아님**(자동생성 유지). 승인 액션은
      Director 네비게이션(`handoffToStage` 공통 헬퍼, HandoffButton과 dedup)
- [x] 거부 시 no-op + dismiss + `dismissedSuggestionIds` 기록(세션 재진입 시 재발사 방지) — 검증 waive 2026-06-10
- [x] 비용 가드 — 넛지/승인 경로가 어떤 fal/생성 코드도 안 건드림 (code-reviewer 추적 확인) — 검증 waive 2026-06-10
- [x] TS clean (`tsc --noEmit`) + eslint clean (5개 변경 파일)
- [x] CLAUDE.md GlobalChat "artist hide" stale 문서 정정 (전 stage 렌더)
- [~] (예약) 브라우저 검증: artist 자동생성 완료 → 1.5s 후 넛지 등장 → "Director로 가기" 시 이동 / — waive (2026-06-10 사용자 결정)
      "나중에" 시 dismiss + 재진입해도 재발사 안 됨

### Phase 2: 완료 알림 + 크로스스테이지 통지 (구현 완료, 검증 waive 2026-06-10)
- [x] 완료 알림 메서드 — `global-chat-store`: `stageBadges` 상태 + `notifyCompletion`(다른 stage일 — 검증 waive 2026-06-10
      때만 배지 bump + 10초 스로틀 채팅 메시지) + `clearStageBadge`
- [x] 완료 훅 — `lib/generation-notify.ts`(store→lib 패턴) 호출을 artist-store(캐릭터/배경 생성 완료)· — 검증 waive 2026-06-10
      director-canvas-store(스토리보드/영상 완료) 완료 지점에 삽입
- [x] 사이드바 배지 — `sidebar.tsx` stage 버튼에 카운트 배지(활성/잠금 제외), `studio/layout.tsx` — 검증 waive 2026-06-10
      진입 시 `clearStageBadge`
- [x] TS/eslint clean
- [~] 접힘(collapsed) 상태 제안 가시성(code-review MEDIUM-2) — 후속(접힘 핸들 도트). 이번 범위 외

### Phase 3: 멀티유저 큐 + 유저별 동시성 쿼터 (구현 완료, 검증 waive 2026-06-10)
- [x] 유저별 in-flight 집계 — `generation-jobs.ts` `countQueuedJobsByUser`(workspace→project→jobs 2-hop, — 검증 waive 2026-06-10
      마이그레이션 없음)
- [x] 쿼터 가드 — `lib/generation-quota.ts` `checkUserQuota`(상한 30, fail-open) + `quotaExceededBody`(429) — 검증 waive 2026-06-10
- [x] 4개 submit 라우트 적용 — generate-sheet/generate-world/generate-storyboard/generate-video에 가드 삽입 — 검증 waive 2026-06-10
- [x] TS/eslint clean
- [~] 진짜 fair-queue(유저 라운드로빈 디스패치) — 후속. 지금은 관대한 상한 + 429

### Phase 4: completeness 모델 → 누락 감지 제안 (구현 완료, 검증 waive 2026-06-10)
- [x] completeness 순수 함수 — `lib/completeness.ts` `getArtistGaps`/`getDirectorGaps`/`summarizeGaps` — 검증 waive 2026-06-10
- [x] director 누락 감지 넛지 — `director/page.tsx` 캔버스 안정(2s) 후 갭 있으면 informational 제안 1회 — 검증 waive 2026-06-10
- [x] TS/eslint clean
- [~] 갭 "바로 채우기" action(생성/참조 연결 트리거) — 후속. 지금은 informational(action null)

### Phase 5: 채팅-UI parity 감사 + writer 채팅 결정 (구현 완료, 검증 waive 2026-06-10)
- [x] writer 채팅 결정 — `CHAT_SUPPORTED_STAGES`에서 `'writer'` 제거(백엔드 전용, #38). 죽은 에러경로 제거
- [x] parity 감사 문서 — `parity-audit.md`(스테이지별 채팅 커버 vs 갭 + 후속 작업)
- [~] 핸드오프 채팅 명령/lock·Register/final 마킹 등 parity 갭 구현 — 별도 change 권장(audit 문서에 목록)

## Blocked
- (없음)

## Done
- [x] deep-interview 의사결정 수렴 (명료도 19%, `.omc/specs/deep-interview-chat-orchestration-architecture.md`)
- [x] CLAUDE.md AI 스택 drift 정정 (Claude 채팅 / Gemini+Claude writer / fal 이미지·영상)
