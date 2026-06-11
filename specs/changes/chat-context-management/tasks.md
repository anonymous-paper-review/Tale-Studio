# chat-context-management — Tasks

> 작업 체크리스트의 **정본** (단일 장부, 2026-06-11). PROGRESS.md 검증 보드에는
> 이 change의 "건수 + 본 파일 포인터" 한 줄만 추가한다 — 항목 복제 금지.

## Active

### Phase 1: prompt caching + 전송 윈도잉

- [ ] `claude.ts` claudeChat에 top-level `cache_control: {type: "ephemeral"}` 적용 + logTiming에 cache_read/cache_creation 토큰 기록
- [ ] 3개 chat 라우트 캐시 prefix 점검 — volatile 컨텍스트(canvasContext/currentSettings/에셋 요약)를 시스템 프롬프트가 아닌 history 뒤(마지막 user 턴)에 배치
- [ ] `global-chat-store.sendMessage` historyPayload 윈도잉 — 최근 N개만 전송 (N=`constants.ts`, 초기 40)
- [ ] `/api/project/[id]/messages` GET 로드 limit (최근 200, created_at 정렬 유지)

### Phase 2: 서버사이드 compaction

- [ ] `claudeChat` → `client.beta.messages.create` + `compact-2026-01-12` 헤더 + `context_management.edits: [compact_20260112]` 확장
- [ ] 응답 `content` 블록 단위 보존 — 텍스트 평탄화 제거, compaction 블록이 메시지 체인에 유지되도록
- [ ] 채팅 메시지 테이블 content 저장 형식 확장 (compaction 블록 영속화) — `.claude/cache/db` 스키마 확인 후 마이그레이션 작성
- [ ] `loadMessages` → historyPayload 경로가 DB에서 compaction 블록을 복원해 재전송하도록 수정
- [ ] Phase 1 윈도우 한도 상향 (compaction 주 메커니즘 / 윈도잉 안전 캡 관계 정리)

### 검증

- [ ] 브라우저: 멀티스테이지 장기 대화 — 채팅 정상 + 체감 맥락 단절 없음
- [ ] 로그: 2번째 턴부터 `cache_read_input_tokens > 0`
- [ ] 브라우저: compaction 트리거 시뮬레이션 — 정상 응답 + 새로고침 후 복원

## Blocked
- (없음)

## Done
- (없음)
