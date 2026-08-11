# t0-c2-mounting-dist — v3 mounting 예시 편향 실측

- **날짜**: 2026-08-11 (밤 러너)
- **판정**: **가설 기각** — 기각 조건 발동 (handheld 계열 32% < 60%)
- **출처 티켓**: `research/backlog/t0-c2-mounting-dist.md` ← prompt-contract-audit §3 재검증② (카탈로그 C2❌)

## 가설과 결과

가설은 "v3 mounting 단일 예시(`"camera_mounting": "handheld"`, v3_scene_plan.ts:149 — enum 5종 미열거)가
실분포를 handheld 계열로 수렴시킨다"였다. 예측은 handheld 계열 점유 ≥80%, 기각 조건은 <60%.

**실측: 로컬 완료 3런 50씬에서 handheld는 16씬(32%)에 불과하다.** 오히려 예시에 없는
tripod가 22씬(44%)으로 최다이고, "사용 경로 부재"로 의심되던 steadicam도 10씬(20%) 실사용됐다.

| mounting | 064631aa (17씬) | 5260d92d (18씬) | e4da245a (15씬) | 합계 (50씬) | 점유 |
|---|---|---|---|---|---|
| tripod | 8 | 10 | 4 | **22** | 44% |
| handheld | 5 | 5 | 6 | **16** | 32% |
| steadicam | 3 | 3 | 4 | **10** | 20% |
| gimbal | 1 | 0 | 1 | **2** | 4% |
| mixed | 0 | 0 | 0 | **0** | 0% |

enum 5종(`tripod|handheld|gimbal|steadicam|mixed`, types/pipeline.ts:475) 중 4종이 실사용 —
단일 예시가 분포를 누른다는 증거는 없다. 유일한 미사용 값은 mixed.

## 실제 값 원문 (씬 순서대로, mounting:energy)

- **064631aa** (17씬): tripod:static, handheld:breathing, tripod:static, steadicam:breathing, handheld:breathing, tripod:static, handheld:breathing, handheld:kinetic, steadicam:breathing, handheld:kinetic, tripod:static, tripod:static, tripod:static, tripod:static, gimbal:breathing, tripod:static, steadicam:breathing
- **5260d92d** (18씬): tripod:static, handheld:breathing, tripod:static, tripod:static, steadicam:breathing, handheld:kinetic, tripod:static, tripod:static, steadicam:kinetic, tripod:static, handheld:kinetic, tripod:static, tripod:kinetic, handheld:breathing, tripod:static, steadicam:breathing, handheld:kinetic, tripod:static
- **e4da245a** (15씬): handheld:breathing, handheld:breathing, steadicam:breathing, tripod:static, steadicam:breathing, handheld:kinetic, steadicam:breathing, tripod:static, gimbal:breathing, handheld:kinetic, steadicam:breathing, tripod:static, handheld:breathing, handheld:breathing, tripod:static

## D1 연쇄 해석 메모 (판정 불포함 — 티켓 규정)

mounting×energy 쌍은 D1 게이팅(3조합)이 예상시키는 조합에 상당히 정렬돼 있다:
tripod↔static(22쌍 중 21), handheld/steadicam/gimbal↔breathing·kinetic(전부).
예외는 tripod:kinetic 1건(5260d92d scene_13). 즉 mounting 분포의 실질 결정자는
C2 예시가 아니라 **energy축과의 결합(D1)**일 공산이 크다 — 단 이는 해석이며 이 티켓의 판정 밖.

## 교차 검증 (NA)

v4 산출(11_v4_shotDesign.json)의 오브젝트 키에는 mounting 파생 필드가 없다(camera_angle/camera_motion만).
shots 교차는 **NA** (판정 3원칙 — 불확실은 추측하지 않는다).

## 좌표

- 소스: `logs/{064631aa-f6b2-4f7c-800b-66b0517a2769, 5260d92d-2e7b-4991-8bff-00213b37ef77, e4da245a-8d89-44e5-8fde-131d016ef2e3}/10_v3_sceneCinematography.json` → `scene_plans[].camera_mounting`
- v3 스테이지 모델: 3런 모두 `gemini-3-flash-preview` (debug/llm_calls/00X_sceneCinematography_gemini.json에서 확인)
- 집계: jq 코드 집계만, LLM 판정 없음.

## Q2(캡 완화)에 주는 함의

C2(예시 편향)는 이 축에서 **반증**됐다 — "예시 하나가 분포를 누른다"가 mounting에선 성립 안 함.
Q2의 동반 수정 범위 논거에서 C2를 빼도 된다는 증거. 단 C1(카메라 magnitude)·C3(transition)는 별도 실측(t0-c3 참조).
