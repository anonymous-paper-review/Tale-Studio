# t1-dramaturgy-procedural-probe — 유도 폭 × 전제 유형 (법정물 실측)

- **날짜**: 2026-08-11 (밤 러너)
- **판정**: **가설 기각** — 법정물 3회 후보 수 3/3/3, 중앙값 3 ≤ 3 (사전 등록 기각 조건 발동).
  "유도 폭 = 전제 유형의 함수"는 성립하지 않음 — 유도 깊이 미결은 "전제 무관 수렴"으로 재프레임.
- **부수 중대 발견**: 현행 기본 모델(3.6-flash)에서 s0.5 스테이지 **전면 불능** — 아래 §모델 전환.
- **출처 티켓**: `research/backlog/t1-dramaturgy-procedural-probe.md` ← dramaturgy-world-derivation §3

## 실측

입력: 오너 원문 사슬 그대로(각색 없음) — "법정 공방이다 → 근데 20분이 넘는다 → 방산기업의 비리
얘기다 → 방산기업이 저지를 수 있는 비리가 뭐가 있지 → 거기서 필요한 무대가 뭐지", runtime 1260s.
장르 프레임(tone/depth_level)은 재난물 픽스처 상수 승계 — 전제 유형만 변주.

| 런 | 후보 수 | 후보 (원문 id) |
|---|---|---|
| legal-r1 (12.9s) | 3 | weapon_environmental_test_lab · subcontractor_logistics_warehouse · defense_procurement_safehouse |
| legal-r2 (15.7s) | 3 | environmental_test_lab · subcontractor_scrap_yard · military_intelligence_secure_room |
| legal-r3 (28.9s) | 3 | classified_test_range · substandard_parts_warehouse · old_officer_club |
| disaster-bridge (15.2s) | 3 | tide_observation_bunker · government_press_corridor · improvised_hilltop_camp |

후보 전문(description·derived_from·scene_potential 원문)은 `results.json` runs에 보존.

**계기 검산 2건** (수 수렴이 계기 탓이 아님을 확인):
- 코드 상한은 12 (`s0_dramaturgy.ts:139` "방어적 상한"), 3이 아님.
- 프롬프트가 "개수 쿼터 없음"을 명시 — 힌트 수렴 아님. 3은 진성 모델 행동.

## 관찰 (판정 밖 — 아침 참고)

수는 3으로 동일하지만 **유형 분산은 법정물이 훨씬 크다**: 재난물은 3회가 같은 삼각(관측/묵살/이후)으로
수렴했던 반면(원실측), 법정물은 회마다 다른 무대 세트(시험장/창고/안가 ↔ 시험소/고철장/보안실 ↔
사격장/부품창고/장교클럽)가 나온다. "전제 유형"의 효과는 폭(개수)이 아니라 **회차 간 다양성**에
나타나는 것일 수 있음 — 단 이는 이 티켓의 사전 등록 지표 밖(재프레임 재료로만 기록).

## 모델 전환 발견 (브리지의 답 — 극단형)

- 현행 기본 `gemini-3.6-flash`: s0.5 호출(webSearch:true + responseMimeType JSON)이 **결정론적으로
  빈 candidates**(finishReason=undefined) — 법정 3시도×제품 내부 재시도 + 브리지 1시도 전부 재현.
- `gemini-3-flash-preview` 핀: 즉시 정상(브리지 15.2s, 재난물 삼각 재현 — vault 원실측과 의미론 합치).
- **함의**: f6d8e58(기본 모델 전환) 이후 프로덕션에서 드라마투르그 스테이지가 죽어 있을 공산 —
  `runDramaturgySafe`가 실패를 흡수하므로("재료 없이 진행") 무신호. flash-ab 실험은 shotDesign
  (webSearch 없음)만 쟀기 때문에 이 조합이 미검증이었다.
- 본 실측 4런은 전부 preview 핀으로 실행 — 재난물 원실측과 **동일 모델**이라 오히려 브리지 불요의
  동일모델 비교가 성립(좌표 기록).

## 좌표

- 러너: `run.mts` (제품 runDramaturgy 직접 import, 복붙 없음) — `--only=`·`--model=` 진단 플래그 포함
- 모델: gemini-3-flash-preview (핀 사유 위 §) · temperature 0.7 · webSearch on (스테이지 고정값)
- 픽스처: 브리지 = `logs/064631aa…/INTEGRATED.json` (선례 dramaturgy-preview와 동일)
- 지출: LLM 콜 8회(실패 4 + 성공 4), ~$0.3 추정

## Q10(producer 무명 슬롯)에 주는 증거

"producer 시점 사고"(오너 법정 예시)를 스테이지에 넣어도 유도 폭이 자동으로 넓어지지 않는다 —
방향 A(producer 스테이지 신설)의 기대효과 중 "폭 확대"는 이 실측이 반증. 남는 논거는 폭이 아니라
원천 무명 해소(그건 별개 문제).
