# E0a — S1 깊이 사다리 프로브 결과

> 실행일: 2026-07-21 · 실행: 서브에이전트(Sonnet, 수행) / 셋업·판정: Claude(Fable) · 상태 판정: **❌ 꺾임 미확정 → E0b 보류**
> 모델: gemini/gemini-3-flash-preview · 원시 로그: `logs/writer-stage-exp/{kishoten-d2,loop-d1}__narrativeStructure__run{1..3}.json`
> 프리셋 추가 커밋: 워킹트리 (tests/pipeline/writer_stage_experiment.test.ts — `kishoten-d2`, `loop-d1`)

## 1. 가설·판정 기준 (사전 확정)

- 가설: 사다리의 형태 어휘(D2 "setup→action→result", D1 "구조 없음")가 저깊이×비선형 콘텐츠에서 형태 선택을 꺾는다.
- 판정 기준: 프리셋별 3 run 중 2+ 회 콘텐츠 형태를 놓치면 "꺾임 확정" → E0b 착수. 안 꺾이면 우선순위 하향.

## 2. 실행 내용

- kishoten-d2 (30s·D2·갈등 없는 대비) × 3, loop-d1 (15s·D1·퍼펙트 루프) × 3 — narrativeStructure만.

## 3. 측정 결과

| preset | run | structure_type | acts수 | proportions | duration_ms | 기대 일치 |
|---|---|---|---|---|---|---|
| kishoten-d2 | 1 | kishōtenketsu | 4 | 0.25/0.25/0.3/0.2 | 6518 | ✓ |
| kishoten-d2 | 2 | kishōtenketsu | 4 | 0.25/0.25/0.3/0.2 | 8595 | ✓ |
| kishoten-d2 | 3 | kishōtenketsu | 4 | 0.25/0.25/0.3/0.2 | 8590 | ✓ |
| loop-d1 | 1 | circular | 3 | 0.33/0.34/0.33 | 8375 | ✓ |
| loop-d1 | 2 | circular | 3 | 0.3/0.4/0.3 | 11553 | ✓ |
| loop-d1 | 3 | circular | 3 | 0.3/0.4/0.3 | 8822 | ✓ |

**6/6 기대 형태 일치. 실패·게이트 스킵 없음.**

## 4. 판정과 근거

- **판정: 꺾임 미확정** — 현행 프롬프트(능동 판별 지시 포함)에서 사다리는 structure_type 선택을 꺾지 못한다. D1 "구조 없음"조차 circular 선택을 막지 않았다.
- 축 분석 문서의 재해석("이미 터진 버그가 아니라 잠복 지뢰")이 프로브로 재확인됨. 능동 판별 지시가 사다리를 눌러 이기는 균형이 D1~D2에서도 유지된다.
- 예상과 달랐던 점: loop-d1이 3막(회차 구조)으로 나온 것은 합리적 — circular에 acts 수 규정이 없어 모델이 자유 판단. 문제 아님.

## 5. 후속 조치

- **E0b(사다리 재작성) ⏸ 보류** — 사전 기준대로 우선순위 하향. 사다리의 비형태 결함(D1 약속 vs 스키마 모순, D4~D7 서브플롯 dead letter, 모순 지시 동거)은 축 분석 문서에 잠복 결함으로 기록 유지 — 추후 W그룹성 정리나 모델 교체 시점에 재평가.
- 파생 질문: 이 균형은 모델 의존적일 수 있다(능동 판별 지시가 이기는 중일 뿐). **모델 bakeoff 때 같은 2셀을 교차 모델(Sonnet 등)로 재실행**하는 것이 저비용 검증 — bakeoff 체크리스트에 추가 권장.
- 계획서 상태 표 갱신: 완료.
