# Writer / Narrative Structure — 연구 노트

> 세션 2026-07-21. 다음 세션에서 이어가기 위한 기록. writer 파이프라인의 **S1 narrativeStructure** 및 인접(scenes, depth, 모델 배치)에 대한 실측·수정.
> 원칙: 모든 발견은 실 run/실 API/DB로 검증됨(추측 아님). 재현 도구는 §5.

---

## 0. 한 줄 요약

이번 세션에 확인한 것:
1. **narrativeStructure는 "얇은" 저작 단계**다 — 출력이 작고(막 3~4개), depth로 복잡도를 거의 안 키운다.
2. **structure_type이 실전에서 3-act로 편향**돼 있었다(DB 35 run 전부 3-act). 원인 = 프롬프트 앵커("가장 일반적") + circular 설명 빈약.
3. **프롬프트를 고쳐서(s1_structure.ts) circular 사각지대를 풀었다** — loop→circular, 회귀 없음. (§3에 before/after)

---

## 1. narrativeStructure는 무엇을 하나 (맥락)

- **입력**: 유저 story(자유 텍스트) + genre(runtime/depth/format/tone…). 그것뿐.
- **출력(결과 A)**: `structure_type`, `acts[{act_id, purpose, proportion}]`, `pov`, `theme`, `central_dramatic_question`, `turning_point_position`. = "이야기의 모양"(추상). 장소·대사·컷 없음.
- **다음 단계(scenes)**가 이 결과를 **입력으로 받아** 씬 목록(구체)으로 펼친다. 상세: `docs/writer-narrativestructure-vs-scenes-example-2026-07-21.md`
- **분류(모델 배치용)**: narrativeStructure = 🔷저작(판단) · 🌳뿌리(하류 전체가 상속). scenes = 🔷저작 · 🌿가지. shotDesign = ⚙️수행 · 🍂잎. (전체 지도: `docs/writer-llm-model-strategy-2026-07-21.md`)
- **소비자**: narrativeStructure는 scenes 전용이 아니라 storyCheck·midPreview·actVisualArc·shotCheck까지 5곳이 읽는다.

---

## 2. 실측 발견

### 2a. structure_type 편향 (DB 감사, 35 run)
- **structure_type: 35/35 전부 `3-act`** — kishōtenketsu/hero's journey/non-linear/circular 5종 제시되지만 실전에선 한 번도 안 나옴.
- **depth: D3(15)·D2(10)·D4(9)만.** D1·D5~D7 없음(테스트 데이터가 단편 편중).
- **proportion: 80%가 표준 0.25/0.5/0.25.** 비표준 7건은 **전부 D2** (0.3/0.5/0.2 등). D3·D4는 예외 없이 25/50/25 고정.
- 감사 방법: `writer_runs.state->narrativeStructure` + `state->input->genre` 집계(§5).

### 2b. depth_level의 실효 (D1 vs D7 실측)
narrativeStructure에선 **depth 효과가 약하다**:
| | shorts D1 (15s) | feature D7 (6000s) |
|---|---|---|
| structure_type | 3-act | non-linear |
| **acts 수** | 3 | **3 (안 변함)** |

→ 100분 D7 서사극인데도 막이 3개. **narrativeStructure는 depth로 구조 복잡도(막 수·다층)를 거의 안 키운다.** depth의 진짜 레버는 **scenes의 `sceneCountHint`**(D1=1씬 … D7=30+씬)에 있음 — 아직 scenes로 검증 안 함(§4 열린 질문).
- 보조: `runtime_seconds`는 depth와 다른 노브 — scenes의 "총합 ≈ N초"(씬 길이 합). narrativeStructure 시스템프롬프트는 runtime 안 씀.

### 2c. structure_type 앵커 버그 → 진단 → 수정 ★
**진단**: 3-act 편향의 원인은 콘텐츠·맥락 부족이 아니라 **프롬프트 내부 결함**:
1. 앵커링 — `3-act: 가장 일반적` → 애매하거나 3-act로도 읽히는 케이스는 3-act 승.
2. 설명 비대칭 — 3-act/기승전결/non-linear는 설명 풍부한데 `circular: 순환 구조`는 4글자뿐 → 모델이 circular를 자신 있게 못 고름.

**진단 실험 (4 run, gemini-3-flash, 콘텐츠만 non-3-act로 격리):**
| 입력 | 콘텐츠 신호 | 결과 | 판정 |
|---|---|---|---|
| shorts (D1) | 선형 광고 | 3-act | ✓ 맞음 |
| feature (D7) | 플래시백 서사 | non-linear | ✓ 콘텐츠 승 |
| kishoten (D3) | 갈등 없는 대비 | kishōtenketsu (4막) | ✓ 콘텐츠 승 |
| loop (D3) | 명백한 타임루프 | **3-act** | ✗ circular 놓침 |

→ 모델은 능력 있음(기승전결·non-linear 잡음, 막 수도 맞춤). **circular처럼 "설명 빈약 + 3-act로도 읽히는" 구조만 앵커에 밀림.**

---

## 3. 수정 & 검증 (프로덕션 반영됨)

**`src/lib/writer/pipeline/stages/s1_structure.ts` 시스템프롬프트 3변경:**
1. **앵커 완화**: `3-act: 가장 일반적, 명확한 갈등-해소` → `3-act: 설정→대립→해소의 선형 인과. …할 때 (막 3개)` ("가장 일반적" 삭제).
2. **설명 균등화**: 5개 구조 전부 "무엇 + 언제 쓰나" 비슷한 분량. circular = `끝이 시작으로 돌아오거나 같은 국면이 반복되는 순환. 시간 루프·반복·데자뷔·수미상관이 핵심 장치일 때`.
3. **능동 판별 지시 추가**: `먼저 스토리의 형태를 판별하라: 선형 인과 / 갈등 없는 대비 / 성장 여정 / 시간 비선형 / 반복·순환. … 억지로 3-act에 끼워 맞추지 마라. acts 수는 고른 구조를 따른다.`

**검증 (before → after):**
| 입력 | 전 | 후 |
|---|---|---|
| loop | `3-act` ✗ | **`circular`** ✓ 고쳐짐 |
| shorts | `3-act` | `3-act` ✓ 회귀 없음 |
| kishoten | `kishōtenketsu` 4막 | `kishōtenketsu` 4막 ✓ 유지 |

→ **사각지대만 정확히 교정, 선형은 그대로.** s1 프롬프트를 검증하는 테스트 없음(export 계열은 픽스처만) = 회귀 위험 없음.

---

## 4. 열린 질문 / 다음 세션 이어갈 것

1. **scenes에서 depth 실효 검증** — `D1(1씬 기대) vs D7(30+씬 기대)`로 scenes를 돌려 `sceneCountHint`가 실제로 씬 수를 스케일하는지, `total_estimated_seconds`가 runtime에 근접하는지. (하네스 준비됨, 아직 안 돌림)
2. **narrativeStructure가 depth로 막 수/다층을 안 키우는 것** — 버그로 볼지, 의도로 볼지. D7 장편이 3막인 게 맞나? 고친다면 depth→act 복잡도 매핑을 프롬프트에 추가. (⚠ 후속 분석: 막 수는 형태의 소유물이라 depth→막 수 매핑은 축 혼합 재발 — `2026-07-21-structure-form-vs-scale-axes.md` §4)
3. **structure_type 수정의 프로덕션 영향 모니터링** — 실제 run에서 구조 다양성이 실제로 느는지(특히 순환·비선형 스토리). DB 재감사로 확인.
4. **모델 배치**: 품질 투자 1순위 = `decoupage`(🌳뿌리, 하류 84샷 물량 결정). Sonnet 4.6으로 A/B 해볼 것. (전략: model-strategy 문서 §4)
5. **narrativeStructure+scenes 병합 프로토타입** — 레이턴시 ~8s 절감 + 코헤런스 실험. 단 출력에 {structure, scenes} 둘 다 담아 5개 소비자 유지 필요.

---

## 5. 재현 도구

- **실험 하네스**: `tests/pipeline/writer_stage_experiment.test.ts`
  - 실 stage 함수(runNarrativeStructure/runScenes)를 직접 호출 → **시스템프롬프트 코드와 100% 동일**. gemini-3-flash 실 호출, 결과를 `logs/writer-stage-exp/`에 저장.
  - 실행: `RUN_WRITER_STAGE=1 WRITER_INPUT=<preset> WRITER_STAGES=narrativeStructure,scenes npx vitest run tests/pipeline/writer_stage_experiment.test.ts --disable-console-intercept`
  - 프리셋: `shorts`(15s·D1) `ad`(30s·D2) `feature`(6000s·D7) `kishoten`(기승전결 프로브) `loop`(순환 프로브). 모델 교차: `WRITER_PROVIDER=claude WRITER_MODEL=claude-sonnet-4-6`.
  - 프리셋 추가/stage 확장 = 파일 내 `PRESETS`/`STAGE_FNS`에.
- **DB 감사**: `writer_runs.state->narrativeStructure` + `state->input->genre` 를 supabase-js(service role)로 pull → structure_type/proportion/depth 집계. (스크립트는 throwaway로 지웠음 — 재작성 쉬움; 패턴은 `scripts/verify-db.mjs`.)

## 관련 문서 (이 세션 산출)
- `research/writer/narrative/2026-07-21-structure-form-vs-scale-axes.md` — (후속 토론) 구조유형=형태 vs 깊이레벨=규모 축 분석, 사다리 결함 3개, 수정 방향 + 프로브 2셀.
- `research/writer/doctrine/2026-07-21-writer-job-model.md` — (후속) writer 직무 모델 + 프롬프트 독트린 P1~P6 (원장/물리/관습 3진실).
- `research/writer/prompts/2026-07-21-writer-prompt-audit.md` — (후속) 12개 스테이지 시스템프롬프트 전수 감사 — 전역 결함 5 + 스테이지별 피드백 + 실험 백로그 E1~E13.
- `research/writer/experiments/2026-07-21-experiment-plan.md` — (후속) 감사 백로그의 실행 계획 승격 — W그룹(청소)/E그룹(A/B) 구분, Phase 1~4, 결과는 `experiments/results/`.
- `docs/writer-llm-model-strategy-2026-07-21.md` — gemini-3-flash 사용처 지도, 유형(저작/수행/검수)×파급(뿌리/가지) 분류, 모델 배치 제안, Haiku/Sonnet 벤치.
- `docs/writer-narrativestructure-vs-scenes-example-2026-07-21.md` — 실 프롬프트(verbatim)+결과, 유저입력→프롬프트→결과 흐름.
- `docs/writer-stage-length-experiment-2026-07-21.md` — 길이 양극화 실험 설계.
- `docs/shotdesign-model-bakeoff-2026-07-21.md` — shotDesign 프로바이더 속도·품질 벤치.
- 코드: `src/lib/writer/pipeline/stages/s1_structure.ts` (프롬프트 수정), `tests/pipeline/writer_stage_experiment.test.ts` (하네스).
