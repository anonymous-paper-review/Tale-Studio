# n3-writer-rerun-deadlock — writer 재요청이 진행 불가 상태에 갇히는가

- status: `done`  # 조사 완료 — 갇히는 자리 확정(단 원인은 메모의 추정과 다름)
- source: `_INBOX.md` snapshot `751c326ecb3d456facf594118ca278688dd12e0f3dfce4d90c6466957327f6b5` (fingerprint `12dec5aac06db440`, byte range 0-9531)
- run: `night-2026-08-18-b3d63b8d6e5342b6a76bfdead586277e` · contract `86d3be3fdcb41ea6`
- 실행 주체: night-investigator 백지 조사 작업자 (읽기 전용 Read/Grep/Glob, 모델 sonnet — fable 금지 준수)
- 자율성 레벨: 1 (사실 기계 — 조사만, 코드 수정·유료 발주 없음)
- operation_key: `n3-writer-rerun-lock-v1`

## 원문 인용 (형석 메모)

> writer 끝나고 다시 writer 다시 요청하면 갇힘

## interpretation

writer 단계가 한 번 끝난 프로젝트에서 writer 를 다시 요청하면 실행이 시작되지도 끝나지도
않는 상태가 된다는 주장이다. 상태 전이가 코드 안에 있으므로 "그 상태에 도달 가능한가"를
사실로 닫을 수 있다.

## observation — 이 조사가 답해야 할 질문

writer 재실행 요청이 들어올 때의 상태 전이 경로에, 빠져나갈 수 없는 자리가 실재하는가.

## 선기입 수용 기준

1. writer 실행 상태를 담는 필드·값 집합을 `파일:줄` 로 특정한다 (예: 대기/실행중/완료/실패).
2. 재요청 진입점을 전부 나열하고, 각 진입점이 기존 상태를 어떻게 다루는지 서술한다 —
   덮어쓰는가, 거부하는가, 무시하는가.
3. "완료 상태에서 재요청하면 진행 불가에 갇히는 경로가 있다"를 **참/거짓/확인 불가** 로
   판정한다. 참이면 갇히는 정확한 조건과 빠져나오는 방법(있다면)을 쓴다.
4. 이미 걸려 있는 가드·잠금(중복 실행 방지 등)이 있으면 그 해제 조건을 명시한다.
5. 런타임 재현은 이 조사 범위 밖이다. 코드로 판정 못 하는 부분은 `미확인` 으로 남긴다.

## 시작점 힌트 (전수는 직접 확인할 것)

- `src/lib/writer/pipeline/`, `src/app/api/writer/`
- `src/lib/generation-jobs.ts` (잡 상태), `src/lib/action-guard.ts`
- 검색어 후보: `running`, `in_progress`, `lock`, `already`, `duplicate`, `watchdog`

## 결과 카드

- 판정: **pass** — 수용 기준 5항목 충족. **단 갇히는 지점이 메모의 표현과 다르다**
- created_at: 2026-08-18T02:55Z · estimated_review_min: 5 · reviewed_min: — · carryover_min: —
- 지출: $0 · 코드 수정 0건 · 런타임 재현 0회

### 확인한 것 — "완료 후 재요청"은 안 갇힌다. 갇히는 건 그 앞이다

writer 실행 상태는 `writer_runs.status` 하나가 진실원이고 값은 네 개다 —
`running` / `completed` / `failed` / `awaiting_confirmation`
(`src/lib/writer/run-store.ts:14`).

**문자 그대로 `completed` 에서 재요청하면 갇히지 않는다 (판정: 거짓).**
`/api/writer/start` 가 막는 건 `running` 과 `awaiting_confirmation` 둘뿐이고
(`src/app/api/writer/start/route.ts:157`), `completed` 는 새 run 을 정상 생성한다
(`run-store.ts:66-93`).

**그런데 바로 옆에 진짜 갇히는 자리가 있다 (판정: 참).**
일반 사용자의 writer 실행은 **반드시** `awaiting_confirmation` 을 한 번 거친다 —
기본 엔진이 v1 이고(`src/lib/writer/engine.ts:3`) v1 은 `sceneGate:true` 로 시작해
(`start/route.ts:243`) 스토리 검수 직후 이 상태에서 멈춘다(`pipeline/steps.ts:855-858`).
**이 시점에 씬 초안이 이미 화면에 떠 있다**(`writer-generation-view.tsx:47,60-63`) —
즉 사용자 눈에는 "끝난" 것처럼 보인다.

그 상태에서 진행시킬 수 있는 경로가 셋 다 막혀 있다:

| 경로 | 결과 | 근거 |
|---|---|---|
| 재요청 `/api/writer/start` | **409 거부** — 새 run 안 생김 | `start/route.ts:157-159` |
| 자동 keepalive `/api/writer/resume` | **noop** — 아무 것도 안 함 | `resume/route.ts:43-45` |
| cron watchdog | **대상 밖** (`running` 만 조회) · 게다가 **하루 1회** | `watchdog/route.ts:33-37` · `vercel.json:2-7` |

유일한 출구는 `/api/writer/scene-gate` 확정·수정뿐이다(`scene-gate/route.ts:34-36,50-56`).
게다가 재요청 UI 는 **409 를 에러로 취급하지 않고 조용히 넘어간다**
(`src/stores/producer-store.ts:872-882`). 그래서 사용자가 보는 것은 정확히
"재요청했는데 아무 일도 안 일어난다"가 된다.

완전한 탈출 불능은 아니다 — 재요청이 writer 탭으로 재진입시키고 거기서 확정 제안이 다시
뜬다(`producer-store.ts:887-898`, `writer-generation-view.tsx:53-67`). 하지만 사용자가 그
화면을 다시 보지 않고 채팅에서만 재요청을 반복하면 진행은 영영 안 생긴다.

### 확인 못 한 것

- 형석이 실제로 밟은 클릭 순서는 메모에 없다. 위 경로는 "writer 끝난 뒤 재요청 → 갇힘"에
  **가장 잘 맞는** 상태 경로를 코드에서 역추적한 것이고, 그 경로였다는 직접 증거는 없다.
- `writer_runs` 에 `project_id` UNIQUE 제약이 있는지 — 마이그레이션 파일에 테이블 생성 구문이
  없어 코드로는 확인 불가.
- 이 조사는 정적 코드 대조다. 브라우저 재현은 하지 않았다.

### 다음 조치 — 오너/형석 판단 필요

고칠 자리가 셋으로 갈리고 성격이 다르다:
(1) 409 를 **조용히 삼키지 말고 사용자에게 "확정이 필요하다"고 말하기** — 가장 싸고, 증상을
바로 없앤다. (2) `awaiting_confirmation` 을 watchdog 대상에 넣기 — 다만 이 상태는 사람의
확정을 기다리는 게 정상이라 자동 복구가 맞는지가 질문이다. (3) 확정 대기 중임을 화면에서 더
분명히 하기. **(1)이 원인에 가장 가깝다** — 갇힌 게 아니라 갇혔다고 말해주지 않은 것이다.
