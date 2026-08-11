# 가설 — 카메라 계약 완화 A/B ("고정 기본" → "내용이 요구하면 움직인다", 2026-08-11)

- **가설**: 카메라를 정적으로 누르는 주 압력은 decoupage의 A1 계약("camera_intent는 static이 기본")이다. 이 한 겹만 **내용 요구 기반**으로 바꾸면 ① 무빙이 늘고 ② 늘어난 무빙이 **모션을 요구하는 비트에 선택적으로** 붙으며(무분별 증가 아님) ③ 그 증가가 하류 v4까지 살아남는다.
- **전제**: 완화의 원사유였던 "둥둥"은 반증됨(1호 실험 0/9). 카메라 축은 6겹 독립 압력(A1·C1·D1·D3·B8·A5)이며 A1만 푸는 것은 **최소 개입 팔**이다 — 하류 5겹이 되돌리는지가 이 실험의 핵심 관측. 역사적 참고치 G3 = 뷰 경계 횡단 무빙 3~5%(Sample1 법정물, 다른 픽스처라 대조군 아님 — 대조군은 같은 픽스처로 이번에 직접 측정).
- **예측**: 참이면 — 완화군 motivated_move 샷 비율 ≥ 대조군 2배 · 모션 요구 비트 적중률 +20%p 이상 · 정적 비트 오발 증가 +10%p 이내 · v4 전파 손실 50% 미만. 거짓이면 — 비율 증가 미미(A1이 주범 아님) 또는 오발 폭증(무분별) 또는 v4에서 강등(5겹 잔존).
- **측정**: 픽스처 = `logs/064631aa-…/INTEGRATED.json`(17씬 재난물, 질주·도주·해일 등 모션 비트 포함) 고정. 양 팔 모두 **제품 `runDecoupage`** 실행(계약 문구만 env로 분기 — 복붙 금지), 팔당 3회. 전파 검증은 팔당 1회를 **제품 `runShotDesign`**까지 통과시켜 최종 `camera_motion.type/magnitude` 분포 측정. 타깃팅 판정 단위는 **비트**(scene_actions — 양 팔 공통 입력): 비트 텍스트만으로 눈가림 라벨링(모션 요구 有/無, 팔 정보 미제공) 후, 팔별로 (a) 모션 비트 중 이를 덮는 샷에 motivated_move가 붙은 비율=적중 (b) 정적 비트 중 붙은 비율=오발 산출. added 샷(source_beats=[])은 별도 집계. 부작용 감시로 샷 수·길이 분포 동반 기록.
- **기각 조건 (사전 등록 — 결과 본 뒤 수정 금지)**: ① 완화군 motivated_move 비율 < 대조군 1.5배 → "A1은 주 범인 아님, 동반 수정/타 층 조사" ② 정적 비트 오발률 증가 > +15%p → "무분별 완화 — 문구 재설계" ③ v4 최종 역동 비율 증가폭이 decoupage 증가폭의 절반 미만 → "하류 5겹 잔존 실증 — A1 단독 완화 불충분" ④ ①②③ 모두 비발동 + 적중률 상승 → **"A1 단독 완화 채택 권고"**.

완화 문구(고정 — 실행 전 확정, 사후 수정 금지):
```
== 카메라 규율 ==
- camera_intent는 기본값 없이 **이 샷의 내용이 요구하는가**로 정한다.
  · 피사체가 공간을 가로지르거나(질주·추격·퇴장·진입), 카메라가 무언가를 드러내야 하거나(발견·리빌),
    긴장이 물리적으로 조여야 할 때(push-in) → 'motivated_move'. 그 동기를 camera_move_motivation에 적는다.
  · 사건이 프레임 안에서 완결되는 샷(관조·대치·인서트·리액션) → 'static'.
- 금지되는 것은 무빙 자체가 아니라 **동기 없는 무빙**이다 — 내용과 무관하게 떠다니는 카메라를 쓰지 마라.
- 동기가 있으면 크기도 그 동기에 맞춰라: 질주를 최소 움직임으로 축소하지 마라.
```
(대조군 = 현행 문구 그대로: "camera_intent는 'static'이 기본… 이유 없는 카메라 무빙은 금지".)

좌표: 모델 축 V = `resolveModels(input)` 실행 로그 기록 · 동시성 4 · 비용 LLM only(영상 생성 없음) · 결과 = `results.json`(팔·회차별 원자료 + 비트 라벨 + 집계 + 기각 조건 대입) · 판정기 프롬프트 전문 results에 기록.

---

## 실행 좌표 (2026-08-11 실행 후 기입 — 위 사전 등록 내용은 무수정)

- 모델 축 V = `{"provider":"gemini","model":"gemini-3.6-flash"}` (fixture `input.models` 미지정 → `DEFAULT_MODELS.V`). decoupage temperature 0.7(제품값), 판정기 temperature 0.
- 픽스처: `logs/064631aa-f6b2-4f7c-800b-66b0517a2769/INTEGRATED.json` — 17씬 / 148비트. 씬 동시성 4.
- 계약 분기: `src/lib/writer/pipeline/stages/decoupage.ts` 의 `buildSystemInstruction()` 이 `WRITER_CAMERA_CONTRACT` 를 **호출 시점에** 읽는다. 미설정/기타 값 = 현행 문구(대조군 = 프로덕션).
- 팔 전환 방식: **팔마다 별도 자식 프로세스**(probe.mts 가 spawn, env 주입) — 모듈 캐시 공유 없음.
  systemInstruction sha256 = control `4f6391ddfdcaedc3…` / relaxed `1d3032a5aacf4fbf…` (각 패스의 실제 호출에서 관측).
  control 해시는 변경 전 HEAD 의 `SYSTEM_INSTRUCTION` 렌더 결과와 바이트 동일.
- 실행: `pnpm dlx tsx research/experiments/camera-contract-relax/probe.mts` (재집계 `--mode aggregate`, 사후 분석 `--mode supplementary`).
- LLM 호출 누계: decoupage 102콜(in 203,922 / out 186,026 토큰), shotDesign 56콜(in 214,289 / out 245,574 토큰), 429 재시도 0. 영상/이미지 생성 없음.
