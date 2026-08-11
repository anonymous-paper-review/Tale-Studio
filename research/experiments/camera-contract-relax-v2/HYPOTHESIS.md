# 가설 — 카메라 계약 v2 선택성 A/B (2026-08-11)

- **가설**: 피사체의 움직임과 카메라의 움직임을 분리하는 명시적 경계(고정 프레임 안의 손발·시선·한두 걸음·감정·급함은 static)를 추가하면 v1의 모션 적중 상승을 유지하면서 정적 비트 오발을 줄인다.
- **전제**: v1은 motivated_move 14.93%→34.07%(2.28배), 모션 비트 적중률 32.70%→66.07%, v4 역동 비율 18.4%→34.9%를 만들었다. 순수 정적 오발도 5.33%→17.73%(+12.4%p)였으므로 merged 오염만 제거해서는 충분하지 않다.
- **예측**: 참이면 v2는 대조군 대비 motivated_move 1.5배 이상, 모션 적중률 +20%p 이상, 전체 정적 오발 증가 +15%p 이하(보조 목표: 순수 오발 +10%p 이하), v4 전파 손실 50% 미만을 보인다.
- **측정**: 동일한 17씬·148비트 fixture, 동일 모델·temperature·동시성으로 control/v2를 각 3회 실행한다. 기존 눈가림 beat label을 고정 재사용하고, decoupage 6패스와 arm별 shotDesign 1회를 제품 함수로 실행한다. 전체 오발과 함께 순수 오발·motion+static merged 오염을 분리 기록한다.
- **기각 조건**: motivated_move가 control의 1.5배 미만이거나, 모션 적중률 상승이 +20%p 미만이거나, 전체 정적 오발 증가가 +15%p 초과하거나, v4 역동 비율 증가폭이 decoupage 증가폭의 절반 미만이면 v2를 채택하지 않는다. 모든 조건을 통과해야 제품 승격 후보로 남긴다.

## 실행 좌표

- 제품 함수: `runDecoupage`, `runShotDesign`, `buildSystemInstruction`, `resolveModels`
- fixture: `logs/064631aa-f6b2-4f7c-800b-66b0517a2769/INTEGRATED.json`
- 모델: `gemini-3.6-flash`, decoupage temperature `0.7`, scene concurrency `4`
- control: `WRITER_CAMERA_CONTRACT` 미설정
- treatment: `WRITER_CAMERA_CONTRACT=relaxed-v2`
- beat label: 기존 `camera-contract-relax/raw/beat_labels.json`을 복사해 고정
- 비용: 영상 생성 없음, LLM 텍스트 실험
