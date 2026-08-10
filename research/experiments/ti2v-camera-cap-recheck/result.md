# 결과 — TI2V 카메라 무빙 캡("둥둥") 재검증

> 2026-08-10 실행. 사전 등록: `HYPOTHESIS.md` (기각 조건 포함, 결과 열람 전 확정).
> 한 줄 평결: **가설 생존 — 둥둥(무동기 부유·워블)은 9클립 전체에서 0건.** 오히려 역방향 사실이 나왔다:
> **LOCKED static 계약이 3/3 위반됨** — 모델이 콘텐츠에 동기화된 무빙을 스스로 추가한다.

## 판정표 (블라인드 판독 → 언블라인드 대조)

판독자 3인, 라틴 스퀘어 배정(각자 샷 1개씩·티어 1개씩), 티어·계약문 완전 은닉. 1fps 프레임열 판독.

| 클립 | 발주 (계약문) | 블라인드 관측 | 이행 | 둥둥 |
|---|---|---|---|---|
| sh_04_16 T0 | LOCKED — zero movement | 러너 접근에 맞춰 전진·틸트업 + 해치로 급반경(whip/컷 불명) 후 정착 | **위반(대형)** | no |
| sh_04_16 T1 | tracking →screen right, moderate/medium | "fast lateral tracking to screen right, matched to the runner's pace … decelerates and comes to a complete stop" | **이행** (방향 정확) | no |
| sh_04_16 T2 | tracking →screen right, large/fast | "travels laterally screen-right at speed, tracking alongside the running subject … decelerates and settles" | **이행** | no |
| sh_01_02 T0 | LOCKED — zero movement | "slow, steady push-in … monotonic … no jitter" | **위반(소형 push-in)** | no |
| sh_01_02 T1 | dolly_in, moderate/slow | "slow, steady push-in toward the subject … no lateral or rotational swings" | **이행** | no |
| sh_01_02 T2 | dolly_in, large/medium | "continuous slow push-in … one-directional and steady" | **이행** (진폭은 과소 기미) | no |
| sh_02_05 T0 | LOCKED — zero movement | "very slow forward creep into the scene … small, monotonic" | **위반(소형)** | no |
| sh_02_05 T1 | pan →screen right, moderate/slow | "lateral travel/pan toward screen right (scene content flows left)" | **이행** (중의성 제거 문구까지 일치) | no |
| sh_02_05 T2 | pan →screen right, large/medium | "continuous sweep to screen right at near-constant speed … rotation-dominant pan" | **이행** | no |

- **기각 조건 대조**: "T1 3클립 중 ≥2 둥둥 → 기각" — 실제 T1 둥둥 **0/3** → 기각 안 됨, 가설 생존.
- **이행률**: T1 3/3, T2 3/3 — 타입·화면 기준 방향 모두 발주와 일치. motion-contract의 방향 중의성 제거 문구("content flows toward screen left")가 실제로 작동함이 블라인드 서술에서 재현됨.
- **T0 (LOCKED) 위반 3/3** — 전부 부유가 아니라 **콘텐츠에 동기화된 방향성 무빙**(러너 커버리지 대형 이동 / 발견 순간 push-in / 환경 전진 크립). 예측란에 미리 적어둔 세 번째 분기가 적중: 위험은 "무빙 명령 → 둥둥"이 아니라 "static 명령 → 모델이 어차피 동기화 무빙을 추가"였다.

## 해석

1. **캡의 원사유("무빙 명령이 둥둥을 만든다")는 현 스택(happy-horse + motion-contract)에서 재현 안 됨** — moderate는 물론 large까지 명령 무빙은 목적 있는 이동으로 이행된다.
2. 현행 static-기본 계약은 둥둥을 막는 장치가 아니라 **모델의 기본 성향(동기화 무빙)과 싸우는 계약**이고, 콘텐츠가 운동을 함의하는 샷에서 3/3으로 진다. 이는 previz-verifier가 기록한 "모션 확대" 계열·adherence START/END diff 문제와 정합 — 통제력 이슈는 무빙 개방이 아니라 **static 준수** 쪽에 있다.
3. G3(3D의 모션 previz 논거)에의 함의: "현 수요 1~5%"는 계약 압축 후 수요였다. 캡을 완화하면 분포가 달라질 수 있으므로 완화 배선 후 G3 재측정이 순서다.

## 한계 (정직 고지)

- 판독은 1fps 프레임열 — 프레임 사이 sub-second 워블은 이 방법으론 못 본다. (단 "집중을 흩뜨리는 둥둥"이 1초 스케일에서 안 보이면 시청 체감도 제한적이라는 게 판정의 전제.)
- n = 3샷 × 1모델(happy-horse). seedance/kling-o3/veo 일반화 불가 — 모델 교체 시 이 프로브 재실행.
- T0 위반은 전부 "콘텐츠가 운동을 함의하는 샷"에서 관측 — 정적 콘텐츠(대화 씬)에서 LOCKED가 지켜지는지는 이 실험 밖.
- framing_stability 4지선다는 설계 결함 — "연속 이동"과 "표류"를 한 라벨(continuous_drift)로 뭉쳐 변별 불능. 판정은 Q1 서술 + Q3 binary로만 사용했고 그 둘은 명확했다. 차기 실험에서 라벨 분리할 것.

## 좌표

- 모델: `alibaba/happy-horse/reference-to-video` 720p, duration 7/5/5s(샷 원값), START 단일 ref (END 핀 confound 제거 — 사전 등록).
- 프롬프트: 제품 `buildVideoPrompt`+`compileMotionContract` (복붙 없음). 요청 payload 전문·request_id: `provenance.json`.
- 클립: `assets/*.mp4` (9개). 블라인드 배정: 스크래치패드 `judges/blind-map.json` — judge1{A=04_16 T1, B=01_02 T0, C=02_05 T2} / judge2{A=04_16 T0, B=01_02 T2, C=02_05 T1} / judge3{A=04_16 T2, B=01_02 T1, C=02_05 T0}.
- 비용: ≈ $7 (51초 × ~$0.14/s).

## 결정 대기 (오너)

이 실험은 사실만 확정한다. 캡 완화는 코드 변경이므로 별도 결정:
1. `decoupage.ts:52-53` 비대칭 마찰 완화 여부 (static 기본 유지하되 "둥둥" 사유문 교체? motivated_move 마찰 제거?)
2. `v4_shots.ts` C1 예시 편향(magnitude minimal 단일)·D1 게이팅(3조합)·B1 동시 금지의 동반 수정 여부 — 캡만 풀고 예시 편향을 두면 분포가 안 움직일 가능성.
3. 완화 배선 후 G3 재측정 (뷰 경계 횡단 무빙 비율).
4. 역전 발견의 별도 트랙: static 준수 강화(정적 샷에서 모델의 자발 무빙 억제)는 adherence 쪽 과제로.
