# 가설 — writer decoupage 실패 원인 (run 5c5d0c96, 2026-08-06)

- **가설**: run 5c5d0c96 의 decoupage 실패는 레이트리밋(429)이 아니라 "씬당 LLM 호출 지연 × 17씬 순차 실행(중간 저장 없음)"이 인보케이션 수명(~300s)을 구조적으로 초과해서다.
- **전제**: 실패 run 의 state 에 decoupage 입력 전체가 보존돼 있다(live DB 실측 2026-08-06: scenes 17개·genre·characters·worldVisual·sceneCinematography 존재, `_attempt {stage: decoupage, count: 3}`, error_detail.calls 비어 있음). withLlmRetry 는 transient 시 console.warn 만 남긴다.
- **예측**: 참이면 — transient 경고 없이도 씬 1개 처리에 ≥18s(=300s/17) 안팎, ×17이 300s 를 초과. 거짓이면 — 씬당 수 초 수준(합산이 예산 내)이거나 대량 transient(429) 경고가 관측된다.
- **측정**: 실패 run 의 state 를 입력 fixture 로 고정하고, 제품 함수 `runDecoupage` 를 씬 1개짜리 scenes 로 2회(scene 0·1) 호출해 wall-clock 과 transient 경고 유무를 기록.
- **기각 조건**: 씬당 평균 < 10s (17씬 합산 < 170s, 예산 내) 이면 시간-볼륨 가설 기각 — 429 스톰 등 다른 원인 조사로 전환. (사전 등록: 결과 본 후 수정 금지)

좌표: project `3ed26543-6640-4864-9958-02d1fc733cb7` / run `5c5d0c96-64d9-45d1-b3ca-00e502271422` / 모델 축 = `resolveModels(state.input).V` (실행 시 콘솔에 기록됨)
