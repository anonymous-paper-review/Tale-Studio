# LLM 쿼터·수용량 + V축 산출물 수명 — 세션 기록

> 세션 2026-08-10. 다음 세션에서 이어가기 위한 기록.
> 원칙: 실측만 기록(추측 아님). 코드로 귀결된 것은 여기 없음 — diff/커밋 메시지가 기록.

## 0. 한 줄 요약

writer 1런의 실제 LLM 부하를 측정해 수용량을 확정했다: **동시 작업 유저 21~30명**(병목=Claude ITPM, 범인=shotCheck 단일 콜 165K), **하루 1,408건**(Gemini RPD), 그런데 **비용으로 보면 하루 33건**(월 $2,000 기준)이라 돈이 제일 먼저 바닥난다. 부수로 V축 산출물 수명을 추적해 **v1/v3/v5가 하류에 연결돼 있지 않음**을 확인했다.

## 1. 실측 발견 — 안 통한 시도 포함

### 1-1. 1런 부하 프로파일 (fixture: `logs/064631aa-f6b2-4f7c-800b-66b0517a2769`, 17씬 149샷, 로컬 완주)

| 축 | 콜 | 입력 tok | 출력 tok | peak RPM | peak in-TPM |
| --- | --- | --- | --- | --- | --- |
| gemini | 71 | 117,565 | 147,844 | 17 | 37,596 |
| claude | 1 | 165,223 | 0(실패) | 1 | 165,223 |

- 벽시계 534s. 스테이지별 상위: shotDesign 29콜(in 70.9k/out 106.3k), dialogue 18콜, decoupage 17콜, **shotCheck 1콜(in 165.2k)**.
- **peak RPM 17의 출처는 `SHOTDESIGN_CONCURRENCY` 기본값 4**(씬 4개 동시). env로 12까지 올라가며, 올리면 peak RPM이 비례해 뛰고 동시 수용 유저는 그만큼 준다 — 속도와 수용량이 정면 트레이드오프.
- 토큰은 chars/4 근사(이 런은 계기 부착 전). 계기 부착 후 런부터 실측값.

### 1-2. 확정된 한도

- **Gemini 3 Flash**: RPM 2,000 / TPM 3,000,000 / RPD 100,000 (AI Studio 대시보드 실측. 관측 최대는 27 / 115.1K / 579)
- **Claude Sonnet 4.6, Build tier**(구 Tier 2): RPM 5,000 / ITPM 5,000,000 / OTPM 1,000,000. 월 지출 상한 $1,000.
- 티어 이름이 Tier 1/2/3 → **Start / Build / Scale** 로 바뀌었다.
- Anthropic은 **캐시 읽은 토큰이 ITPM에 안 잡힌다**. 단 shotCheck 입력은 런마다 샷 JSON이 통째로 달라 캐시 이득이 거의 없다(공통은 system 프롬프트 ~2K뿐).

### 1-3. 프로파일 교차검증 (우연이 아님)

> 대시보드 관측 peak TPM 115.1K ÷ 1런 프로파일 37.6K = **3.06**
> → 정확히 3런 동시 실행된 순간이 있었다는 뜻. RPD 579 ÷ 71콜 = 하루 8런으로 개발 사용량과도 일치.

프로파일러가 뱉은 수가 대시보드와 맞물린다 — 수용량 계산의 분모로 신뢰 가능.

### 1-4. 수용량 (계산 결과)

```
동시 유저 K = min(RPM한도/17, TPM한도/37,596, ITPM한도/165,223)
  Gemini RPM 2,000 → 117명 | Gemini TPM 3M → 79명 | Claude ITPM 5M → 30명  ← 병목
  → 동시 30명(이론) / 21명(안전계수 0.7)
하루 건수 = Gemini RPD 100,000 / 71콜 = 1,408런
비용     = Gemini $1.29~1.51 + Claude $0.62 ≈ $1.9~2.1/런 → 월 $2,000이면 하루 33건
```

**병목 순서가 뒤집힌다: 비용(33건/일) ≪ 동시성(30명) < RPD(1,408건/일) < RPM(117명).**
단 이건 텍스트 파이프라인만이고, 실제 원가 대부분은 fal 이미지/영상(런당 수십 달러)이라 텍스트 $2는 반올림 오차다.

### 1-5. "병목"은 축마다 범인이 다르다 (혼동했던 지점)

| 병목 | 범인 | 근거 |
| --- | --- | --- |
| 동시성(쿼터) | shotCheck (Claude) | 1콜 입력 165K = ITPM 예산 독식. Gemini 71콜 전체(117K)보다 큼 |
| 비용 | shotDesign (Gemini) | 출력 106K tok, 출력 단가가 입력의 5~6배 |
| 시간 | shotDesign + shotCheck | 22s×29콜 + 150s |
| 일간 건수 | 전체 콜 수 71 | RPD 100K 나누기 |

→ **shotCheck 출력을 줄여도 동시성·비용은 거의 안 바뀐다**(출력 8.5K로 이미 작음). 동시성을 늘리려면 shotCheck **입력**을, 비용을 줄이려면 shotDesign **출력**을 건드려야 한다.

### 1-6. V축 산출물 수명 (하류 연결 추적)

| 단계 | DB | 파이프라인 내 소비 | 밖 재사용 |
| --- | --- | --- | --- |
| v0 VisualIdentity | design_tokens.l0/l1 | v1~v5 전부 | artist 시트·초안 하드게이트·룩 지문 |
| **v1 ActVisualArc** | 없음 | **v2 프롬프트 1곳뿐** | **없음** |
| v2 Design | design_tokens + assets | v3·v4·v5·c2 | artist 시트/월드 프롬프트/프리뷰 |
| **v3 SceneCinematography** | 없음 | decoupage·v4 | **없음** |
| decoupage | beat_summary→표시문 | v4·dialogue·c2 | 프리뷰 스토리 라인 |
| v4 ShotDesign | shots + state 원본 | c2→shotSequence | 러프보드·모션계약·어드히어런스·shot-configs |
| **v5 RenderPrompts** | 없음(state만) | **없음** | **export prompts.md만** |

- **v5는 프로덕션에서 하류 미연결**: v6/v7이 `logger.loadStage('14_v5_renderPrompts.json')`(파일 캐시)에서 읽는데 로거는 `fsDisabled = Boolean(process.env.VERCEL)`로 no-op → 항상 null → 400. `persistShotsToDb`는 renderPrompts를 안 보고 shotSequence에서 직접 만든다. renderPrompts를 소비하는 `adaptShots()`는 **호출처 0(죽은 코드)**.
- 실측 런의 v5 `extraction_summary`: `t2i_extracted 149 / t2i_llm_generated 0` — **LLM 0회**, v4 문장 그대로 재포장.
- v1은 `runV2Design(..., actVisualArc: ActVisualArc | null, ...)`로 null 허용이라 끊어도 graceful.

### 1-7. 큐 오해 정정

- `generation_jobs`는 **fal 이미지/영상 전용 상태 원장**(kind: character_view / world_shot / shot_video / shot_rough_storyboard / shot_previz_video). **LLM 호출은 한 줄도 안 들어간다.** 게다가 큐가 아니라 이미 submit한 뒤의 추적표 — 실제 대기열은 fal이 갖고 우리는 발사 속도를 조절하지 않는다.
- 유일한 쿼터 장치 `countUserQueuedJobs`(유저별 in-flight 상한 + 30분 신선도 컷)도 **이미지/영상 한정**.
- `writer_runs`는 큐가 아니라 스텝 체크포인트 저장소(status + state JSONB + CAS 버전).
- **결론: LLM 총량을 재거나 동시 실행을 막는 지점이 코드에 없다.** `/api/writer/start`에 게이트 없음. 방어는 `withLlmRetry` 사후 백오프 하나.

### 1-8. 안 통한 것 (참고 — 이번 세션 이전 실측)

- **shotCheck fan-out(씬 단위 분할)**: 벽시계 +70%(153.6→261.3s), 이슈 3배(연속성 7.5배 인플레이션). 프롬프트를 안 바꿔도 **컨텍스트를 자르면 모델 판정 분포가 변한다**. `WRITER_SHOTCHECK_FANOUT` 게이트로 남아 있고 기본 off.
  → 동시성을 위해 입력을 줄일 때 **씬 단위로 자르는 방식은 이미 기각됐다**. 샷당 전달 필드를 줄이는 방향이어야 한다.

## 2. 결정 — 코드로 귀결 안 된 것만

### D-2026-08-10-a: 수용량 단위는 "동시 런 K"로 재고, 유저 수는 환산해서 쓴다

- 상황: "유저 n명당 토큰"으로 재려 했으나 Gemini 한도는 **API 키가 아니라 프로젝트 단위**라 유저별 배분 개념이 없다.
- 결정: 1차 지표를 **동시 런 K = min(한도/1런 peak)** 로 두고, 유저 수는 리틀의 법칙 `K = λ×W`로 환산(W=런 지속). 프로파일러가 K를 직접 출력한다.
- 기각한 대안: 유저별 토큰 쿼터 — 프로젝트 단위 한도라 의미 없고, 유저 1명이 런 1개를 돌리는 동안 소비량이 균일하지 않다.
- 감수하는 것: W가 로컬 실측(534s)이라 서버리스(step 분할)에선 과대추정. 프로덕션 `[writer timing]` 집계로 갱신해야 한다.

### D-2026-08-10-b: 쿼터 에러(429)를 과부하(503)와 분리해 관측한다

- 상황: `withLlmRetry`가 429/503을 한 덩어리(transient)로 처리하고 메시지를 120자로 잘라, **어느 한도(RPM/TPM/RPD)에 걸렸는지 알 수 없었다.**
- 결정: `isQuotaLlmError`로 분리 + 히트 카운터 + 쿼터 에러 본문 800자 보존. 재시도 동작 자체는 그대로(둘 다 백오프).
- 기각한 대안: 429에 다른 백오프 곡선 — 실측 없이 곡선을 바꿀 근거가 없다.
- 감수하는 것: 카운터는 프로세스 수명이라 서버리스 인스턴스 경계를 넘지 못한다(스테이지 로그로만 관측).

## 3. 미결

- **질문: `gemini-3-flash-preview`가 대시보드의 `Gemini 3 Flash` 버킷과 같은 한도인가?** 대시보드에 preview 별도 행이 없고, 문서엔 "preview는 더 제한적"이라고만 쓰여 있다.
  — 닫히는 조건: 첫 429 발생 시 로그에 남는 quota metric 문자열(이제 800자 보존)로 버킷 이름 확인.
- **질문: S/V축을 Flash-Lite 계열로 내리면 품질이 버티는가?** 한도가 3~5배(RPM 10K/TPM 10M/RPD 350K), 단가가 3~18배 싸다. 축별 모델 교체는 `PipelineInput.models`로 이미 가능.
  — 닫히는 조건: 같은 fixture로 S축·V축 각각 Lite 교체 A/B, 산출물 스키마 위반율과 이슈 수 비교.
- **질문: v1/v3/v5를 유지할 근거가 있는가?** v5는 프로덕션 하류 미연결, v1·v3는 다음 단계 프롬프트에만 쓰이고 DB/UI/export 어디에도 안 남는다. v5는 스텝 1개(체크포인트+DB쓰기+step 왕복)를 LLM 0콜로 소비한다.
  — 닫히는 조건: v6/v7을 DB 기반으로 재배선할지 결정되면 v5의 존폐가 자동으로 결정된다.
- 잔가지: `shotCheck` 단일 콜이 실측 런에서 실패(`054_shotCheck_validate_FAILED`)했고 코드가 흡수해 "분할 없이 진행"했다. 단일 콜이라 **1회 실패 = 149샷 검증 전부 소실**. fan-out을 못 켜는 상황에서 이 취약성을 어떻게 다룰지 미정.
