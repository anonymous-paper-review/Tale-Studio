# chat-context-management — Tasks

> 작업 체크리스트의 **정본** (단일 장부, 2026-06-11). PROGRESS.md 검증 보드에는
> 이 change의 "건수 + 본 파일 포인터" 한 줄만 추가한다 — 항목 복제 금지.

## Active

(없음 — Phase 1·2 코드 완료, 브라우저/로그 검증은 사용자 waive 2026-06-12. Done 참조.)

## Blocked
- (없음)

## Done

### Phase 1: prompt caching + 전송 윈도잉 (코드 ✓ · 검증 waived 2026-06-12)

- [x] `claude.ts` claudeChat top-level `cache_control` + logTiming cache_read/creation 기록 — tsc clean
- [x] 3개 chat 라우트 캐시 prefix 점검 — volatile 컨텍스트(storyText/settings/canvas/activity)가 이미 마지막 user 턴에 prepend됨 확인(추가 이동 불필요)
- [x] `global-chat-store.sendMessage` 전송 윈도잉 — 메시지 개수(`CHAT_HISTORY_WINDOW=40`) + char 예산(`CHAT_HISTORY_CHAR_BUDGET=48_000`) 이중 상한, 최소 1개 보장
- [x] `/api/project/[id]/messages` GET 로드 limit (`CHAT_MESSAGES_LOAD_LIMIT=200`)

### Phase 2: 서버사이드 compaction = 안전망 (코드 ✓ · 검증 waived 2026-06-12)

- [x] `claudeChat` → `beta.messages.create` + `compact-2026-01-12` 헤더 + `context_management.edits:[compact_20260112]`, 트리거 `CHAT_COMPACTION_TRIGGER_TOKENS=600_000` — SDK 0.80.0 타입으로 shape 검증, tsc clean
- [x] 응답 content에서 text 블록 탐색 — compaction 블록이 끼어도 `content[0]` 가정 안 깨지게
- [x] 윈도우 char 예산 도입 — 옛 "Phase 1 윈도우 한도 상향" 항목 대체(상향이 아니라 토큰예산 근사로 정밀화)

## Deferred

- [~] compaction 블록 DB 영속화 + `loadMessages` 복원 (turn 간 carry-over) — **defer**.
  사유: 스테이지 산출물이 이미 DB에서 매 요청 fresh pull(producer storyText/settings, artist canvas/activity, director canvas)되어 transcript에 누적되지 않음(Anthropic/Manus just-in-time 패턴). 윈도잉으로 입력이 600K에 닿지 않아 carry-over가 발효될 경로 자체가 없음 → 블록 영속화·DB JSONB 마이그레이션 불필요. 추후 윈도우를 풀어 대화를 키우는 설계(proposal Phase 3 tool-calling 외부화)로 갈 때만 재평가.

## 결정 (2026-06-12)

proposal의 "Phase 2 = compaction을 **주 메커니즘**으로 + 블록 영속화 마이그레이션" 전제를 **번복**.
멀티스테이지 + 산출물 외부화 구조에서 compaction은 주 메커니즘이 될 수 없음(윈도잉이 입력을 트리거
한참 아래로 캡). 채택안: **외부화(이미 충족) + 토큰예산 윈도잉 + compaction@600K 보험** — 마이그레이션 0.
레퍼런스: Anthropic "Effective Context Engineering"(just-in-time/외부 노트), Manus context-engineering
(recoverable compression·KV-cache), Anthropic Compaction docs(기본 150K·최소 50K·per-request 설정).
