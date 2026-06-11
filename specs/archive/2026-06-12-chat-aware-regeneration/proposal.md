---
change: chat-aware-regeneration
status: active
created: 2026-06-11
decisions: [51, 38, 37]
---

# Chat-Aware Regeneration (artist 이미지 재생성 — 공유 명령 + 채팅 인식)

## Why

artist 탭에서 이미지 재생성의 진입점이 둘로 갈라진다: 글로벌 채팅(자연어 요청)과
상세 다이얼로그의 재생성 버튼(직접 조작). 이때 "UI에서 재생성하면 채팅이 그 사실을
알아야 하는가"가 문제였는데, 논의(2026-06-11) 결과 다음으로 재정의했다:

> 채팅이 가져야 할 것은 **대화 기록이 아니라 작업공간 인식(workspace awareness)**.
> 진실은 DB(에셋 상태 + `generation_jobs` 활동 로그)에 있고, 채팅은 **응답 시점에
> pull 방식으로 읽는 소비자**일 뿐이다. 이벤트를 대화에 실시간 push할 필요 없음
> (Cursor 패턴 — 손으로 파일을 고쳐도 채팅은 다음 턴에 현재 상태를 읽는다).

이 모델에서 핵심 구조 3가지:
1. **단일 명령, 다중 진입점** — 재생성은 하나의 공유 lib 함수. UI 버튼과 채팅
   tool call은 같은 함수를 호출하는 invoker일 뿐 (`actor`만 다름).
2. **`generation_jobs` = 활동 로그** — 이미 존재하는 잡 테이블에 `actor` 컬럼
   하나만 추가하면 "누가(ui/chat/writer) 언제 무엇을 재생성했다"가 도출된다.
   "재생성 중" 상태도 별도 플래그가 아니라 "해당 에셋 target의 queued 잡 존재"로 도출.
3. **채팅 컨텍스트 빌더 (pull)** — 매 채팅 요청 시 에셋 스냅샷 + 최근 잡 N개를
   직렬화해 시스템 컨텍스트로 주입. 별도 md 파일/이벤트 버스 없음 (진실 이원화 금지).

\#51(chat-proactive-copilot)의 채팅-UI parity 방향과 정합하며, 그 비용 가드
(**자율 재생성 금지** — tool은 유저의 명시적 요청에만 호출)를 그대로 계승한다.

## What Changes

> **구현 중 정정 (2026-06-11)**: 탐사 결과 "공유 명령"(generate-sheet/generate-world 라우트를
> UI·채팅이 공용), 채팅 재생성(updates[] 패턴), 다이얼로그 재생성 버튼·진행 표시가 **이미
> 존재**했다. 실작업은 아래 두 축으로 축소 — tool use 루프 전환·신규 라우트는 하지 않음.

- **DB**: `generation_jobs.actor text NOT NULL DEFAULT 'ui'` (`'ui' | 'chat' | 'writer'`)
  마이그레이션(015). actor 귀속: generate-sheet/generate-world 라우트가 body `actor`
  수용(`'chat'` 외 전부 `'ui'`로 클램프), artist-store `applyUpdates`(채팅발)가 `'chat'`
  전달, writer `submit_asset_images`는 `'writer'`.
- **채팅 컨텍스트 빌더 (pull)**: `src/lib/artist/chat-context.ts` —
  최근 `generation_jobs` 12개를 "N분 전 [ui|chat|writer] <대상> — 진행 중|완료|실패"로
  직렬화해 artist chat 요청 시 주입 (`projectId` + 소유권 체크, 실패 비치명).
  스냅샷(클라 에셋 요약)에 views/shots 보유 현황 추가. 시스템 프롬프트에 활동 로그
  해석 가이드 + `<cost-guard>`(명시 요청에만 재생성, 진행 중 잡 중복 submit 금지) 추가.
- **행위 기록의 진실은 `generation_jobs` 한 곳**: 채팅 reply는 텍스트만 messages에 저장
  (updates JSON 블록은 기존대로 미저장) — 다음 턴 컨텍스트 빌더가 잡 로그로 자기 행위 포함
  전체 활동을 인지.
- **제외**: 버전 히스토리(`asset_versions` — 이전 이미지 보관), push형 채팅 알림
  (완료 시 채팅이 먼저 말 걸기 — #51 Phase 2 영역), editor/director 확장,
  Anthropic tool use 루프 전환(updates[] 패턴 유지).

## Impact

- Affected specs: `specs/data/asset_storage.md` (재생성 명령 인터페이스 추가 여부 확인)
- Affected code: `src/lib/` (컨텍스트 빌더 `artist/chat-context.ts` 신규 + `generation-jobs.ts` actor),
  `src/app/api/artist/chat/`, `src/features/artist/` (view dialogs), `databases/` migration
  (~~`src/app/api/artist/regenerate/` 신규~~ — 미생성: 기존 generate-sheet/generate-world 라우트가 그 역할, 2026-06-11 정정)
- Affected stores: `artist-store` (재생성 액션 + 진행 상태)
- Affected DB: `generation_jobs.actor` 컬럼 추가
- Affected decisions: #51 (비용 가드 계승), #38 (writer actor 구분), #37 (재생성 대상 =
  턴어라운드 시트 파이프라인)

## Verification gate (archive 조건)
- tasks.md의 모든 [c] → [x]
- **브라우저 검증 시나리오**:
  1. 상세 다이얼로그에서 재생성 버튼 → 잡 생성(actor='ui') → 카드에 "재생성 중" 표시
     → webhook 완료 후 새 이미지 반영.
  2. UI 재생성 직후 채팅에 "방금 뭐 했어?" → 채팅이 UI발 재생성 사실을 인지하고 답변
     (컨텍스트 빌더 검증).
  3. 채팅에 "Viper 이미지 다시 만들어줘" → tool call → 잡 생성(actor='chat') →
     카드에 동일하게 "재생성 중" 표시.
  4. 명시적 요청 없이 채팅이 자율적으로 재생성을 트리거하지 않음 (비용 가드).
- source-of-truth spec final state 반영 + `.claude/cache/db` 재생성 (`_refresh.py`)
