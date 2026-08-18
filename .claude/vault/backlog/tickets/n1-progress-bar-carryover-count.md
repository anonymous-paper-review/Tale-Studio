# n1-progress-bar-carryover-count — 재생성 진행률 표시가 이전 작업 수를 합산하는가

- status: `done`  # 조사 완료 — 원인 확정, 수리는 별도(오너 몫: 어느 화면 기준으로 셀지)
- source: `_INBOX.md` snapshot `751c326ecb3d456facf594118ca278688dd12e0f3dfce4d90c6466957327f6b5` (fingerprint `12dec5aac06db440`, byte range 0-9531)
- run: `night-2026-08-18-b3d63b8d6e5342b6a76bfdead586277e` · contract `86d3be3fdcb41ea6`
- 실행 주체: night-investigator 백지 조사 작업자 (읽기 전용 Read/Grep/Glob, 모델 sonnet — fable 금지 준수)
- 자율성 레벨: 1 (사실 기계 — 조사만, 코드 수정·유료 발주 없음)
- operation_key: `n1-progress-carryover-v1`

## 원문 인용 (형석 메모)

> 재생성 로직돌때 상단바에 더 정보를 줄 수 있 수 있을 것 같다
>  - 버그 : 작업 끝나고 다른 작업인 것 같은데 이전에 완료된 작업 수가 합산된다. (처음 시작이 6/8)

## interpretation

화면 상단 진행률 표시가 새 재생성 묶음을 시작할 때 0/N 이 아니라 6/8 처럼 이미 진행된 값으로
뜬다. 이전 묶음의 완료 개수가 분자·분모에 섞여 들어간다는 주장이다. 판정 기준이 코드 안에
있으므로(어떤 집합을 세는가) 밤이 사실로 닫을 수 있다.

## observation — 이 조사가 답해야 할 질문

진행률의 분자와 분모를 만드는 코드 자리가 어디이며, 그 집합에 이전 묶음의 작업이 포함될 수
있는 경로가 실제로 존재하는가.

## 선기입 수용 기준

1. 상단 진행률(완료수/전체수)을 계산하는 자리를 `파일:줄` 로 특정한다. 여러 자리면 전부.
2. 분자·분모가 세는 집합의 범위를 명시한다 — 프로젝트 전체인가, 현재 묶음인가, 시간창인가.
   범위를 정하는 필드나 조건문을 `파일:줄` 로 제시한다.
3. "이전 묶음의 완료 작업이 현재 표시에 합산되는 경로가 있다"를 **참/거짓/확인 불가** 중
   하나로 판정하고 근거 줄을 붙인다. 참이면 6/8 같은 초기값이 나오는 구체 조건을 서술한다.
4. 근거 없는 추측 금지. 코드에 없으면 "없음"으로 답한다.

## 시작점 힌트 (전수는 직접 확인할 것)

- `src/lib/generation-jobs.ts`, `src/lib/generation-jobs-client.ts`, `src/lib/generation-queue.ts`
- `src/stores/` 하위 store, `src/components/layout/` 상단바 계열
- 검색어 후보: `progress`, `completed`, `total`, `pending`, `queued`, `active`

## 결과 카드

- 판정: **pass** — 수용 기준 4항목 전부 충족, 가설 **참**
- created_at: 2026-08-18T02:50Z · estimated_review_min: 3 · reviewed_min: — · carryover_min: —
- 지출: $0 (모델 조사 1회, 유료 생성 0건) · DB 조회 0회 · 코드 수정 0건

### 확인한 것

진행률 표시(`완료수/전체수`)를 만드는 자리는 5곳이고, 그중 **3곳이 "지금 재생성 중인 묶음"이
아니라 "프로젝트 전체"를 센다**. 형석이 본 `6/8` 은 이 구조에서 그대로 나온다.

| 자리 | 대상 | 세는 범위 | 캐리오버 |
|---|---|---|---|
| `src/components/layout/chat-progress-pin.tsx:127-134` | writer 텍스트 | 현재 run (새 run 은 0 으로 insert) | 없음 |
| `src/lib/pipeline-progress.ts:47-68` `writerRoughWork` | 러프 재생성 | 프로젝트 전체 샷 | **있음** |
| `src/lib/pipeline-progress.ts:77-108` `artistImageWork` | 캐릭터·배경 그림 | 재생성 분기는 `done: 0` 고정 | 없음(이미 우회) |
| `src/lib/pipeline-progress.ts:111-132` `directorShotImageWork` | 촬영용 그림 재생성 | 프로젝트 전체 샷 노드 | **있음** |
| `src/lib/pipeline-progress.ts:135-153` `directorVideoWork` | 영상 재생성 | 프로젝트 전체 영상 노드 | **있음** |

기제: 세 함수 모두 "지금 도는 것"을 고르는 `generating` 필터로 **표시 여부**만 정하고,
바로 아래 `done`/`total` 은 그 필터를 다시 쓰지 않고 **필터 이전 전체 배열**을 센다
(`pipeline-progress.ts:52-56/122/128`, `116-120/142/149`). 그래서 샷 8개 중 6개가 예전에
완료된 프로젝트에서 무관한 샷 하나의 재생성을 누르면 그 순간 `6/8` 이 뜬다.
옵티미스틱 반영은 대상 1건만 `generating` 으로 바꾼다 — `director-store.ts:2135-2142`(그림),
`:2358-2364`(영상).

**같은 문제를 이미 인지한 흔적**: `artistImageWork` 수동 재생성 분기에만 `done: 0` 고정과
주석(`#feedback 2026-08-12`)이 붙어 있다(`pipeline-progress.ts:99-105`). 즉 한 자리는
고쳤고 세 자리는 안 고쳤다.

### 확인 못 한 것

형석이 관찰한 화면이 director 그림/영상 카드인지 writer 러프 카드인지는 메모에 없다.
세 자리 전부 같은 구조라 어느 쪽이든 재현되지만, **정확히 어느 화면이었는지는 미확인**.
`6/8` 의 8이 그 시점 실제 샷 수였는지도 코드로는 확인 불가(오너 관찰값).

### 다음 조치 — 오너/형석 판단 필요

수리 방향이 둘로 갈린다. **어느 쪽인지는 사람이 정해야 한다.**
- (가) 진행률을 "이번 재생성 묶음"으로 좁힌다 — 묶음 식별자를 새로 들고 다녀야 한다.
- (나) `artistImageWork` 처럼 `done: 0` 으로 고정한다 — 싸지만 진행 정보가 준다.
형석 메모의 나머지 요청(호버 시 작업 목록·카드 하이라이트·예상 종료 시각)은 (가)를 전제로 해야
의미가 생긴다 — 묶음을 알아야 목록도 예상 시각도 나온다.
