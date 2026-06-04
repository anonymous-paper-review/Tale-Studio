# Pipeline 모식도: svc-pipeline + dual-axis 통합 시각화

> 작성일: 2026-04-20 (개정: 2026-04-20 V축 재설계 + Compact Mode + D 레벨 7단계 반영, svc-pipeline만)
> 대상: 현재 구현된 두 실험 파이프라인의 구조/상태/차이
> 근거 코드: `experiment/svc-pipeline/`, `experiment/dual-axis/`
>
> ⚠️ **PART 1 (svc-pipeline)은 최신 구조 반영 완료. PART 2 (dual-axis)는 옛 구조 (마이그레이션 대기)**

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
                        │
            ┌───────────┴───────────┐
            │                       │
            ▼ POST /api/pipeline    ▼ POST /api/pipeline/resume
              { story,                { projectId }
                runtimeSeconds? }      ← 중단 지점부터 이어서
                        │                       │
                        └───────────┬───────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────┐
│           app/api/pipeline/*/route.ts                           │
│           runtime: 'nodejs',  maxDuration: 600                  │
└───────────────────────┬────────────────────────────────────────┘
                        │ runPipeline(input, resumeProjectId?)
                        ▼
┌────────────────────────────────────────────────────────────────┐
│           lib/pipeline/index.ts ── runPipeline()                │
│                                                                 │
│  ┌──────────────────── 전역 초기화 ─────────────────────┐      │
│  │ resetGeminiCallCount() / resetClaudeCallCount()      │      │
│  │ resetRawSeq()              ← raw LLM 시퀀스 리셋     │      │
│  │ projectId = resumeProjectId ?? makeProjectId()       │      │
│  │ logger = new PipelineLogger(projectId)               │      │
│  │ if (!resume): saveText('00_input_story.md', ...)     │      │
│  │              saveStage('00_input.json', input)       │      │
│  └──────────────────────────────────────────────────────┘      │
│                           │                                     │
│                           ▼                                     │
│  ┌────────────────── try/finally 경계 ────────────────┐        │
│  │  _runPipelineInner(input, ..., resume) 호출        │        │
│  │   각 stage는 loadOrRun() 헬퍼로 캐시 우선:          │        │
│  │     resume=true && stage_file 존재 → 로드           │        │
│  │     else → 실행 + flushRawLlm                       │        │
│  │   ├─ 성공 → result 반환 + saveIntegrated           │        │
│  │   └─ 실패 → flushRawLlm('ERROR') + markStage failed │        │
│  └────────────────────────────────────────────────────┘        │
└───────────────────────┬────────────────────────────────────────┘
                        │ PipelineResult (JSON)
                        ▼
                  NextResponse.json(result)
```

## 1.2 내부 파이프라인 시퀀스

```
_runPipelineInner() 내부:

  INPUT(story, runtimeSeconds?, presetId?)
      │
      ▼
 ┌─────────────┐
 │  S축 (Story) │
 └─────────────┘
      │
      ├──► S0 ── runS0(input, logger) ─────────── Gemini ──► S0 JSON
      │         (장르/톤/타겟/포맷/depth_level D1~D7 결정)   (+ flush 'S0')
      │
      ├──► S1 ── runS1(input, S0, logger) ─────── Gemini ──► S1 JSON
      │         (기승전결/CDQ — depth_level별 강도 차등)     (+ flush 'S1')
      │
      ├──► S2 ── runS2(input, S0, S1, logger) ─── Gemini ──► S2 JSON
      │         (캐릭터 카드 — depth별 1명~앙상블)            (+ flush 'S2')
      │
      └──► S3 ── runS3(input, S0, S1, S2, logger) Gemini ──► S3 JSON
                (씬 리스트 — depth별 1~30+씬)                 (+ flush 'S3')
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
      └──► mid_preview ── Gemini ──► v_recommendations {L0, L1,
                                     L2_summary, L3_scene_strategy,
                                     L4_shot_recipe}
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
      │         (로케이션/의상/컬러팔레트/VFX 글로벌)                (+ flush 'L2')
      │
      ├──► [Compact 분기]  isCompactDepth(S0.depth_level)?
      │         ├─ YES (D1~D3) → L3 스킵, action_budget만 계산
      │         └─ NO  (D4~D7) → runL3SceneVisualPlan ─ Gemini ──► L3
      │                          (씬마다 coverage_pattern/         (+ flush 'L3_scene_plan')
      │                           lens_vocab/lighting_arc 등
      │                           씬 디시플린 결정)
      │
      ├──► L4 ── runL4Shots(S0, S2, S3, L1, L2, L3|null, logger)
      │         씬별 호출. 각 샷이 3분할:                          Gemini × N(씬)
      │         ┌─ L4a Intent: story_beat_ref 1:1, dramatic_purpose,
      │         │              duration_seconds, audience_focus
      │         ├─ L4b Static: lens_mm, framing, lighting,
      │         │              character_blocking, prop_placement,
      │         │              first_frame_prompt (200~400자 → Image)
      │         └─ L4c Dynamic: camera_motion, character_motion,
      │                        gaze_arc, transition,
      │                        motion_prompt (50~80자 → Video)
      │         (Compact일 땐 자체 디시플린 결정 모드)              (+ flush 'L4_shots')
      │
      └──► [Compact 사후처리]
                Compact였으면 inferL3FromL4Shots(L4, S3) 호출
                → L3 (씬 플랜) 역추론, 다운스트림 호환용
                → save '10_L3_scene_plans_inferred.json'
      │
      ▼
 ┌─────────────────────────┐
 │  C축 적용 ②              │
 └─────────────────────────┘
      │
      └──► c_application_2 ── Gemini + Claude ──► shotSequence + report
                                                 (+ flush 'C2_application')
            Step 1: Gemini → L4 (3분할) → ShotSequenceItem 조립 + S/C/V 메타
            Step 2: Claude → 액션 스코프/연속성 검증 + 자동 split
            Step 3: shot_id 재정렬 + causal_link 갱신
      │
      ▼
 ┌─────────────────────────────────────┐
 │  L5 Render Spec (T2I/TI2V 프롬프트)   │
 └─────────────────────────────────────┘
      │
      └──► l5_prompts ── (대부분 추출, 누락 시 LLM fallback) ──► FinalPromptsOutput
            샷마다 ShotGenerationPrompts {
              t2i: { prompt, aspect_ratio, resolution, reference_assets }
              ti2v: { motion_prompt, duration_seconds, fps, camera_movement }
            }
            extraction_summary: { t2i_extracted, t2i_llm_generated, ... }
            (+ flush 'L5_prompts')
            ※ 현재는 추출 모드 (Phase 1). Provider-aware 확장은 향후.
      │
      ▼
  OUTPUT {
    project_id, input,
    S0, S1, S2, S3,
    c_validation_1, mid_preview,
    L0, L1, L2,
    L3,    ← 씬 비주얼 플랜 (실제 호출 or inferred)
    L4,    ← 샷 3분할 (intent + static + dynamic)
    c_validation_2,
    shot_sequence,    ← C2가 조립한 최종 ShotSequenceItem[]
    final_prompts,    ← L5 추출 결과 (T2I/TI2V 프롬프트)
    metadata { started_at, completed_at, total_duration_ms,
               llm_calls: {gemini, claude} }
  }
      │
      ▼
  logger.saveIntegrated(result)
  logger.markStage('PIPELINE', 'completed', ...)
```

## 1.3 LLM 호출 모델 분담

```
┌──────────────────────┬──────────────────────────────────┐
│   GEMINI             │          CLAUDE                  │
│ (gemini-3-flash-     │        (claude-sonnet-4-6)       │
│  preview)            │                                  │
├──────────────────────┼──────────────────────────────────┤
│ 생성(Generation)      │          검증(Validation)         │
├──────────────────────┼──────────────────────────────────┤
│ S0 genre              │ C1 validation (S0-S3 일관성)     │
│ S1 structure          │ C2 validation step (액션 스코프) │
│ S2 characters         │                                  │
│ S3 scenes             │                                  │
│ Mid Preview           │                                  │
│ L0+L1 visual          │                                  │
│ L2 design             │                                  │
│ L3 scene_plan (1회)   │                                  │
│ L4 shots (씬당 1회)   │                                  │
│ C2 generate step      │                                  │
└──────────────────────┴──────────────────────────────────┘

→ Gemini = 창작(다양성, 속도)
→ Claude = 검증(엄격성, 구조 준수)
→ 호출 횟수 (D4 일반 모드 기준, 씬 N개): 9 + N (L4 분산) = 통상 14~19회
→ Compact (D1~D3): L3 1회 절감 → 8 + N
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

## 1.5 출력 로그 구조 (V축 재설계 후)

```
logs/<YYYY-MM-DD_HH-MM-SS>_<project_id>/
│
├── 00_input_story.md                       ← 사용자 입력
├── 02_S0.json                              ← S0 (depth_level 포함)
├── 03_S1.json
├── 04_S2.json
├── 05_S3.json
├── 06_C_validation_1.json
├── 07_mid_preview.json
├── 08_L0_L1.json
├── 09_L2.json
│
├── 10_L3_scene_plans.json                  ← (일반 모드) 씬 비주얼 플랜
│   OR
├── 10_L3_scene_plans_inferred.json         ← (Compact 모드) L4 후 역추론
│   (note: "inferred from L4 (Compact Mode skipped L3 generation)")
│
├── 11_L4_shots.json                        ← 샷 3분할 (compact_mode 필드 포함)
├── 12_C_application_2.json                 ← C2 validation report
├── 13_shot_sequence.json                   ← 최종 ShotSequenceItem[]
├── 14_final_prompts.json                   ← L5 추출: T2I/TI2V 프롬프트 정리
├── INTEGRATED.json                         ← 전체 result
├── STORY.md                                ← (수동 생성) 읽기 편한 서사
│
├── debug/
│   └── llm_calls/
│       ├── 001_S0_genre.json               ← raw input + output
│       ├── 002_S1_structure.json
│       ├── 003_S2_characters.json
│       ├── 004_S3_scenes.json
│       ├── 005_C1_validation.json          ← Claude
│       ├── 006_mid_preview.json
│       ├── 007_L0_L1_visual.json
│       ├── 008_L2_design.json
│       ├── 009_L3_scene_plan.json          ← (일반 모드만) 1회
│       ├── 010_L4_shots_scene_1.json       ← 씬별
│       ├── 011_L4_shots_scene_2.json
│       ├── ...
│       ├── 0NN_C2_generate.json            ← Gemini
│       └── 0NN_C2_validate.json            ← Claude (or _FAILED)
│
└── stage_log.jsonl                         ← 타임라인 (stage 마커)
```

⚠️ 옛 로그 (`09_l3_shots.json`, `10_c_validation_2.json`, `11_integrated.json`, `12_shot_sequence.json`)는 옛 구조 결과. 새로 실행 시 위 구조로 생성.

## 1.6 Compact Mode 흐름 (D1~D3 전용)

```
S0.depth_level ∈ {D1, D2, D3}  →  isCompactDepth() = true
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────┐
│  L2 완료 후 분기                                          │
└─────────────────────────────────────────────────────────┘
        │
        ▼
   ┌─────────────────────────────────────────┐
   │ isCompactDepth(S0.depth_level)?         │
   └────────┬───────────────┬────────────────┘
            │ YES (D1~D3)   │ NO (D4~D7)
            ▼               ▼
   ┌─────────────────┐  ┌────────────────────────────┐
   │ L3 스킵          │  │ runL3SceneVisualPlan()     │
   │ markStage       │  │ → L3SceneVisualPlan[]       │
   │  skipped=true   │  │ Gemini 1회                  │
   │                 │  │ flush 'L3_scene_plan'       │
   │ action_budget만 │  └────────────────────────────┘
   │ 사전 계산        │
   └─────────────────┘
            │               │
            └───────┬───────┘
                    ▼
   ┌───────────────────────────────────────────┐
   │ runL4Shots(s0, s2, s3, l1, l2, L3|null)   │
   │   compact 시 scenePlans=null              │
   │   → 프롬프트에서 자체 디시플린 결정 모드 진입 │
   │   씬마다 호출 → L4Shot[] (씬당 N개)        │
   └────────┬──────────────────────────────────┘
            │
            ▼
   ┌───────────────────────────────────────────┐
   │ Compact였으면:                            │
   │   inferL3FromL4Shots(L4, S3)              │
   │   → 씬별 lens/mount/energy/lighting 역추론  │
   │   save '10_L3_scene_plans_inferred.json'  │
   └────────┬──────────────────────────────────┘
            │
            ▼
   C2 application (compact 여부 무관, L3는 항상 채워짐)
```

**효과**:
- D1 (15초 영상): LLM 호출 ~7회 → ~6회
- D3 (5분 영상): L3 LLM 호출 1회 절감, L4 자유도 ↑
- 다운스트림(C2/UI/분석) **변경 없음** (L3 필드는 inferred로 채워짐)

## 1.7 Depth Level → 활성 stage 매핑

```
┌────┬──────────────┬───────┬────────┬────────────────────┐
│ D  │ 시간         │ 샷 수  │ 모드   │ L3 단계            │
├────┼──────────────┼───────┼────────┼────────────────────┤
│ D1 │ 5~15초       │ 1~2   │Compact│ 스킵 → inferred    │
│ D2 │ 15~60초      │ 3~10  │Compact│ 스킵 → inferred    │
│ D3 │ 1~5분        │ 6~30  │Compact│ 스킵 → inferred    │
│ D4 │ 5~10분       │30~60  │ 일반  │ LLM 호출           │
│ D5 │ 10~20분      │60~120 │ 일반  │ LLM 호출           │
│ D6 │ 20~30분      │120~180│ 일반  │ LLM 호출           │
│ D7 │ 30분+        │ 180+  │ 일반  │ LLM 호출           │
└────┴──────────────┴───────┴────────┴────────────────────┘

S1/S2/S3 프롬프트도 depth_level별로 구조 복잡도/캐릭터 수/씬 수 가이드 차등화.
L4는 두 모드 모두 씬별 호출 (분리 호출이 디시플린 명확화에 유리).
```

## 1.8 Resume 동작 (중단 지점부터 재개)

```
POST /api/pipeline/resume { projectId }
                │
                ▼
runPipeline(input, projectId)
   ├─ resetCounters
   ├─ projectId = 인자 (새로 만들지 않음)
   ├─ isResume = true
   ├─ "00_input.json"에서 입력 복원 (saveText 스킵)
   └─ _runPipelineInner(..., resume=true)
                │
                ▼
   각 stage마다 loadOrRun(resume, filename, runner, label, logger)
       │
       ├─ resume=true → logger.loadStage<T>(filename) 시도
       │     ├─ 파일 존재 → 그 결과 그대로 사용 (LLM 호출 0)
       │     │     markStage('<label>', 'completed', {resumed: true})
       │     │     return { value, loaded: true }
       │     └─ 파일 없음 → runner() 실행, flushRawLlm
       │
       └─ resume=false → runner() 실행, flushRawLlm

L3 (씬 비주얼 플랜) 특수 처리:
  - resume 시 '10_L3_scene_plans.json' 우선 시도
  - 없으면 (compact였을 수도) '10_L3_scene_plans_inferred.json' 시도
  - 둘 다 없으면 정상 분기 (compact면 스킵, 아니면 generate)

L4도 loadOrRun으로 '11_L4_shots.json' 캐시. 단 부분 재개(특정 씬만) 미지원 — 전체 재실행.

효과:
  - 어느 stage에서 죽었어도 직전까지 결과 보존
  - 부분 재실행으로 비용/시간 절감
  - 디버깅 시 특정 stage만 재실행 → 결과 비교 가능
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
┌──────────────────┬─────────────────────────┬─────────────────────────┐
│       축         │   svc-pipeline (최신)    │   dual-axis (옛 구조)    │
├──────────────────┼─────────────────────────┼─────────────────────────┤
│ 실행 모델         │ 원샷 함수 호출           │ 세션 기반 상태 머신      │
│ API 엔드포인트    │ 1개 (POST /pipeline)    │ 5개 (new/phase/mid/back)│
│ 상태 저장         │ 파일 (stage별 캐시)      │ 파일 영구 (state.json)  │
│ 중단/재시작       │ resumeProjectId 가능     │ phase 단위 가능          │
│ 사용자 개입       │ 없음 (무개입)            │ Mid Preview + Back Adjust│
│ 잠금/검증         │ 없음 (단방향)            │ computeLocks (필드별)    │
│ LLM 모델          │ gemini-3-flash-preview  │ gemini-3-flash-preview  │
│                  │ + claude-sonnet-4-6     │ + claude-sonnet-4-6     │
│ V축 구조          │ L0/L1/L2 + L3(씬플랜)   │ L0_L1/L2/L3(샷)         │
│                  │ + L4(샷 3분할)          │ ⚠️ 옛 구조               │
│ Depth 레벨        │ D1~D7 (7단계)           │ D3~D5 (3단계)           │
│                  │                         │ ⚠️ 미동기                │
│ Compact Mode      │ D1~D3 자동 (L3 스킵)    │ 없음                    │
│ C축               │ C1 + C2 (Gemini+Claude) │ 없음 (validators/ 빈)   │
│ Phase 개수        │ 12개 (S0-S3, C1, Mid,   │ 11개 (전이 가능)         │
│                  │  L0L1, L2, L3, L4, C2)  │                         │
│ 실패 복구         │ resume from cached       │ 특정 phase 재시작        │
│ 입력              │ story + runtimeSec      │ + preset + runtimeSec   │
│ 출력              │ INTEGRATED.json + 13_   │ 상태 지속 + 최종 shot   │
│ 개발 상태         │ V축 재설계 완료, 검증 대기│ V축 마이그레이션 대기    │
└──────────────────┴─────────────────────────┴─────────────────────────┘
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
 │ ─ 분기 ─      │                │ POST /mid-    │
 │ compact?      │                │  decision     │
 │  YES: skip L3 │                │ { choice: ... }│
 │  NO:  L3      │                │               │
 │ ↓ flush       │                │ accept_v:     │
 │ L4 (씬별 호출)│                │  → L0_L1 전이 │
 │ ↓ flush       │                │ modify_v:     │
 │ inferL3 if    │                │  → L0_L1 전이 │
 │  compact      │                │ other_v_sug:  │
 │ ↓             │                │  → 재제안 (stay)│
 │ C2 (Gem+Cla)  │                │ modify_s:     │
 │ ↓ flush       │                │  → S2/S3 복귀 │
 └───────────────┘                │ reference:    │
     │                             │  → 재생성     │
     │                             │               │
     ▼                             │ POST /phase   │
 saveIntegrated                   │  {phase:'L0_L1'}
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
 svc-pipeline: Back Adjust 자체는 없음. 단,
   - Resume 기능 있음 (특정 stage 결과 파일 삭제 후 /api/pipeline/resume)
   - "L4 도중 S2 바꾸고 싶다" → S2 파일 + 그 이후 (S3, C1, Mid, L2, L3, L4, C2) 삭제 후 resume

 dual-axis: Back Adjust 있음 (API 레벨, 사용자 친화).
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
I1. 모든 stage 실행 직후 flushRawLlm('<stage>') 호출됨 (loadOrRun이 캐시 hit이면 호출 안 함 — raw 없으니 OK)
    → 어느 stage에서 실패해도 직전 raw 보존

I2. try/finally로 runPipeline 감쌈
    → catch되지 않는 예외도 logger.flushRawLlm('ERROR') 호출 보장

I3. Stage 순서는 S0→S1→S2→S3→C1→MidPreview→L0L1→L2→L3(or skip)→L4→C2→L5 고정
    → 병렬 없음, 의존성 완전 선형. Compact일 땐 L3만 분기.
    → L5(Render Spec)는 추출 모드 — 대부분 ShotSequenceItem에서 가져옴, 누락 시만 LLM fallback.

I4. LLM 카운트는 runPipeline 진입 시 리셋
    → metadata.llm_calls가 이번 run 실적만 반영 (resume 시 캐시 hit은 호출 0이므로 카운트 0)

I5. Compact Mode 조건: isCompactDepth(S0.depth_level) ∈ {D1, D2, D3}
    → L3 LLM 호출 스킵, L4가 자체 디시플린, 사후 inferL3로 L3 채움
    → 다운스트림(C2/UI)은 L3 필드를 항상 받음 (실제 또는 inferred)

I6. Resume 시 동일 projectId 사용, 새 폴더 만들지 않음
    → loadOrRun이 각 stage 캐시 파일을 우선 시도, 없으면 실행
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
- `experiment/svc-pipeline/src/app/api/pipeline/route.ts` — HTTP 엔트리 (신규 실행)
- `experiment/svc-pipeline/src/app/api/pipeline/resume/route.ts` — Resume 엔트리
- `experiment/svc-pipeline/src/app/api/projects/route.ts` — 프로젝트 목록 + resumable 플래그
- `experiment/svc-pipeline/src/app/api/logs/[projectId]/route.ts` — 로그 파일 조회
- `experiment/svc-pipeline/src/lib/pipeline/index.ts` — 오케스트레이터 (loadOrRun 헬퍼)
- `experiment/svc-pipeline/src/lib/pipeline/stages/*.ts` — 12개 stage:
  - s0_genre, s1_structure, s2_characters, s3_scenes
  - c_validation_1, mid_preview
  - l0_l1_visual, l2_design
  - **l3_scene_plan** (신규, D4+), **l4_shots** (신규, 항상)
  - c_application_2
  - **l5_prompts** (신규, T2I/TI2V 추출 + LLM fallback) ⭐
- `experiment/svc-pipeline/src/lib/pipeline/util/infer_l3.ts` — Compact 사후 L3 역추론
- `experiment/svc-pipeline/src/lib/llm/gemini.ts` (`gemini-3-flash-preview`)
- `experiment/svc-pipeline/src/lib/llm/claude.ts` (`claude-sonnet-4-6`)
- `experiment/svc-pipeline/src/lib/llm/raw_collector.ts`, `json_repair.ts`, `retry.ts`
- `experiment/svc-pipeline/src/lib/types/pipeline.ts` — DepthLevel D1~D7, L3SceneVisualPlan, L4Shot, isCompactDepth
- `experiment/svc-pipeline/src/lib/logger.ts` — PipelineLogger (loadStage 포함)

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
- `dev/writer_advencement/linear_pipeline.md` — 선형 구조 실무 설계 (D 레벨 7단계 반영)
- `dev/writer_advencement/v_axis_redesign.md` — V축 재설계 (L3/L4 분해 + Compact Mode)
- `dev/writer_advencement/v_axis_recap.md` — 재설계 직전 상태 스냅샷
- `dev/writer_advencement/pipeline_content_gaps.md` — 컨텐츠 갭 / AI 한계 / 추가 개념
- `dev/writer_advencement/user_input_scenarios.md` — 사용자 입력 5축 분류
- `experiment/ToDo.md` — 양쪽 파이프라인 미완 작업 목록
