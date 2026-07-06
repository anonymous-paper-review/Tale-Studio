# src/lib — 공유 라이브러리 맵

> 모듈 단위 포인터만. 구현 디테일은 코드가 진실. route/store 구조는 `src/app/api/**/route.ts`와 `src/stores/*.ts`를 직접 읽는다.

## AI · 생성 인프라

| 모듈 | 용도 |
|---|---|
| `writer/` | **writer 엔진** (스토리→씬/샷/프롬프트/이미지/비디오 파이프라인) — `writer/CLAUDE.md` 참조 |
| `generation-jobs.ts` | 비동기 생성 잡 라이프사이클 (queued→completed/failed, CAS 전이, target JSONB, actor 귀속 = 활동 로그) |
| `generation-jobs-client.ts` | 잡 폴링 클라이언트 헬퍼 |
| `generation-quota.ts` | 유저별 동시 생성 쿼터 가드 (fail-open, 429 `quota_exceeded`) |
| `generation-notify.ts` | 크로스스테이지 생성 완료 알림 (lib→store `getState()` 패턴 — store간 직접 import 금지 우회) |
| `claude.ts` / `llm.ts` | 채팅 LLM (claudeChat / claudeJSON — fence 자동 제거). claudeChat은 멀티턴 프롬프트 캐싱(top-level `cache_control`) + 서버사이드 compaction 안전망(`beta.messages.create`, `compact_20260112`, 트리거 `CHAT_COMPACTION_TRIGGER_TOKENS`) 적용 — chat-context-management |
| `fal/` | fal 관련 헬퍼 (writer/llm/fal.ts와 구분) |
| `kling.ts` | 6축 카메라 의미론 (옛 Kling 기원 — 현재 모델 비종속 제품 개념) |
| `video-models.ts` | 비디오 모델 registry (endpoint/duration spec) |
| `prompts.ts` | 채팅 시스템 프롬프트 |
| `knowledge.ts` | Knowledge DB (cinematography RAG) 조회 |

## 스테이지 · UI 보조

| 모듈 | 용도 |
|---|---|
| `stage-nav.ts` | 스테이지 핸드오프 공통 로직 (lib→store 패턴의 기준 예시) |
| `completeness.ts` | Artist/Director 산출물 누락 감지 (chat-proactive-copilot) |
| `script-lines.ts` | Writer 스크립트 라인맵·@L 멘션·채팅 컨텍스트 [L#] 주석 파생 |
| `writer-chat-updates.ts` | Writer 채팅 updates[] 화이트리스트 검증·라인 참조 sanitize |
| `artist/` | artist 도메인 헬퍼 (turnaround, chat-context = 채팅 워크스페이스 인식 활동 로그 빌더) |
| `chat-persistence.ts` / `editor-persistence.ts` | 채팅/에디터 영속화 |
| `editor-zip-export.ts` | 샷 ZIP 일괄 다운로드 |
| `audio-waveform.ts` / `timing.ts` / `pointer-drag.ts` | 에디터/캔버스 UI 유틸 |
| `inventory.ts` | 인벤토리 조회 |
| `supabase/` | Supabase 클라이언트 (admin.ts = service-role, server-only) |
| `constants.ts` / `utils.ts` | 공통 상수/유틸 |

## 컨벤션

- **lib→store는 허용** (`getState()`), store→store 직접 import 금지.
- 새 모듈 추가 시 이 표에 한 줄 추가 (용도 1줄만 — 디테일 금지, 코드가 진실).
