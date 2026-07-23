# 실험 INDEX — 유일한 상태판

> 트랙별 실험 목록·상태·한 줄 결론의 단일 진실원. 폴더·명명 규칙은 [`CONVENTIONS.md`](CONVENTIONS.md),
> 하네스 실행 런북은 [`README.md`](README.md), 첫 캠페인 회고는 [`campaign-2607/retrospective.md`](campaign-2607/retrospective.md).
> 상태·결론은 각 `result.md` 머리말과 [`campaign-2607/plan.md`](campaign-2607/plan.md) §4에서 그대로 옮긴 것이다(재해석 없음).
> 옛 E번호는 검색용 별칭으로만 남긴다.

## 1. 트랙별 실험

### foundation — 진단·청소·원장

| 실험 | 옛 이름 | 상태 | 한 줄 결론 |
|---|---|---|---|
| [ladder-probe](foundation/2026-07-21_ladder-probe/result.md) | E0a | ✅ | 꺾임 미확정 — 대체로 콘텐츠를 따라감, 재작성(E0b)은 보류 |
| [ledger-blocks](foundation/2026-07-21_ledger-blocks/result.md) | E1 | ✅ | 판정 완료 — **미채택** (16쌍·32run 바닥 효과, 게이트 제거. P1→보존 목록 재해석) |
| [db-audit](foundation/2026-07-21_db-audit/result.md) | D1 | ✅ | E4·E10 기각 판정 포함, C2 메타 희박이 E12b 강화 |
| [cleanup-regression](foundation/2026-07-21_cleanup-regression/result.md) | R1 (W1~W5) | ✅ | 통과 (악화 0) — W1~W5 워킹트리 적용됨 |

- E0b(사다리 재작성): ⏸ 보류 (E0a 기준 미충족) — 폴더 미생성.

### time-budget — 시간 예산

| 실험 | 옛 이름 | 상태 | 한 줄 결론 |
|---|---|---|---|
| [collapse-diagnosis](time-budget/2026-07-21_collapse-diagnosis/result.md) | E3a | ✅ | M2(씬 내부 산술) 붕괴 확정, M1(총 러닝타임) 가설은 기각 |
| [budget-injection](time-budget/2026-07-21_budget-injection/result.md) | E3b | ✅ | 채택 — 전 기준 통과, 교정 0회 발동 (P6 채택 확정) |

### validators — 검수기 존폐·결정론화

| 실험 | 옛 이름 | 상태 | 한 줄 결론 |
|---|---|---|---|
| [storycheck-redefine](validators/2026-07-21_storycheck-redefine/result.md) | E5 | ✅ | 재정의판 채택 (클리셰 감점 제거·differentiator 신설 — 오탐 0·검출력 4/4·10장르 일반화) |
| [shotcheck-deterministic](validators/2026-07-21_shotcheck-deterministic/result.md) | E12b | ✅ | 채택·구현 완료 (렌더 필드 동일·메타 소비처 0·2~4배 빠름 — Step1 제거+Step2 보정) |
| [facet-direct-emit](validators/2026-07-22_facet-direct-emit/result.md) | E12c | ✅ | 종결 — "직산출"이 이미 현행 구조로 판명, E12c-B 미실행 |

### visual-wiring — 비주얼 축 배선

| 실험 | 옛 이름 | 상태 | 한 줄 결론 |
|---|---|---|---|
| [midpreview-onoff](visual-wiring/2026-07-21_midpreview-onoff/result.md) | E6 | ✅ | 판정(07-22 저녁): 삭제 채택 — E6b 확인 후 탈락, 코드 제거 집행 |
| [midpreview-optimized](visual-wiring/2026-07-22_midpreview-optimized/result.md) | E6b | ✅ | 종결 — 불안정은 회복되나 이득 0 확인 (E6 삭제의 근거) |
| [act-arc-wiring](visual-wiring/2026-07-21_act-arc-wiring/result.md) | E8 | 🟠 | 판정(07-22): 기준 수립 후 재측정 — 실팔레트 체인 준수 확인 (→E8b) |
| [palette-conformance](visual-wiring/2026-07-22_palette-conformance/result.md) | E8b | 🟡 | 측정 완료 — 판정 대기 (이탈 0%, 단 지표 변별력 낮음 — 색온도 진행 2~5배 증폭·다양성 효과 소멸) |

### render-language — 렌더 문장 언어

| 실험 | 옛 이름 | 상태 | 한 줄 결론 |
|---|---|---|---|
| [ko-vs-en](render-language/2026-07-21_ko-vs-en/result.md) | E11 | ✅ | 판정(07-22 밤): 영어 정본 채택 — 생성 언어 영어 명시 고정 집행 |

### scene-shot-authoring — 장면↔샷 저작 구조

| 실험 | 옛 이름 | 상태 | 한 줄 결론 |
|---|---|---|---|
| [v3-absorb](scene-shot-authoring/2026-07-21_v3-absorb/result.md) | E9 | 🟠 | 판정(07-22): 방식 비교 재측정 — 씬 상세화+샷 집행 vs 씬·샷 근접 생성 (→E9b) |
| [detail-vs-cogen](scene-shot-authoring/2026-07-22_detail-vs-cogen/result.md) | E9b | 🟠 | 판정 보류 — 최우선 3지표 동률, A안 해석이 구상과 달라 E9c 재실험 |
| [model-tier](scene-shot-authoring/2026-07-22_model-tier/result.md) | E9c | 🟡 | 측정 완료 — 권고+판정 보류 (티어↑=연출 판단 밀도↑·씬 디테일↑, 카메라 무빙 양은 현행급이 더 과감·A'는 샷수 4/4 초과) |

### stage-merge — 구조+장면 병합

| 실험 | 옛 이름 | 상태 | 한 줄 결론 |
|---|---|---|---|
| [merge-approx](stage-merge/2026-07-21_merge-approx/result.md) | E13 | 🟠 | 판정(07-22): 조건부 진행 — 선행 3건 수행 후 재검증 (→E13b) |
| [merge-formal](stage-merge/2026-07-22_merge-formal/result.md) | E13b | 🟡 | 측정 완료 — 판정 대기 (사전 기준 4/4 통과: 접합부 0·오염 0·프로브 정답·⅓ 절감 유지 → **채택 상신**) |

### continuity-copy — 연출 연속성·레퍼런스 카피

> 트랙 안내판: [`continuity-copy/README.md`](continuity-copy/README.md). 옛 E9d(🟣 설계 중)에서 파생된 진행형 트랙.

| 실험 | 옛 이름 | 상태 | 한 줄 결론 |
|---|---|---|---|
| [laundromat-proto](continuity-copy/2026-07-23_laundromat-proto/result.md) | E9d-proto | ✅ | 제작 완료 (07-23) — 오너 평가: 클러스터 구조는 맞으나 연속감 미달·불필요 샷·카메라/시선 불안정 → E9d-copy로 전환 |
| [character-canon](continuity-copy/2026-07-23_character-canon/notes.md) | E9d-copy (캐릭터) | ✅ | 텍스트 후보 4종 폐기, 레퍼런스 정면 1장 정본 확정, 신원 전파 2컷 성공 |
| [input-format](continuity-copy/2026-07-23_input-format/conti.md) | E9d-copy (설계도) | 🟠 | 설계도 완성 — **오너 검토 대기** (07-23): 콘티(6샷 18.9초) + 방식 4종 설계도. 승인 시 생성 착수 |

## 2. 판정 대기 목록 (2026-07-23 기준)

- **E8b [palette-conformance](visual-wiring/2026-07-22_palette-conformance/result.md)** — v1 색·조명 배선 복원 vs 제거. 이탈 0% 기준 통과, 지표 변별력 낮음.
- **E13b [merge-formal](stage-merge/2026-07-22_merge-formal/result.md)** — S1+S3 병합 채택 상신 (사전 기준 4/4 통과).
- **입력 포맷 실험 [input-format](continuity-copy/2026-07-23_input-format/conti.md)** — 설계도 4종 + 콘티, 오너 검토 후 생성 착수.
- **E0c 모호 입력 의도파악 프로브** — 제안(카드만), 실행 여부 오너 판정 대기 (폴더 미생성).

(참고: E9c [model-tier](scene-shot-authoring/2026-07-22_model-tier/result.md)도 권고+판정 보류 상태.)

## 3. 개선 백로그 (I1~I8 — 실험 판정에서 파생된 제품 개선)

| # | 내용 | 출처 | 상태 |
|---|---|---|---|
| I1 | 씬 시간 ↔ 행동·샷 밀도 정합 — "320초 씬에 행동 3개" 류 불일치 해소 | E3a + 오너 판정(07-22) | ⬜ (E9b 지표와 연동) |
| I2 | 샷 길이 하한(2초) 검증 코드 없음 — 1~1.5초 샷이 통과됨 | R1 관찰① | ⬜ |
| I3 | 모션 문구 글자 수(50~80자) 이탈 ~33% — 검증+1회 재수정 코드로 잡아야 | R1 관찰② | ⬜ (I2와 같은 검증기에 얹기) |
| I4 | 렌더 문장 언어 무통제 — 언어 명시 지시는 E11 판정과 독립적으로 필요 | E11 부수 발견 | ⬜ (E11 영어 정본 채택으로 방향 확정) |
| I5 | 하네스 격리 실행 시 Supabase 등 무관 env 요구하는 모듈 로드 결합 정리 | E13/E6 각주 | ⬜ |
| I6 | C1 스토리 검수 재가동 검토 (현재 속도 문제로 꺼둠) — 절감 채택 시 그 예산으로 재검토 | 오너(07-22) + E5 | ⬜ |
| I7 | 장면 나누기 장소 정규화가 "식별자(표시명)" 괄호 통째 복사를 못 되돌리는 잠복 구멍 | E13b 발견 | ⬜ (E13b 채택 시 자연 해소) |
| I8 | 엄격 I2V(첫 프레임 고정) 배선 부재 — 배선된 영상 모델 3종 전부 reference-to-video | E9d-proto 오너 검수(07-23) | ⬜ (E9d-copy에서 엄격 I2V 검증 후 배선 후보 확정) |

## 4. 상태 이모지 범례

CONVENTIONS 규칙5의 표준 집합 + 캠페인이 쓴 전이 상태:

- ⬜ 설계/카드만 (아직 실행 안 함)
- 🔵 실행 중
- 🟡 측정 완료 · 판정 대기
- 🟠 조건 변경 후 재측정 (파생 실험으로 이어짐)
- 🟣 설계 중 (선행 해석 대기)
- ✅ 판정 완료 (채택·미채택·종결 포함 — 결론은 한 줄 결론 열 참조)
- ⏸ 보류
