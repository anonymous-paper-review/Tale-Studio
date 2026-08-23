# r1-writer-v2-dynamic-spec-shape — writer-v2 연출값이 영상 모션 계약을 깨뜨리던 것 수리

- status: `superseded`  # 오너가 다른 세션에서 직접 수정하기로 결정
- source: `_INBOX.md` snapshot `751c326ecb3d456facf594118ca278688dd12e0f3dfce4d90c6466957327f6b5` (오너 메모 "v1,v2 writer 및 우리 워크플로우로
  돌렸을때 퀄리티 차이가 존재하는데 뭐가문제인지 모름") + 기존 티켓
  `t0-higgsfield-vs-pipeline-quality-gap.md` 확정 사실 7번
- run: `night-2026-08-18-b3d63b8d6e5342b6a76bfdead586277e` · contract `86d3be3fdcb41ea6`
- operation_key: `r1-v2-dynspec-shape-v1`
- 작업 사본: `.claude/worktrees/night-0818-v2dynspec` · 브랜치 `night/2026-08-18-v2-dynamic-spec`
- 기준 커밋: `36cedb67b6c4a6434b9727a7807f69ed351667e3` · 결과 커밋: `18cf72d`
- 허용 경로: `src/lib/writer/v2/persist.ts`, `src/lib/director/motion-contract.ts`,
  `src/lib/writer/motion-vocabulary.ts`, `tests/v2-dynamic-spec-shape.test.ts`
  (금지 목록 `.env*`·비밀·운영 스키마·마이그레이션 해당 없음)

## interpretation

8/17 조사 티켓이 "v2 dynamic_spec 정규화 수리는 별도 티켓으로 분리 가능 (코드 확정 버그)"로
남겨둔 항목이다. 오너 메모의 "v1/v2 품질 차이"와 같은 자리를 가리키므로 먼저 잡았다.
품질의 좋고 나쁨은 판정하지 않는다 — **영상 발주 경로가 실제로 끊기는가**만 봤다.

## 선기입 수용 기준 (실행 전 기록)

1. 결함을 재현하는 테스트가 수리 전 **실패**하고 수리 후 **통과**한다.
2. 라이브 DB에서 이 모양을 가진 행 수를 세어 실재를 확인한다 (읽기 전용).
3. `pnpm test` 가 수리 때문에 새로 깨지는 항목이 **0건**이다.
4. `tsc --noEmit` 이 수리 때문에 새로 내는 오류가 **0건**이다.
5. 유료 생성 발주 **0건**, 운영 데이터 쓰기 **0건**.
6. 자가 머지하지 않는다.

## 결과 카드

- 판정: **pass** — 수용 기준 6항목 전부 충족
- created_at: 2026-08-18T02:52Z · estimated_review_min: 5 · reviewed_min: — · carryover_min: —
- merge_mode: `human` (레벨 1 강제) · merge_decision: — (오너 판정 대기)
- judgment_key: `v2-contract-shape-violation` · judgment_version: 1
- 지출: $0 (유료 생성 0건, DB 읽기 전용 조회 1회)

### 무엇이 고장나 있었나

writer-v2 는 카메라·인물 연출을 **자유 문장 하나**로 저장한다
(`src/lib/writer/v2/semantic-unit.ts:18-19`, `z.string()`). 그런데 영상 발주 직전에 모션
계약문을 만드는 `compileMotionContract` 는 **객체와 배열**을 기대한다
(`src/lib/writer/types/pipeline.ts:665-684`). 예전 persist 는 문장을 그대로 넣었다
(`src/lib/writer/v2/persist.ts:122-126`, 수리 전).

그래서 두 가지가 동시에 났다.

1. `character_motion` 이 문자열이라 `.forEach` 가 없다 → **TypeError**.
   재현 로그: `TypeError: (dyn.character_motion ?? []).forEach is not a function`
   (`src/lib/director/motion-contract.ts:120`). 이 예외는 영상 발주 라우트에서 감싸지지
   않는다 — `generate-video/route.ts:467-483` 의 try/catch 는 **폴백 조회만** 감싸고,
   `shot.dynamic_spec` 을 직접 쓰는 경로와 `buildVideoPrompt` 호출은 바깥이다.
2. `camera_motion` 이 문자열이면 `raw?.type` 이 undefined 라 조용히 `static` 으로 접힌다
   (`motion-vocabulary.ts:334-335`, 수리 전). 계약문이 "LOCKED tripod — zero camera
   movement" 로 나가는데 같은 프롬프트 뒤에 붙는 장면 묘사문은 "Dynamic handheld tracking
   shot" 이다. **한 프롬프트 안에서 정면으로 모순된 지시가 나간다.**

### 실재 확인 (라이브 DB, 읽기 전용)

`shots` 전수 1893행 중:

| 모양 | 행 수 |
|---|---|
| `dynamic_spec` 없음 | 871 |
| 계약을 지킨 객체/배열 | 1014 |
| **문자열 (깨진 모양)** | **8** |

8행 전부 한 프로젝트(`090042eb-4d4d-4cdb-bbea-5d7686aa9b7f`)의 `writer-v2:` design_ref 이고
생성 시각은 2026-08-17T11:33Z — 오너가 메모를 쓴 바로 그날이다.
감사 스크립트: `research/experiments/night-2026-08-18-v2-dynamic-spec/audit-dynspec.mjs`

### 무엇을 고쳤나

- **근본** (`src/lib/writer/v2/persist.ts`): 문장을 버리지 않고 정본 어휘로 번역해 계약 모양으로
  저장한다. `normalizeCameraMotion` 의 토큰 판별이 "Dynamic handheld tracking shot." 에서
  `tracking` 을 집어낸다. 인물 지목은 등장인물이 정확히 한 명일 때만 한다 — 여럿이면 누구의
  동작인지 코드가 알 수 없어서 비워 둔다.
- **방어** (`motion-contract.ts`, `motion-vocabulary.ts`): 이미 저장된 8행이 죽지 않도록
  소비처가 문자열도 받는다. 근본만 고치면 새 행은 멀쩡해도 기존 8행은 계속 터진다.

### 검증 (명령과 결과)

| 명령 | 결과 |
|---|---|
| `npx vitest run tests/v2-dynamic-spec-shape.test.ts` (수리 전) | **2 failed** — TypeError 재현 |
| `npx vitest run tests/v2-dynamic-spec-shape.test.ts` (수리 후) | **2 passed** |
| `pnpm test` (작업 사본) | 1261 passed · 1 failed · 29 skipped |
| `npx tsc --noEmit` | 수리로 인한 새 오류 0건 |
| `npx eslint` (변경 4파일) | 0건 |

**정직 보고 — 실패 3건의 정체.** 전부 이 수리와 무관하다.
`tests/fal-image-size.test.ts` 1건은 **main 에서도 똑같이 실패**한다(기준선 대조 실행함).
나머지 2건은 파일 부재로 수집 단계에서 죽은 것이며 둘 다 git 에 없는 파일이라 작업 사본에만
없다 — `tests/rough-crop-battery.manual.test.ts`(`research/experiments/sheet-formats/corpus`),
`tests/seed-test-accounts.test.ts`(`scripts/seed-test-accounts.mjs`).

### 확인 못 한 것

- 이 수리가 **영상 품질을 좋게 만드는지는 판정하지 않았다**. 밤은 그림·영상을 판정하지 않는다
  (계약 §9). 확인한 것은 "발주 경로가 예외로 끊기던 것이 끊기지 않는다"까지다.
- 기존 8행은 **고치지 않았다**. 운영 데이터 쓰기는 비가역 행동이라 밤의 hard-stop 이다(§7.1).
  방어 코드로 살려서 읽을 뿐이고, 행 자체를 계약 모양으로 옮기려면 오너의 명시적 후속 작업이
  필요하다.
- 오너가 겪은 v1/v2 격차가 **이것 하나로 설명되는지는 미확인**. 이건 확정된 결함 하나일 뿐,
  격차의 유일한 원인이라는 근거는 없다.

### 다음 조치

- 사람 머지 검토: `git -C .claude/worktrees/night-0818-v2dynspec log -1 -p`
- 오너 선택 필요: 기존 8행을 마이그레이션할지, 방어 코드로만 둘지.
