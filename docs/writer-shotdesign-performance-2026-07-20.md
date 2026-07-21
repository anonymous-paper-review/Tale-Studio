# shotDesign 성능 분석 (writer 파이프라인 병목)

> 작성 2026-07-20. 분석 대상 = writer 파이프라인 `shotDesign` 스테이지(`src/lib/writer/pipeline/stages/v4_shots.ts`, step key `shotDesign`, UI 라벨 "Director가 샷들에 연출을 손보고 있습니다").
> WIP 리서치 문서 — 캐넌 아님. 구현 진실은 코드.

## 결론

**shotDesign은 writer 파이프라인의 단일 최대 병목이며, 모델 속도가 아니라 구조(순차 실행 × 대형 출력 × 샷 수) 때문에 느리다.**

## 근거 데이터 (실측)

프로젝트 "에일리언 2" (`2beb605c-3892-4fc2-b493-b76b5b071286`), status=completed, **전 단계 attempts=1**(재시도 0회, 완전 정상 실행). 출처 = `writer_runs.state._timings` 덤프(`logs/2beb605c-.../run-dump/performance.json`).

- 산출 규모: **씬 7 · 샷 84 · 로케이션 3 · 캐릭터 4** (평균 12샷/씬, 최대 21)
- 총 wall-clock 17분 10초(1030s), 순수 LLM 합계 646.7s

| 단계 | LLM 시간 | 비고 |
|---|---|---|
| **shotDesign** | **313.1s** | **전체 LLM의 48%, 단일 최대** |
| decoupage | 107.8s | shotDesign에 샷 수를 공급 |
| persistShots | 69.7s | |
| shotCheck | 55.4s | |
| sceneCinematography | 30.2s | |
| v2Design | 29.7s | |
| scenes | 20.1s | |
| narrativeStructure | 9.8s | |
| actVisualArc | 6.8s | |
| visualFormat | 4.1s | |
| renderPrompts | 3ms | |
| storyCheck / midPreview | ~1ms | skip |

## 원인 (세 요인이 곱해짐)

### 1. 완전 순차 실행 — 가장 큰 레버
- `runShotDesign`의 씬 루프(`for (const scene of scenes.scenes)`)와 청크 루프(씬 데쿠파주가 `SHOT_CHUNK_SIZE=8` 초과 시 분할) **둘 다 `await` 한 개씩** 처리.
- 이 run의 씬별 샷 분포 9/8/21/12/10/4/20 → chunk_size=8 기준 **총 14회 순차 LLM 호출 × 평균 22.4초 = 313초**.
- writer 파이프라인에서 `Promise.all` 동시성을 쓰는 스테이지는 **`v6_images`/`v7_videos`뿐**. shotDesign을 포함한 텍스트 LLM 스테이지(decoupage, sceneCinematography 등)는 전부 순차 — 네트워크 대기 동안 유휴.
- **fal 계정 동시성 제한(이미지·비디오용)과 무관.** Gemini 텍스트 호출이라 쿼터가 아니라 그냥 병렬화가 안 돼 있는 것.

### 2. 출력 토큰 바운드 — 콜당 시간이 안 줄어드는 이유
- 샷 1개 = 3분할 대형 JSON: `intent`(11필드) + `static_spec`(13필드, `first_frame_prompt` **315자 실측** 포함, framing/lighting/character_blocking/prop_placement) + `dynamic_spec`(8필드) ≈ **2.8KB/샷**.
- 8샷 청크 = ~22KB ≈ **5~7K 출력 토큰**. LLM 지연은 출력 토큰 순차 디코딩이 지배 → flash 모델이라도 **콜당 15~25초는 구조적으로 고정**.
- `first_frame_prompt`(스펙 200~400자)가 샷당 최대 비용 필드.

### 3. 샷 수가 전체를 선형 스케일
- 84샷/7씬(평균 12, 최대 21). chunk_size=8이라 20샷 씬 = 3콜.
- decoupage가 샷 수를 결정(그래서 decoupage도 108초). **긴 러닝타임일수록**(씬당 15~20샷) 콜 수가 선형 폭증.

### 부차 요인
- **프롬프트 캐싱 없음**: `src/lib/writer/llm/gemini.ts`에 `cachedContent` 미사용 → 고정 컨텍스트(genre·visualIdentity·worldVisual·costume)를 14번 재토큰화. 지연보다 낭비.
- **thinking 미설정**: `gemini-3-flash-preview`에 `thinkingConfig` 없음 → 기본 dynamic thinking이 켜져 있으면 콜마다 사고 토큰 소비(현 데이터로 측정 불가, 의심 요인).
- **serverless step 예산 초과**: 313초가 한 step 예산(240~300초)을 넘겨 부분 진행 체크포인트(`shotDesignPartial.doneSceneIds`)로 **2개 인보케이션에 걸침** → 콜드스타트/큐 오버헤드가 wall-clock에 추가(총 체이닝 오버헤드 383초 중 일부).

## 개선 레버 (임팩트 순, 미구현)

1. **씬/청크 동시성 도입** — `v6_images`의 `Promise.all`+풀 패턴 재사용. 14콜 → 동시성 4면 ~4웨이브 → **313초 → ~90초 기대**. 단, 씬 사이 체크포인트(`doneSceneIds`) 모델을 "배치 완료 후 체크포인트"로 재설계 필요. 나머지 파이프라인은 무변경. **가장 큰 효과.**
2. **출력 슬림화** — `first_frame_prompt`를 shotDesign에서 빼고 `renderPrompts`로 이연 또는 상한 축소, `static_spec` 필드 다이어트.
3. **고정 컨텍스트 프롬프트 캐싱** — 입력 비용 + 약간의 지연.
4. **thinking budget 명시적 축소** — 품질 트레이드오프 확인 필요.

병목은 명확히 **#1 순차 실행**.
