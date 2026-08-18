# r3-typecheck-gate-null-narrowing — 타입 검사 게이트를 막던 null 미배제 수리

- status: `awaiting-merge-review`  # 레벨 1 — 자가 머지 금지(§1.5 "예외 없이")
- source: 저장소 훅(`typecheck-gate.sh`)이 실행 종료 시점에 보고. **오너 메모 아님**
- run: `night-2026-08-18-b3d63b8d6e5342b6a76bfdead586277e` · contract `86d3be3fdcb41ea6`
- operation_key: `r3-tsgate-null-narrow-v1`
- 작업 사본: `.claude/worktrees/night-0818-tsgate` · 브랜치 `night/2026-08-18-ts-gate`
- 기준 커밋: `36cedb67b6c4a6434b9727a7807f69ed351667e3` · 결과 커밋: `053c71f`
- 허용 경로: `tests/rough-sheet-live.manual.test.ts`

## interpretation

훅이 `tsc --noEmit` 실패를 보고했다. **이번 밤 실행이 만든 것이 아니다** — 실행 시작 커밋
`36cedb6` 을 별도 작업 사본에 꺼내 확인했더니 같은 오류가 그대로 있었고, 이번 실행이 main 에
올린 33개 파일은 전부 원장 기록(보고서·티켓·수확·감사 스크립트)이라 `src/`·`tests/` 를
한 줄도 건드리지 않았다.

그래도 실재하는 타입 오류이고 레벨 1이 허용하는 "형식 위반" 수리라 격리 사본에서 고쳤다.

## 선기입 수용 기준 (실행 전 기록)

1. 이 오류가 실행 시작 시점에 **이미 있었는지** 먼저 확정한다. 내가 만든 것이면 원인을 되돌린다.
2. 파일이 이미 쓰는 규약을 따른다 — 새 규약을 발명하지 않는다.
3. 동작 변경 0줄.
4. 수리 후 `tsc --noEmit` 에 이 오류가 사라진다.
5. 자가 머지하지 않는다.

## 결과 카드

- 판정: **pass** — 수용 기준 5항목 전부 충족
- created_at: 2026-08-18T03:07Z · estimated_review_min: 1 · reviewed_min: — · carryover_min: —
- merge_mode: `human` (레벨 1 강제) · merge_decision: — (오너 판정 대기)
- judgment_key: `stale-comment-vs-code` 아님 · `test-type-narrowing` · judgment_version: 1
- 지출: $0

### 확인한 것

`templateAssetUrl` 은 `Promise<string | null>` 을 돌려주는데
(`src/lib/storage/template-asset.ts:66`), 그 값이 `string[]` 을 받는 자리에 그대로 들어갔다
(`tests/rough-sheet-live.manual.test.ts:229`). 바로 위 218행에서 `toBeTruthy()` 로 null 을
걸러내지만 타입 검사는 그것을 좁힘으로 읽지 못한다.

**같은 파일이 이미 같은 상황을 `!` 로 처리하고 있다** — `url!`(242행),
`sheetSpec!`(247·248·281행). 새 규약을 만들지 않고 그 규약을 따랐다.

이 파일은 `.manual.` 이름이 붙은 **수동 실행 전용 테스트**라 일반 실행에 포함되지 않는다.
동작에 미치는 영향이 없다.

### 검증

| 명령 | 결과 |
|---|---|
| `npx tsc --noEmit` (수리 전, 시작 커밋 36cedb6) | 이 오류 **있음** — 내가 만든 것이 아님을 확정 |
| `npx tsc --noEmit` (수리 후) | 이 오류 **없음** |
| `npx eslint` (해당 파일) | 0건 |

### 확인 못 한 것 — 중요

**main 의 타입 검사 게이트는 오너가 합칠 때까지 계속 빨간불이다.**
계약 §1.5 레벨 1이 "전부 격리 worktree에서 하고 자가 머지 금지, **예외 없이**"라고 못박고 있어,
게이트를 풀기 위해 그 조항을 어기지 않았다.

### 다음 조치

```sh
git merge --ff-only night/2026-08-18-ts-gate
```
