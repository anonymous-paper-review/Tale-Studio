# Pipeline 모식도: svc-pipeline + dual-axis 통합 시각화

> 작성일: 2026-04-20
> 대상: 현재 구현된 두 실험 파이프라인의 구조/상태/차이
> 근거 코드: `experiment/svc-pipeline/`, `experiment/dual-axis/`

---

## 0. 이 문서의 목적

기존 `dev/writer_advencement/` 아래의 모식도는 **이론 레이어(L0-L1, L1-L2-L3, S2-S3)** 용이었다. 실제 구현체의 **실행 흐름, 상태 전이, 피드백 경로**를 담은 도식은 없었다. 이 문서는 세 가지를 제공:

1. **svc-pipeline** — 자동 원샷 오케스트레이터의 내부 플로우
2. **dual-axis** — 세션 기반 상태 머신 + Lock Policy + 4개 피드백
3. **두 구현체 비교** — 같은 S/V 이론에서 파생된 두 UX

---

# PART 1: svc-pipeline 전체 플로우

## 1.1 최상위 아키텍처

```
┌────────────────────────────────────────────────────────────────┐
│                      CLIENT (어떤 UI든)                         │
└───────────────────────┬────────────────────────────────────────┘
                        │ POST /api/pipeline
                        │ { story, runtime_hint?, ... }
                        ▼
┌────────────────────────────────────────────────────────────────┐
│           app/api/pipeline/route.ts                             │
│           runtime: 'nodejs',  maxDuration: 600                  │
└───────────────────────┬────────────────────────────────────────┘
                        │ runPipeline(input)
                        ▼
┌────────────────────────────────────────────────────────────────┐
│           lib/pipeline/index.ts ── runPipeline()                │
│                                                                 │
│  ┌──────────────────── 전역 초기화 ─────────────────────┐      │
│  │ resetGeminiCallCount()                               │      │
│  │ resetClaudeCallCount()                               │      │
│  │ resetRawSeq()              ← raw LLM 시퀀스 리셋     │      │
│  │ projectId = makeProjectId()                          │      │
│  │ logger = new PipelineLogger(projectId)               │      │
│  │ logger.saveText('00_input_story.md', ...)            │      │
│  └──────────────────────────────────────────────────────┘      │
│                           │                                     │
│                           ▼                                     │
│  ┌────────────────── try/finally 경계 ────────────────┐        │
│  │  _runPipelineInner(...) 호출                       │        │
│  │   ├─ 성공 → result 반환 + saveIntegrated           │        │
│  │   └─ 실패 → flushRawLlm('ERROR') + markStage       │        │
│  │            'PIPELINE' failed + throw               │        │
│  └────────────────────────────────────────────────────┘        │
└───────────────────────┬────────────────────────────────────────┘
                        │ PipelineResult (JSON)
                        ▼
                  NextResponse.json(result)
```

## 1.2 내부 파이프라인 시퀀스

```
_runPipelineInner() 내부:

  INPUT(story)
      │
      ▼
 ┌─────────────┐
 │  S축 (Story) │
 └─────────────┘
      │
      ├──► S0 ── runS0(input, logger) ─────────── Gemini ──► S0 JSON
      │         (장르/톤/타겟/포맷)                          (+ flush 'S0')
      │
      ├──► S1 ── runS1(input, S0, logger) ─────── Gemini ──► S1 JSON
      │         (기승전결/러닝타임 배분)                      (+ flush 'S1')
      │
      ├──► S2 ── runS2(input, S0, S1, logger) ─── Gemini ──► S2 JSON
      │         (캐릭터 카드)                                (+ flush 'S2')
      │
      └──► S3 ── runS3(input, S0, S1, S2, logger) Gemini ──► S3 JSON
                (씬 리스트)                                  (+ flush 'S3')
      │
      ▼
 ┌─────────────────────────┐
 │  C축 검증 ①              │
 └─────────────────────────┘
      │
      └──► c_validation_1 ── Claude ──► validation report
                                        (+ flush 'C1_validation')
      │
      ▼
 ┌─────────────────────────┐
 │  Mid Preview             │
 └─────────────────────────┘
      │
      └──► mid_preview ── Gemini ──► V 방향 사전 제안
                                     (+ flush 'mid_preview')
      │
      ▼
 ┌─────────────┐
 │  V축 (Visual)│
 └─────────────┘
      │
      ├──► L0+L1 ── runL0L1(S0, mid_preview, logger) ── Gemini ──► L0, L1
      │         (매체/렌더 + 시각 스타일)                          (+ flush 'L0_L1')
      │
      ├──► L2  ── runL2(S2, S3, L1, mid_preview, logger) Gemini ──► L2
      │         (로케이션/의상/컬러팔레트/VFX)                     (+ flush 'L2')
      │
      └──► L3  ── runL3(S0, S2, S3, L1, L2, logger) ── Gemini ──► shots + budget_issues
                  (샷 리스트 + 카메라)                             (+ flush 'L3')
      │
      ▼
 ┌─────────────────────────┐
 │  C축 적용 ②              │
 └─────────────────────────┘
      │
      └──► c_application_2 ── Claude ──► shotSequence + report
                                         (+ flush 'C2_application')
      │
      ▼
  OUTPUT {
    project_id, input,
    S0, S1, S2, S3,
    c_validation_1, mid_preview,
    L0, L1, L2, L3,
    c_validation_2,
    shot_sequence,
    metadata { started_at, completed_at, total_duration_ms, llm_calls }
  }
      │
      ▼
  logger.saveIntegrated(result)
  logger.markStage('PIPELINE', 'completed', ...)
```

## 1.3 LLM 호출 모델 분담

```
┌────────────────┬──────────────────────────────────┐
│   GEMINI       │          CLAUDE                  │
│ (gemini-2.5-   │        (claude-sonnet-4-6)       │
│  flash)        │                                  │
├────────────────┼──────────────────────────────────┤
│ 생성(Generation)│          검증(Validation)         │
├────────────────┼──────────────────────────────────┤
│ S0 genre        │ C1 validation (S0-S3 일관성)    │
│ S1 structure    │ C2 application (최종 샷 검증/보정)│
│ S2 characters   │                                  │
│ S3 scenes       │                                  │
│ Mid Preview     │                                  │
│ L0/L1 visual    │                                  │
│ L2 design       │                                  │
│ L3 shots        │                                  │
└────────────────┴──────────────────────────────────┘

→ Gemini = 창작(다양성, 속도)
→ Claude = 검증(엄격성, 구조 준수)
```

## 1.4 로깅/에러 경계

```
각 stage 완료 직후 → logger.flushRawLlm('<stage>') 호출
  │
  └─ raw_collector 모듈에 쌓인 input/output 배열을
     파일로 덤프 + 배열 초기화

전체 파이프라인을 try/finally로 감쌈:
  ┌─────────────────────────────────────────┐
  │ try {                                   │
  │   return await _runPipelineInner(...)   │
  │ } catch (e) {                           │
  │   await logger.flushRawLlm('ERROR')     │ ← 에러 시에도 raw 덤프
  │   await logger.markStage(               │
  │     'PIPELINE', 'failed',               │
  │     { error: e.message }                │
  │   )                                     │
  │   throw e                               │
  │ }                                       │
  └─────────────────────────────────────────┘

→ 어느 stage에서 죽든 raw prompt/response 파일로 남음
→ 디버깅 가능성 보장
```

## 1.5 출력 로그 구조

```
logs/<YYYY-MM-DD>_<project_id>/
│
├── 00_input_story.md           ← 사용자 입력
├── 01_s0_genre.json            ← S0 결과
├── 02_s1_structure.json
├── 03_s2_characters.json
├── 04_s3_scenes.json
├── 05_c_validation_1.json
├── 06_mid_preview.json
├── 07_l0_l1_visual.json
├── 08_l2_design.json
├── 09_l3_shots.json
├── 10_c_validation_2.json
├── 11_integrated.json          ← 최종 result
├── 12_shot_sequence.json       ← 샷 시퀀스만 분리
├── STORY.md                    ← (수동 생성) 읽기 편한 서사
├── raw_llm/
│   ├── 01_S0/
│   │   ├── 001_gemini_input.txt
│   │   └── 001_gemini_output.json
│   ├── 02_S1/...
│   └── ERROR/                  ← 실패 시
└── stage_log.jsonl             ← 타임라인
```

---

# PART 2: dual-axis 상태 머신

## 2.1 Phase 전이 다이어그램

```
                      ┌───────────┐
                      │  preset   │   ← 선택적: 8개 장르 프리셋 적용
                      └─────┬─────┘     (library.ts)
                            │
                            ▼
     ┌──────────────────────────────────────────────────┐
     │                  S축 선형 진행                     │
     │                                                  │
     │  S0 ──► S1 ──► S2 ──► S3                         │
     │   │      │      │      │                         │
     │   └──────┴──────┴──────┴─► forward_hints[]      │
     │    (각 단계 완료마다 V 영향 예고)                 │
     └──────────────────────────────────────────────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │  mid_preview      │  ◄──── S↔V 양방향 협상 체크포인트
                  │                   │
                  │  user_choice:     │        v_recommendations 제안
                  │   accept_v        │        사용자 선택:
                  │   modify_v        │         ● accept_v        → L0_L1
                  │   other_v_suggestion        ● modify_v        → L0_L1
                  │   modify_s        │         ● other_v_suggestion → 재제안
                  │   reference_input │         ● modify_s        → S2/S3 복귀
                  └─────────┬─────────┘         ● reference_input → 재생성
                            │
                 ┌──────────┴──────────┐
                 │                     │
          accept_v,modify_v,          modify_s (S 복귀)
          reference_input
                 │                     │
                 ▼                     ▼
     ┌──────────────────────┐   ┌─────────────┐
     │    V축 선형 진행      │   │ S2 or S3로  │
     │                      │   │  되돌아감    │
     │  L0_L1 ──► L2 ──► L3 │   └─────────────┘
     │    │                 │
     │    │  Back Adjust:   │
     │    │  V 작업 중      │
     │    └─► S2/S3 재수정   │
     └──────────────────────┘
                 │
                 ▼
     ┌──────────────────────┐
     │   shot_sequence      │  ◄── 모든 씬 L3 완료 시 자동 전이
     └──────────────────────┘
                 │
                 ▼
     ┌──────────────────────┐
     │     completed        │
     └──────────────────────┘
```

## 2.2 Lock Policy 매트릭스

`computeLocks(phase: Phase): LockState` — 각 phase에서 필드별 잠금 상태.

```
     ┌────────────┬────┬────┬────┬────┬────┬────┬────┬────┐
     │  Phase     │ S0 │ S1 │ S2 │ S3 │ L0 │ L1 │ L2 │ L3 │
     ├────────────┼────┼────┼────┼────┼────┼────┼────┼────┤
     │ preset     │  ●  │  ●  │  ●  │  ●  │  ●  │  ●  │  ●  │  ●  │  ← 전면 Open
     │ S0         │  ●  │  ●  │  ●  │  ●  │  ●  │  ●  │  ●  │  ●  │
     │ S1         │  ◼  │  ●  │  ●  │  ●  │  ●  │  ●  │  ●  │  ●  │
     │ S2         │  ◼  │  ◼  │  ●  │  ●  │  ●  │  ●  │  ●  │  ●  │
     │ S3         │  ◼  │  ◼  │  ◼  │  ●  │  ●  │  ●  │  ●  │  ●  │
     │ mid_preview│  ◼  │  ◼  │  ●  │  ●  │  ●  │  ●  │  ●  │  ●  │  ← S↔V 협상
     │ L0_L1      │  ◼  │  ◼  │  ●  │  ●  │  ●  │  ●  │  ◼  │  ◼  │  ← Back Adjust S2/S3
     │ L2         │  ◼  │  ◼  │  ◼  │  ●  │  ◼  │  ◼  │  ●  │  ◼  │  ← Back Adjust S3만
     │ L3         │  ◼  │  ◼  │  ◼  │  ●  │  ◼  │  ◼  │  ◼  │  ●  │  ← Back Adjust S3만
     │shot_sequence│ ◼  │  ◼  │  ◼  │  ◼  │  ◼  │  ◼  │  ◼  │  ◼  │  ← 전면 잠금
     │ completed  │  ◼  │  ◼  │  ◼  │  ◼  │  ◼  │  ◼  │  ◼  │  ◼  │
     └────────────┴────┴────┴────┴────┴────┴────┴────┴────┘

     범례: ● = 수정 가능 (unlocked)
           ◼ = 잠김 (locked — 수정 시 403 에러)
```

### 원칙: "위로는 못 올라간다 (Can't go up)"

```
시간 축 (phase 진행 →)

  preset → S0 → S1 → S2 → S3 → mid_preview → L0_L1 → L2 → L3 → shot_sequence
    │      │    │    │    │       │            │      │    │         │
    │      │    │    │    │       │            │      │    │         │
    └──────┴────┴────┴────┴───────┴────────────┴──────┴────┴─────────┘
     어느 시점이든, 현재보다 ── 상위 필드는 잠김 ──
                           ── 현재/하위 필드만 변경 가능 ──

예: L0_L1 phase 중
    ├─ S0 수정 불가 (403)
    ├─ S1 수정 불가 (403)
    ├─ S2 수정 가능 (Back Adjust)  ← 단, L3 무효화 경고
    ├─ S3 수정 가능 (Back Adjust)
    ├─ L0 수정 가능 (현 단계)
    ├─ L1 수정 가능 (현 단계)
    ├─ L2 수정 불가 (아직 미생성 — 다음 단계)
    └─ L3 수정 불가
```

## 2.3 4개 피드백 메커니즘

```
              ┌───────────────────────────────────────┐
              │         4 FEEDBACK MECHANISMS         │
              └───────────────────────────────────────┘
                             │
      ┌──────────────────────┼──────────────────────┐
      │                      │                      │
      ▼                      ▼                      ▼
 ┌────────┐          ┌─────────────┐         ┌──────────────┐
 │ PRESET │          │ FORWARD     │         │ MID PREVIEW  │
 │        │          │   HINT      │         │              │
 └────────┘          └─────────────┘         └──────────────┘
  preset phase        S0-S3 각 단계 후       mid_preview phase
      │                     │                       │
      │                     │                       │
  GenrePreset ──►        S 결정 직후             S3 완료 후
  (library.ts)           forwardHintSx()          generateMidPreview()
                         호출 → V 영향 예고        → v_recommendations
                                                   user_choice 5개:
  L0/L1 defaults         forward_hints[] 축적      ● accept_v
  S0 defaults                                      ● modify_v
  L3_recipe                                        ● other_v_suggestion
                                                   ● modify_s
                                                   ● reference_input

                                                   ▼
                                               ┌──────────────┐
                                               │  BACK ADJUST │
                                               └──────────────┘
                                               L0_L1, L2, L3 phase
                                                     │
                                             V 작업 중
                                             "S2/S3 수정 요청" API
                                                     │
                                             Lock 검증:
                                             ● target이 locked면 403
                                             ● unlocked면 재생성 + invalidate
                                                     │
                                             invalidated[] 기록
                                             back_adjusts[] 축적
```

### 메커니즘별 트리거/효과/기록 위치

```
┌────────────┬──────────────┬──────────────────┬───────────────────┐
│  메커니즘   │ 트리거         │ 효과              │ SessionState 기록 │
├────────────┼──────────────┼──────────────────┼───────────────────┤
│ Preset     │ 세션 생성 시   │ S0+L0+L1 default │ preset_id         │
│ Fwd Hint   │ Sx phase 후   │ V 영향 예고       │ forward_hints[]   │
│ Mid Preview│ S3 완료 후    │ V 방향 대안 제안   │ mid_preview       │
│ Back Adjust│ V 작업 중     │ 하위 S 재생성      │ back_adjusts[]    │
└────────────┴──────────────┴──────────────────┴───────────────────┘
```

## 2.4 API 엔드포인트 ↔ 기능 매핑

```
┌───────────────────────────────────────────────────────────────────┐
│           app/api/session/                                         │
└───────────────────────────────────────────────────────────────────┘
                              │
  ┌───────────────────────────┼──────────────────────────┐
  │                           │                          │
  ▼                           ▼                          ▼
POST /new              [id]/route.ts            [id]/phase/route.ts
  │                           │                          │
  │ createNewSession          │ GET state                │ POST phase 실행
  │ (story, runtimeSeconds,   │                          │ (S0..L3 각각)
  │  presetId)                │                          │
  │                           │                          │ 전이 완료 시
  │ → project_id 발급         │                          │ current_phase
  │ → SessionStore 초기화     │                          │ 자동 진행
  │ → initial state 저장      │                          │
  ▼                           ▼                          ▼
            [id]/mid-decision/route.ts      [id]/back-adjust/route.ts
                     │                                    │
                     │ POST user choice                   │ POST target=S2|S3
                     │ (accept_v / modify_v /             │     adjustment_note
                     │  other_v_suggestion /              │
                     │  modify_s / reference_input)       │
                     │                                    │ Lock 검증
                     │ choice별 분기 처리                  │ → target locked?
                     │  → 해당 phase 전이                  │     YES: 403
                     │  → v_recommendations 갱신           │     NO: 재생성
                     │                                    │ → hierarchy
                     ▼                                    │   invalidate
                 state 저장 + raw flush                    ▼
                                                     state 저장 + raw flush
```

## 2.5 세션 파일 구조

```
logs/<project_id>/
│
├── state.json                  ← SessionState 전체 (매 요청마다 갱신)
├── stage_log.jsonl             ← phase 전이 이력
├── raw_llm/
│   ├── preset/...              ← 각 phase/decision별 raw
│   ├── S0/...
│   ├── S1/...
│   ├── ...
│   ├── mid_decision_accept_v/...
│   ├── back_adjust_S2/...
│   └── ERROR_<phase>/...       ← 실패 시
└── back_adjust_history.json    ← (선택) 별도 백업
```

---

# PART 3: 두 구현체 비교

## 3.1 구조 대조

```
┌──────────────────┬─────────────────────┬─────────────────────────┐
│       축         │   svc-pipeline      │      dual-axis          │
├──────────────────┼─────────────────────┼─────────────────────────┤
│ 실행 모델         │ 원샷 함수 호출       │ 세션 기반 상태 머신      │
│ API 엔드포인트    │ 1개 (POST /pipeline)│ 5개 (new/phase/mid/back)│
│ 상태 저장         │ 휘발 (메모리)        │ 파일 영구 (state.json)   │
│ 중단/재시작       │ 불가 (처음부터)      │ phase 단위 가능          │
│ 사용자 개입       │ 없음 (무개입)        │ Mid Preview + Back Adjust│
│ 잠금/검증         │ 없음 (단방향)        │ computeLocks (필드별)    │
│ LLM 모델          │ Gemini + Claude     │ Gemini (+ Claude 검증)    │
│ Phase 개수        │ 11개 (선형, 자동)    │ 11개 (전이 가능)         │
│ 실패 복구         │ 전체 재실행          │ 특정 phase 재시작        │
│ UX 타겟           │ 자동화/벤치마크      │ 협상/인터랙티브          │
│ 입력              │ story 문자열 1개     │ + preset + runtimeSec   │
│ 출력              │ integrated.json 1개  │ 상태 지속 + 최종 shot   │
│ 개발 상태         │ 1시간 스토리 성공     │ 기본 플로우 완성         │
└──────────────────┴─────────────────────┴─────────────────────────┘
```

## 3.2 흐름 비교 (side-by-side)

```
 svc-pipeline                     dual-axis
 ═══════════════                  ═══════════════

 POST /api/pipeline               POST /api/session/new
     │                                 │
     │  story 입력                     │  story + preset 입력
     │                                 │
     ▼                                 ▼
 resetGemini/Claude/RawSeq        createNewSession()
     │                                 │
     │                                 │  initial state 파일 저장
     ▼                                 ▼
 ┌───────────────┐                ┌───────────────┐
 │ S0            │                │ POST /phase   │ ← 클라이언트 제어
 │ ↓ flush       │                │  {phase:'S0'} │
 │ S1            │                │ 실행 → save   │
 │ ↓ flush       │                │               │
 │ S2            │                │ POST /phase   │
 │ ↓ flush       │                │  {phase:'S1'} │
 │ S3            │                │ ...           │
 │ ↓ flush       │                │               │
 │ C1 validation │                │ POST /phase   │
 │ ↓ flush       │                │  {phase:'S3'} │
 │ mid_preview   │                │ 완료 → state  │
 │ ↓ flush       │                │  current_phase│
 │ L0+L1         │                │  = mid_preview│
 │ ↓ flush       │                │               │
 │ L2            │                │ ⏸ STOP        │ ← 사용자 결정 대기
 │ ↓ flush       │                │               │
 │ L3            │                │ POST /mid-    │
 │ ↓ flush       │                │  decision     │
 │ C2 application│                │ { choice: ... }│
 │ ↓ flush       │                │               │
 └───────────────┘                │ accept_v:     │
     │                             │  → L0_L1 전이 │
     │                             │ modify_s:     │
     │                             │  → S2/S3 복귀 │
     │                             │ (other: 재제안)│
     ▼                             │               │
 saveIntegrated                   │ POST /phase   │
 markStage completed              │  {phase:'L0_L1'}
     │                             │ 실행 → save   │
     │                             │               │
     ▼                             │ 필요 시 POST  │
 NextResponse.json(result)        │  /back-adjust │ ← 중간 수정
                                   │ {target:'S2',│
                                   │  note: ...} │
                                   │               │
                                   │ POST /phase   │
                                   │  {phase:'L2'} │
                                   │ ...           │
                                   │               │
                                   │ POST /phase   │
                                   │  {phase:'L3'} │
                                   │  완료 →       │
                                   │  shot_sequence│
                                   │  자동 전이    │
                                   └───────────────┘
```

## 3.3 Mid Preview 처리 차이

```
 svc-pipeline:                    dual-axis:
 ═════════════                    ═════════════

 runMidPreview() 호출              generateMidPreview() 호출
        │                                 │
   v 방향 제안 생성                  v_recommendations 생성
        │                                 │
   결과를 그대로                     state.mid_preview에 저장
   runL0L1() 입력으로 전달           current_phase = 'mid_preview'
        │                                 │
        ▼                                 ▼
   (사용자 무개입)                 클라이언트가 보여주고 대기
        │                                 │
        │                              사용자 선택
        │                                 │
        ▼                                 ▼
   L0L1 자동 진행                  POST /mid-decision
                                         │
                                   choice별 분기:
                                   ├─ accept_v: L0_L1로
                                   ├─ modify_v: user_mods 머지 후 L0_L1
                                   ├─ other_v_suggestion:
                                   │    Gemini 재호출 (다른 방향)
                                   │    phase 유지
                                   ├─ modify_s:
                                   │    S2 or S3로 복귀
                                   │    state.v = {} 초기화
                                   └─ reference_input:
                                        "블레이드러너 같은" 주입
                                        mid_preview 재생성
```

## 3.4 Back Adjust 유무

```
 svc-pipeline: 없음.
   L3 도중 "S2 바꾸고 싶다" → 전체 재실행밖에 방법 없음

 dual-axis: 있음.
   L0_L1 / L2 / L3 phase 중:
   POST /api/session/[id]/back-adjust
     body: { target: 'S2'|'S3', target_scene_id?, adjustment_note }
           │
           ▼
     Lock 검증:
       if (locks[target]) return 403
           │
           ▼
     target 재생성:
       target === 'S2':
         enhancedStory = story + "[수정 요청] " + note
         state.s.S2 = await generateS2(enhancedState)
         state.s.S3 = undefined        ← 하위 무효화
         state.mid_preview = undefined
         state.v = {}
         state.shot_sequence = undefined
         state.current_phase = 'S3'    ← 되돌아감
         invalidated = ['S3', 'mid_preview', 'L0', 'L1', 'L2', 'L3']

       target === 'S3', 특정 씬만:
         scoped 재생성 + 해당 씬 L3 샷들만 제거

       target === 'S3', 전체:
         state.v.L2 = state.v.L3 = undefined
         state.current_phase = 'L0_L1'
         invalidated = ['L2', 'L3']
           │
           ▼
     back_adjusts[] 기록
     locks = computeLocks(current_phase)
     raw flush + save
```

## 3.5 사용 시나리오 구분

```
┌──────────────────────────┬──────────────────────────────────────┐
│        시나리오           │        적합한 파이프라인              │
├──────────────────────────┼──────────────────────────────────────┤
│ 벤치마크: 1시간 스토리     │ svc-pipeline                         │
│ 샷 품질 측정              │ (원샷 → 결과만 보고 싶을 때)           │
├──────────────────────────┼──────────────────────────────────────┤
│ 프롬프트 튜닝 실험         │ svc-pipeline                         │
│ (스테이지별 비교)          │ (각 stage 결과가 떨어져 나옴)         │
├──────────────────────────┼──────────────────────────────────────┤
│ 사용자 UX 검증            │ dual-axis                           │
│ (언제 사용자가 개입?)      │ (Mid Preview + Back Adjust 실측)     │
├──────────────────────────┼──────────────────────────────────────┤
│ 협상 패턴 연구            │ dual-axis                           │
│ (S↔V 충돌 해결)           │ (user_choice 5개 분기별 데이터)      │
├──────────────────────────┼──────────────────────────────────────┤
│ 실제 창작자 활용           │ dual-axis                           │
│ (professional 입력)       │ (Preset 선택 + phase 단위 승인)      │
├──────────────────────────┼──────────────────────────────────────┤
│ CI/자동화 테스트           │ svc-pipeline                         │
│ (회귀 검증)               │ (결정적, 한 번에 끝)                 │
└──────────────────────────┴──────────────────────────────────────┘
```

## 3.6 결합 가능성

두 파이프라인은 **상호 배타적이지 않다**. 내부 stage 로직은 공유 가능:

```
         ┌──────────────────────────────────┐
         │  공통 Stage 함수 (진짜 로직)      │
         │                                  │
         │  generateS0, generateS1,         │
         │  generateS2, generateS3,         │
         │  generateMidPreview,             │
         │  generateL0L1, generateL2,       │
         │  generateL3Batch,                │
         │  validateC1, applyC2             │
         └──────────────┬───────────────────┘
                        │
             ┌──────────┴──────────┐
             │                     │
             ▼                     ▼
     ┌─────────────┐       ┌─────────────┐
     │ svc-pipeline│       │ dual-axis   │
     │  (orchestr- │       │  (state     │
     │   ator)     │       │   machine)  │
     └─────────────┘       └─────────────┘

실제로: svc-pipeline의 stages/*.ts와 dual-axis의 stages/*.ts는
       현재 별개로 유지되고 있지만, 함수 시그니처와 스키마는 호환.
       향후 공통 라이브러리로 추출 가능.
```

## 3.7 두 파이프라인의 역할 분담 (권고)

```
  svc-pipeline    =    내부 엔진 검증용
     │                 ├─ 프롬프트 품질 측정
     │                 ├─ 스케일 테스트 (1시간 스토리)
     │                 ├─ 회귀/CI
     │                 └─ 벤치마크

  dual-axis       =    UX/협상 연구용
     │                 ├─ 사용자 개입 시점 설계 검증
     │                 ├─ Lock Policy 효과 측정
     │                 ├─ Back Adjust 빈도/패턴 수집
     │                 └─ 페르소나별 UX 테스트

  향후 (가능성)   =    두 축 통합
                       ├─ 공통 stage 라이브러리
                       ├─ svc = "auto" 모드
                       ├─ dual-axis = "interactive" 모드
                       └─ 같은 백엔드 호출
```

---

# PART 4: 핵심 불변식 (Invariants)

## 4.1 svc-pipeline 불변식

```
I1. 모든 stage 실행 직후 flushRawLlm('<stage>') 호출됨
    → 어느 stage에서 실패해도 직전 raw 보존

I2. try/finally로 runPipeline 감쌈
    → catch되지 않는 예외도 logger.flushRawLlm('ERROR') 호출 보장

I3. Stage 순서는 S0→S1→S2→S3→C1→MidPreview→L0L1→L2→L3→C2 고정
    → 병렬 없음, 의존성 완전 선형

I4. LLM 카운트는 runPipeline 진입 시 리셋
    → metadata.llm_calls가 이번 run 실적만 반영
```

## 4.2 dual-axis 불변식

```
J1. 모든 phase 전이는 POST /phase 호출로만 발생
    → state는 서버만 갱신, 클라이언트는 읽기만

J2. computeLocks(current_phase)는 deterministic
    → 같은 phase에서 항상 같은 LockState

J3. Back Adjust는 Lock 검증 필수
    → target이 locked 상태면 403, 진행 안 됨

J4. 모든 SessionState 변경은 raw flush 동반
    → 상태 변경 이전의 raw LLM 호출 보존

J5. "Can't go up" 원칙:
    current_phase 기준 상위 필드는 항상 locked
    (preset phase 제외 — preset은 초기 세팅이라 모두 open)
```

---

# PART 5: 기대되는 확장 지점

본 문서에 현재는 없지만 향후 추가될 여지가 있는 영역 (`user_input_scenarios.md` 로드맵과 연동):

```
┌─────────────────────┬──────────────────────────────────────┐
│ 확장 지점             │ 두 파이프라인에 미치는 영향             │
├─────────────────────┼──────────────────────────────────────┤
│ Locked Field 주입     │ svc: 입력 타입 확장                   │
│                     │ dual: preset phase에 사용자 필드 수용  │
├─────────────────────┼──────────────────────────────────────┤
│ 멀티모달 입력         │ svc: input.references[] 추가           │
│                     │ dual: /api/session/new에 파일 업로드    │
├─────────────────────┼──────────────────────────────────────┤
│ Taxonomy enum 검증   │ 양쪽: 스테이지 출력이 enum 값으로 제한  │
├─────────────────────┼──────────────────────────────────────┤
│ Closed-World VLM     │ 새 stage: references → Taxonomy 분류   │
│  분류기               │ S0/L0/L1 주입 전 단계                  │
├─────────────────────┼──────────────────────────────────────┤
│ Progressive          │ dual-axis에만 의미 있음                │
│  Disclosure          │ (svc는 원샷이라 단계별 요청 불가)        │
└─────────────────────┴──────────────────────────────────────┘
```

---

## 부록 A: 참조 파일

### svc-pipeline
- `experiment/svc-pipeline/src/app/api/pipeline/route.ts` — HTTP 엔트리
- `experiment/svc-pipeline/src/lib/pipeline/index.ts` — 오케스트레이터
- `experiment/svc-pipeline/src/lib/pipeline/stages/*.ts` — 10개 stage
- `experiment/svc-pipeline/src/lib/llm/gemini.ts`, `claude.ts`, `raw_collector.ts`
- `experiment/svc-pipeline/src/lib/types/pipeline.ts` — 입출력 타입
- `experiment/svc-pipeline/src/lib/logger.ts` — PipelineLogger

### dual-axis
- `experiment/dual-axis/src/app/api/session/new/route.ts` — 세션 생성
- `experiment/dual-axis/src/app/api/session/[id]/route.ts` — state 조회
- `experiment/dual-axis/src/app/api/session/[id]/phase/route.ts` — phase 실행
- `experiment/dual-axis/src/app/api/session/[id]/mid-decision/route.ts` — Mid 결정
- `experiment/dual-axis/src/app/api/session/[id]/back-adjust/route.ts` — Back Adjust
- `experiment/dual-axis/src/lib/types/state.ts` — Phase, LockState, computeLocks
- `experiment/dual-axis/src/lib/pipeline/presets/library.ts` — 8개 장르 프리셋
- `experiment/dual-axis/src/lib/pipeline/stages/*.ts` — s0, s_stages, v_stages, mid_preview
- `experiment/dual-axis/src/lib/logger/session.ts` — SessionStore

## 부록 B: 관련 이론 문서
- `dev/writer_advencement/dual_axis_model.md` — S/V/C 축 이론
- `dev/writer_advencement/linear_pipeline.md` — 선형 구조 실무 설계
- `dev/writer_advencement/user_input_scenarios.md` — 사용자 입력 5축 분류
