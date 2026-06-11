# Progress

> **이 파일은 진행 중(live) 작업만 유지.** 완료 Phase는 `docs/progress-log/` (Q1: Phase 0~10, Q2: Phase 11~12).
> **이중 장부 금지 (2026-06-11)**: 작업 체크리스트의 정본은 각 change의
> `specs/changes/<name>/tasks.md` — 이 파일은 **건수 + 포인터만** 든다.
>
> **상태 범례**: `[ ]` 미착수 · `[c]` 코드 완료/검증 대기 · `[x]` 검증 완료 · `[~]` 보류 (사유 명시)
> DoD가 *동작*이면 브라우저 검증 후에만 `[x]` (constitution §작업 진행 규약).
>
> **세션 진입 시**: 아래 검증 보드 확인 → 미검증 영역 1줄 보고 → (a) 검증 (b) 신규 작업 (c) 버그 수정 선택받기.

---

## 현재 검증 보드 (2026-06-12)

| Change | 상태 | 상세 (정본) |
|---|---|---|
| `chat-aware-regeneration` | `[c]` **7건** + 브라우저 시나리오 4건 | `specs/changes/chat-aware-regeneration/tasks.md` |
| `chat-context-management` | `[ ]` **12건** (Phase 1+2) | `specs/changes/chat-context-management/tasks.md` |
| `producer-story-gate` | `[ ]` **23건** (6섹션) | `specs/changes/producer-story-gate/tasks.md` |

> ✅ **2026-06-12 archived**: `generation-jobs-multiuser-guard` (decision #54). `015`+`016` 라이브 적용·검증 완료 →
> `specs/archive/2026-06-12-generation-jobs-multiuser-guard/`. 이제 생성 잡 insert가 runtime metadata 컬럼을 정상 기록.

> **2026-06-10 일괄 waive 이력**: 누적 `[c]` 43건 + changes 21건을 검증 waive로 `[x]` 승격
> (writer 외부 재작업 예정 사유). **waive ≠ 브라우저 동작 보증** — 재작업 머지 후 회귀 확인 필요 시 신규 등록.

## 임시 조치 (여전히 유효)

- `/api/generate/image` (레거시 라우트)가 Nano Banana(`gemini-2.5-flash-image`) 사용 중 (decisions #34)

## Backlog (live)

- [ ] 전체 파이프라인 E2E 검증 (P1→P5)

> 과거 이력: Phase 0~10 → `docs/progress-log/2026-Q1.md` · Phase 11~12 (Director Canvas 재설계,
> Artist 카드형 복원) → `docs/progress-log/2026-Q2.md` · archive 의식 이력 → `specs/decisions.md`.
