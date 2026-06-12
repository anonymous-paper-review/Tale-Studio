---
change: chat-context-management
status: archived
created: 2026-06-11
decisions: [51]
---

# Chat Context Management — 전역 채팅 컨텍스트 무한 성장 방지

## Why

전역 채팅(#51 chat-proactive-copilot이 마지막으로 확장한 구조)은 프로젝트 단위 단일 로그를 모든 스테이지가 공유하며, 매 턴 **전체 히스토리 + 스테이지 컨텍스트(canvasContext/currentSettings/에셋 요약)를 통째로 재전송**한다. 로드(`/api/project/[id]/messages` — limit 없음) → 전송(`global-chat-store.sendMessage` — 슬라이스 없음) → LLM 래퍼(`claude.ts` — 캐싱·트렁케이션 없음) 체인 어디에도 한도가 없어: (a) 입력 토큰·비용·레이턴시가 대화 길이에 비례해 선형 악화되고(프롬프트 캐싱 미사용으로 전액 과금), (b) 컨텍스트 한도 도달 시 이후 모든 요청이 400으로 실패해 **해당 프로젝트 채팅이 영구 사용 불가**가 된다(트림/복구 경로 없음, 실패한 유저 메시지도 저장되어 히스토리를 더 키움). 2026-06-11 레퍼런스 조사(ChatGPT/Anthropic 공식/LangChain/Manus) 결과 업계 표준은 **캐싱 → 삭제 → 압축 → 외부화 4계층 조합**. 현재 MVP 단계에는 Phase 1(캐싱+윈도잉)과 Phase 2(서버사이드 compaction)를 적용하고, Phase 3(canvasContext tool-calling 외부화)는 구조 변경 폭이 커 별도 change로 보류한다.

## What Changes

### Phase 1 — 즉시 방어: prompt caching + 전송 윈도잉
- `src/lib/claude.ts` `claudeChat`: top-level `cache_control: {type: "ephemeral"}` 자동 멀티턴 캐싱 적용 + `logTiming`에 `cache_read/cache_creation_input_tokens` 기록 (히트 검증용). 캐시 읽기 0.1×/쓰기 1.25× — 2턴부터 손익분기. Sonnet 4.6 최소 캐시 prefix 2048 토큰(짧은 초기 대화는 자연히 미캐시).
- 캐시 prefix 보호: 매 턴 변하는 스테이지 컨텍스트(canvasContext 등)가 prefix 앞쪽(시스템 프롬프트)에 들어가면 캐시가 매번 깨진다 — 3개 chat 라우트에서 volatile 컨텍스트를 **history 뒤(마지막 user 턴)** 로 배치 점검·조정.
- `global-chat-store.sendMessage`: `historyPayload` 윈도잉 — 최근 N개 메시지만 전송 (기본 N은 `constants.ts`, 초기값 40). 벽돌 시나리오 즉시 제거.
- `/api/project/[id]/messages` GET: 로드 limit (최근 200, `created_at` 정렬 유지).

### Phase 2 — 자동 압축: 서버사이드 compaction (beta)

> **결정 (2026-06-12, 구현 시 번복)**: 아래 "compaction을 주 메커니즘 + 블록 영속화 마이그레이션" 전제를 폐기했다. 멀티스테이지+산출물 외부화 구조에선 윈도잉이 입력을 트리거(600K) 한참 아래로 캡해 compaction이 주 메커니즘이 될 수 없음. 실제 구현 = **compaction@600K 보험(마이그레이션 0) + 토큰예산 윈도잉**, 블록 영속화/loadMessages 복원은 defer. 상세·근거 → `tasks.md` ## 결정.
- `claudeChat`을 `client.beta.messages.create` + `compact-2026-01-12` beta 헤더 + `context_management: {edits: [{type: "compact_20260112"}]}`로 확장 — 한도 근접 시 API가 이전 히스토리를 요약 블록으로 자동 압축 (Sonnet 4.6 지원).
- **compaction 블록 보존이 정합 조건**: 응답 `content`를 텍스트로 납작하게 만들지 말고 블록 단위로 메시지 체인에 유지·재전송. 우리 앱은 히스토리를 DB에서 재구성하므로 compaction 블록의 **DB 영속화**가 필요 — 채팅 메시지 테이블 content 저장 형식 확장 (마이그레이션 1건 예상, 스키마는 `.claude/cache/db` 확인 후).
- Phase 1 윈도잉과의 관계: compaction 도입 후 윈도우 한도를 상향 — compaction이 주 메커니즘, 윈도잉은 안전 캡.

### (Later — 별도 change) Phase 3 — canvasContext tool-calling 외부화
- 스테이지 상태를 매 턴 직렬화 주입하는 대신, 경량 요약 인덱스만 상시 주입하고 상세는 tool-calling으로 DB 온디맨드 조회 (Anthropic just-in-time retrieval / Manus 복원 가능 참조 패턴). 3개 chat 라우트 + `claudeChat` tool-use 루프 확장이 필요해 본 change 범위에서 제외.

## Impact

- Affected specs: 없음 — 코드 source-of-truth
- Affected code: `src/lib/claude.ts`, `src/app/api/produce/chat/`, `src/app/api/artist/chat/`, `src/app/api/director/chat/`, `src/app/api/project/[id]/messages/`, `src/lib/chat-persistence.ts`
- Affected stores: `src/stores/global-chat-store.ts`
- Affected DB: 채팅 메시지 테이블 — compaction 블록 영속화용 content 형식 확장 (마이그레이션 1건 예상)
- Affected decisions: #51

## Verification gate (archive 조건)

- tasks.md의 모든 [c] → [x]
- 브라우저: 멀티스테이지 장기 대화 후에도 채팅 정상 동작 + 맥락 유지 (윈도잉으로 인한 체감 맥락 단절 없음)
- 로그: 동일 프로젝트 2번째 턴부터 `cache_read_input_tokens > 0` 확인
- 브라우저: compaction 트리거 시나리오(대량 히스토리 시뮬레이션) — 정상 응답 + **새로고침 후 compaction 블록 복원** 확인
- source-of-truth 반영: `src/lib/CLAUDE.md` 모듈 표 1줄 갱신 (claude.ts 용도에 캐싱/compaction 반영)
