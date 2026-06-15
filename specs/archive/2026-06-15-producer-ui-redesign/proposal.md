---
change: producer-ui-redesign
status: active
created: 2026-06-15
decisions: [58, 57, 30]
source_spec: .gjc/specs/deep-interview-producer-ui-redesign-readiness-board.md
plan: .gjc/plans/ralplan/2026-06-13-0225-7e5c/pending-approval.md
---

# Producer UI 재설계 — Handoff Readiness Board

## Why
Producer(The Meeting Room)의 실제 산출물은 writer로 넘기는 핸드오프 계약이다:
`genre` + `castContract` + `storyText/storyReady` + `saveAndHandoff` → `/api/writer/start`.

기존 main UI는 `스토리설정 | 캐스트` 두 패널이고, shell의 고정 `GlobalChat`까지 합쳐 사용자에게
`설정 | 캐스트 | 채팅` 3분할처럼 보인다. 이 구조는 다음 문제를 만든다:

1. **인과 은폐** — 실제 흐름은 `채팅 추출 → Producer source 제안/확정 → writer handoff`인데 세 칸이 대등해 보인다.
2. **read-back을 input처럼 보이게 함** — 설정/캐스트 대부분은 채팅 결과 확인 surface인데 primary form처럼 보인다.
3. **게이트와 수정 위치 분리** — footer `GateStatus` dump는 무엇이 문제인지 보여주지만 어디서 고치는지와 떨어져 있다.
4. **캐스트 보강 루프 단절** — 카드의 빈 필드를 채팅으로 보강하려면 사용자가 맥락을 직접 다시 써야 한다.

Deep Interview + Ralplan consensus 결과, main surface의 core는 문서/폼이 아니라 **Handoff readiness board**로 확정됐다.
오른쪽 `GlobalChat` rail은 전 stage 공통 shell이므로 유지하고, Producer main만 하나의 readiness board로 통합한다.

## What Changes

### 1. Producer main → Handoff readiness board
- `ProjectDashboard + CastPanel` split을 제거하고, Producer main을 하나의 readiness board로 만든다.
- Board는 writer handoff 계약 항목을 준비/누락 상태로 보여준다:
  - Story readiness
  - Story foundation: playtime, genre, subGenre, format, tone, dialogueLanguage
  - Cast readiness: person/object cards, depth-linked hard requirements
- `evaluateProducerGate`가 handoff 가능 여부의 source of truth로 남고, board는 그 결과를 inline으로 렌더링한다.

### 2. GateStatus dump 제거
- Footer `GateStatus` list dump를 제거한다.
- hard missing은 관련 board 항목 근처에 inline 표시한다.
- handoff button은 미충족 시 `남은 N개`만 요약한다.

### 3. Cast ↔ chat completion loop
- 캐스트 카드/board에서 누락 hard field quick edit를 제공한다.
- `프로듀서에게 채워달라`는 자동 전송이 아니라 `GlobalChat` 입력창에 추천 문장을 채우고 focus만 한다.
- 사용자가 직접 전송하면 기존 추출 로직이 빈칸만 채운다.
- 복잡한 `arc`/`motivation` 전체 편집은 `CastEditDialog`를 보조 surface로 유지한다.
- shared chat draft는 one-shot set + focus + clear, no-clobber(default ignore), no auto-send, no rail layout change 원칙을 따른다.

### 4. targetEmotion Producer 완전 제거
- Producer UI, producer chat prompt/extraction, producer gate, producer source patch/storage에서 `targetEmotion`을 제거한다.
- Writer 영역은 다른 개발자 소유이므로 target emotion 도출/처리를 이 change에서 설계·수정하지 않는다.
- 현재 writer compatibility를 위해 writer handoff `genre.targetEmotion`은 안전한 빈 배열 `[]`로 전달한다.

### 5. Character voice 완전 제거
- 캐릭터 metadata의 `voice`를 제거한다.
- 제거 범위: Producer cast types/store/gate/dialog/chat prompt, writer cast contract/types/adapters/s3 seed, writer start DB write path, lifecycle hash/test.
- DB migration으로 `characters.voice` 컬럼을 drop한다.
- Editor/Post-production audio source의 `kind='voice'`는 다른 도메인이므로 유지한다.

## Impact
- Affected specs: `specs/ux_pages.md` P1 final state.
- Affected code:
  - `src/app/studio/producer/page.tsx`
  - `src/features/producer/readiness-board.tsx`
  - `src/features/producer/cast-edit-dialog.tsx`
  - `src/features/producer/tag-input.tsx`
  - `src/components/layout/global-chat.tsx`
  - `src/stores/chat-ui-store.ts`
  - `src/stores/producer-store.ts`
  - `src/lib/producer-gate.ts`
  - `src/app/api/produce/chat/route.ts`
  - `src/app/api/writer/start/route.ts`
  - `src/lib/writer/cast-contract.ts`, `adapters.ts`, `types/pipeline.ts`, `pipeline/stages/s3_scenes.ts`, `pipeline/util/persist_manifest.ts`
  - `src/lib/lifecycle.ts`
- Affected DB: `databases/migrations/021_drop_characters_voice.sql`.
- Explicit non-impact: `src/types/shot.ts`, `src/lib/audio-waveform.ts`, `src/stores/editor-store.ts` audio `kind='voice'` remains.

## Gate G — DB drop precondition
`021_drop_characters_voice.sql` must only be applied after:
- no character/cast `voice` reads/writes/types remain;
- writer start handoff smoke check passes while the table still has the column;
- editor audio `kind='voice'` is confirmed untouched;
- static gates are clean.

## Verification gate (archive 조건)
- `pnpm typecheck` / `pnpm lint` clean.
- Focused tests for producer gate/lifecycle and affected store/helper behavior pass.
- Browser verification:
  - Producer 진입 → 채팅으로 스토리/캐스트 채움 → readiness board에 준비/누락 상태 표시.
  - 누락 hard field를 inline quick edit 또는 chat draft assist로 해결.
  - Handoff succeeds and writer start does not break with `targetEmotion: []` and no character `voice` payload.
  - Producer UI에 targetEmotion 입력 없음.
  - Producer UI에 character voice 입력 없음.
  - `GateStatus` dump가 보이지 않음.
  - DB `characters.voice` 컬럼 제거 migration 확인.
- `specs/ux_pages.md` P1 final state 반영.
