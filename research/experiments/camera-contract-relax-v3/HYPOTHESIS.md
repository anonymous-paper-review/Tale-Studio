# 가설 — 카메라 계약 v3 중간 경계 A/B (2026-08-11)

- **가설**: v2의 정적 예외는 유지하되, 사건이 공간을 가로질러 진행되거나 범위·규모·힘을 보여줘야 하는 경우를 다시 명시하면 v2의 오발 억제를 유지하면서 필요한 무빙을 회복한다.
- **전제**: v2는 정적 오발을 9.23%→5.67%(−3.56%p)로 줄였지만 motivated_move 15.73%→19.47%(1.24배), 모션 적중률 +15.47%p에 그쳐 과잉 억제됐다. v1은 반대로 무빙 2.28배·적중 +33.37%p였지만 정적 오발이 +15.96%p 늘었다.
- **예측**: 참이면 v3는 대조군 대비 motivated_move 1.5배 이상, 모션 적중률 +20%p 이상, 전체 정적 오발 증가 +15%p 이하, v4 전파 손실 50% 미만을 보인다. v2의 순수 오발 감소 방향도 유지되는지 보조 지표로 확인한다.
- **측정**: 동일한 17씬·148비트 fixture, 동일 모델·temperature·동시성으로 control/v3를 각 3회 실행한다. 기존 눈가림 beat label을 고정 재사용하고, decoupage 6패스와 arm별 shotDesign 1회를 제품 함수로 실행한다. 전체 오발과 순수 오발·motion+static merged 오염을 함께 기록한다.
- **기각 조건**: motivated_move가 control의 1.5배 미만이거나, 모션 적중률 상승이 +20%p 미만이거나, 전체 정적 오발 증가가 +15%p 초과하거나, v4 역동 비율 증가폭이 decoupage 증가폭의 절반 미만이면 v3를 채택하지 않는다. 네 조건을 모두 통과해야 제품 승격 후보로 남긴다.

## 실행 좌표

- 제품 함수: `runDecoupage`, `runShotDesign`, `buildSystemInstruction`, `resolveModels`
- fixture: `logs/064631aa-f6b2-4f7c-800b-66b0517a2769/INTEGRATED.json`
- 모델: `gemini-3.6-flash`, decoupage temperature `0.7`, scene concurrency `4`
- control: `WRITER_CAMERA_CONTRACT` 미설정
- treatment: `WRITER_CAMERA_CONTRACT=relaxed-v3`
- beat label: `camera-contract-relax/raw/beat_labels.json`을 복사해 고정
- 비용: 영상 생성 없음, LLM 텍스트 실험
