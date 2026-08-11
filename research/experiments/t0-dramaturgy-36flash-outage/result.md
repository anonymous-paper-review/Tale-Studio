# f6d8e58 이후 드라마투르그 피해 감사 — 결과 (2026-08-11 낮, read-only)

**판정: "전면 불능"은 기전으로서 참 — 기각 조건(정상 산출 ≥1건) 불충족. 단, 실피해 0건.**

f6d8e58(기본 모델 3.6-flash 전환, 8/10 22:06 KST)부터 수리 핀 적용(8/11 ~10:37 KST)까지
약 12.5시간 동안 **프로덕션/풀 파이프라인 런이 아예 없었다** (DB writer_runs 0건, 로컬 logs/ 풀런 0건).
그 창 안에서 기본 모델로 드라마투르그 스테이지를 실행한 시도는 프로브 7시도가 전부이고,
**7시도 전부 무신호로 죽었다**(정상 산출 0건). 수리 핀 이후는 5/5 성공.
"전 런에서 죽어 있다"는 가설은 죽을 런 자체가 없어 실피해로는 실현되지 않았지만,
"이 창에서 돌았다면 반드시 죽었다"는 결정론은 반증 없이 확정됐다.

## 타임라인 (KST)

| 시각 | 사건 |
|---|---|
| 8/10 15:49 | DB 마지막 완료 런 `b7e67382` — 드라마투르그 **배선 전**이라 state에 키 자체 없음 (정상) |
| 8/10 16:56·17:08 | 로컬 풀런 2건(e4da245a·5260d92d)에서 드라마투르그 마지막 정상 산출 — 구 기본 preview |
| 8/10 18:29 | 789a71f — s0.5 드라마투르그 프로덕션 배선 |
| 8/10 22:06 | **f6d8e58 — 기본 모델 `gemini-3-flash-preview` → `gemini-3.6-flash`** |
| 8/10 밤~8/11 10:35 | 이 창의 유일한 실행 = 프로브 7시도, 전부 무신호 사망 |
| 8/11 ~10:37 | 수리 핀(GROUNDING_MODEL, 미커밋) 적용 → 이후 5/5 성공 |

## 런별 상태표 (전수)

**f6d8e58 이후 완료 런: 0건.** DB `writer_runs`에서 `created_at >= 2026-08-10T13:06:31Z` 조회 결과
0행(상태 불문 전체). 로컬 `logs/`에서도 이후 생성 디렉토리는 스테이지 단독 프로브 4개뿐, 풀런 없음.

전환 전 기준선(비교용) — DB 최근 5런은 전부 completed이나 **드라마투르그 배선(18:29) 전**이라
state에 dramaturgy 키 자체가 없음(피해 아님, 스테이지 부재):

| 런 | created_at (UTC) | status | dramaturgy |
|---|---|---|---|
| 1f700664 (DB) | 08-07 02:14 | completed | 키 없음 — 배선 전 |
| b2f35634 (DB) | 08-07 05:22 | completed | 키 없음 — 배선 전 |
| 09783bf8 (DB) | 08-07 07:32 | completed | 키 없음 — 배선 전 |
| 5e6577a1 (DB) | 08-07 08:33 | completed | 키 없음 — 배선 전 |
| b7e67382 (DB) | 08-10 06:49 | completed | 키 없음 — 배선 전 |
| e4da245a (로컬 풀런) | 08-10 07:56 | completed | **정상 산출** (17.0s, stage_candidates 3) |
| 5260d92d (로컬 풀런) | 08-10 08:08 | completed | **정상 산출** (12.9s, stage_candidates 3) |

전환 후 스테이지 단독 실행(제품 코드 경로, 로컬 프로브) — 시도 단위 전수:

| 프로브 런 | 기본 3.6-flash 시도 | 결과 | 핀 적용 후 시도 | 결과 |
|---|---|---|---|---|
| t1-…-legal-r1 | 4 (10:28–10:32 KST) | **4/4 무신호 사망** | 1 | 성공 (13s) |
| t1-…-disaster-bridge-r1 | 3 (10:33–10:35 KST) | **3/3 무신호 사망** | 2 | 성공 (15s·17.2s) |
| t1-…-legal-r2 / r3 | 0 | — | 각 1 | 성공 |
| **합계** | **7** | **죽음 7 / 정상 0** | **5** | **성공 5 / 실패 0** |

"무신호"의 실제 모습 — `_progress.jsonl`에는 `started`만 쌓이고 종료 마커가 없다
(실패 배지도, 에러도 없음). legal-r1 원문:

```
{"stage":"dramaturgy","status":"started","timestamp":"2026-08-11T01:28:12.519Z"}
{"stage":"dramaturgy","status":"started","timestamp":"2026-08-11T01:29:56.525Z"}
{"stage":"dramaturgy","status":"started","timestamp":"2026-08-11T01:30:54.392Z"}
{"stage":"dramaturgy","status":"started","timestamp":"2026-08-11T01:32:00.078Z"}
{"stage":"dramaturgy","status":"started","timestamp":"2026-08-11T01:40:09.459Z"}   ← 핀 적용 후
{"stage":"dramaturgy","status":"completed","timestamp":"2026-08-11T01:40:22.403Z","extra":{"stage_candidates":3,"cdq_candidates":2}}
```

클라이언트가 받는 유일한 신호는 gemini.ts의 방어 throw 한 줄이다:
`Gemini returned empty response (finishReason=undefined)` — 프로덕션에서는 s0.5만
runDramaturgySafe가 이걸 흡수해 `state.dramaturgy = null`("재료 없이 진행")로 남긴다.
전 로그 grep 결과 dramaturgy의 `failed`/`absorbed:true` 배지는 어디에도 없다 — 흡수가
실제로 발동한 적이 한 번도 없다는 뜻이다(죽은 7시도는 프로브 직호출이라 Safe 밖).

## webSearch:true 사용 스테이지 (grep 전수 — 전부 generateJson=JSON 강제 경유, 동일 조합)

| 스테이지 | 위치 | 실패 양상 (핀 없었다면) |
|---|---|---|
| s0.5 드라마투르그 | `src/lib/writer/pipeline/stages/s0_dramaturgy.ts:110` | Safe 흡수 → **무신호** (재료 없이 진행) |
| s1 구조 | `src/lib/writer/pipeline/stages/s1_structure.ts:80` | Safe 없음 → 재시도 소진 후 **런 하드 실패** |
| s3 씬 | `src/lib/writer/pipeline/stages/s3_scenes.ts:282` | 〃 |
| s1s3 병합 | `src/lib/writer/pipeline/stages/s1s3_merged.ts:166` | 〃 |

즉 전환 후 첫 풀런은 "조용히 재료만 잃는" 게 아니라 s1에서 시끄럽게 죽었을 것이다 —
무신호는 s0.5에 국한. 현행 수리 핀은 `geminiGenerate` 레벨(`opts.webSearch`면
`GROUNDING_MODEL='gemini-3-flash-preview'` 우선)이라 **4곳 모두 한 번에 보호**된다.

## 판정과 후속

- **기각 조건 심사**: "f6d8e58 이후 런에서 dramaturgy 정상 산출 ≥1건 → 기각" — 기본 모델(3.6-flash)
  정상 산출 0건(0/7)이라 **기각 불성립**. 핀 이후 성공 5건은 preview로 실행된 것이라 기각 증거 아님.
- **가설 지위**: 기전(결정론적 전면 불능)은 참. "전 런에서 죽어 있다"는 모집단 0으로 공허참 —
  프로덕션 피해 실런 0건. 운이 좋았던 것: 전환이 22:06 심야였고 다음 풀런 전에 밤 러너가 발견.
- **수리**: 이미 적용된 그라운딩 모델 핀(오너 지시, 8/11 오전)이 영향 반경 4곳 전부 커버 —
  별도 T-fix 티켓 불요. 남은 실행: **미커밋 gemini.ts 수리의 커밋** + Google 리그레션 해소 시 핀 제거.
- 향후 같은 과의 무신호 감사법: `writer_runs.state.dramaturgy === null` 이 흡수 발동의 DB 흔적이다
  (키 부재=배선 전, null=흡수됨, 객체=정상).

## 좌표 (기술 부록)

- 기준 커밋: f6d8e58 (2026-08-10 22:06:31 +0900) — `gemini.ts` 기본 `gemini-3-flash-preview` → `gemini-3.6-flash`
- 배선 커밋: 789a71f (2026-08-10 18:29:51 +0900) — s0.5 프로덕션 배선
- DB 조회: Supabase `writer_runs` SELECT (read-only, verify-db.mjs 패턴) — 컷오프 `2026-08-10T13:06:31Z`,
  이후 0행 / 직전 3일 5행. `llm_calls` 테이블은 빈 상태(577e2ef 이후 프로덕션 런 없음의 교차 증거).
- 로컬: `logs/t1-dramaturgy-probe-{legal-r1..r3, disaster-bridge-r1}/_progress.jsonl` (시도 단위 원장),
  `logs/{e4da245a…, 5260d92d…}/_progress.jsonl` (전환 전 마지막 정상 산출)
- 원인 확정 프로브: `probe-result.md` (같은 디렉토리 — REST 4조합×2모델 분리, 조합 그 자체가 원인)
- 실측 원본: `research/experiments/t1-dramaturgy-procedural-probe/{result.md, results.json}` §모델 전환 발견
- 수리 핀(미커밋): `src/lib/writer/llm/gemini.ts` `GROUNDING_MODEL` + 접지 미발화 console.warn
