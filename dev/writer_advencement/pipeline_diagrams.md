# Pipeline 모식도: svc-pipeline + dual-axis 통합 시각화

> 작성일: 2026-04-20 / **전면 개정: 2026-06-05 — PART 1을 현재 프로덕션 코드(`src/lib/svc/pipeline/`) 기준으로 재작성**
> 대상: 현재 구현된 파이프라인의 구조/상태/피드백 경로
> 근거 코드: **`src/lib/svc/pipeline/`** (프로덕션), `experiment/dual-axis/` (PART 2, 코드 유실)
>
> ⚠️ **PART 1 = 현재 코드(`src/lib/svc/pipeline/`) 최신 반영.** 옛 `experiment/svc-pipeline/`는 폐기됨.
> ⚠️ **PART 2 (dual-axis) = 옛 구조 기록 보존용. 해당 코드는 유실됨 (재구현 시 참고용 도식).**
> 📎 stage별 입출력 필드 단위 상세는 `dev/PIPELINE_IO_MAP.md` 참조 (이 문서는 실행 흐름, IO_MAP은 필드 손실 추적).

---

## 0. 이 문서의 목적

실제 구현체의 **실행 흐름, 상태 전이, 피드백 경로**를 담은 도식. 세 가지 제공:

1. **svc-pipeline** (`src/lib/svc/pipeline/`) — 자동 원샷 오케스트레이터. 현재 프로덕션.
2. **dual-axis** — 세션 기반 상태 머신 (코드 유실, 도식만 보존)
3. **두 구현체 비교**

### 변경 이력 (2026-06-05 재작성에서 반영)
- 코드 위치 이동: `experiment/svc-pipeline/` → `src/lib/svc/pipeline/`
- **신규 stage**: Assets(L2 직후 병렬), **Découpage**(감독 beat→shot 분해), L4 데쿠파주 구동 모드, **L6 images / L7 videos**(fal.ai 생성)
- **C2에 Layer1 asset-ref 정규화** 추가 (canonical 강제)
- **Skip 모드**: `c_validation_1` + `mid_preview` 통째 skip이 **default** (피드백 미반영 → 비용 절감)
- **Compact Mode 변경**: `COMPACT_DEPTH_LEVELS = []` → **모든 depth가 L3 거침** (D1~D3도 풀 파이프라인)
- 4-provider dispatch: gemini / claude / openai / local

---

# PART 1: svc-pipeline 전체 플로우 (현재 코드)

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

## 1.2 내부 파이프라인 시퀀스 (현재 코드)

```
_runPipelineInner(input) 내부:   models = {S, V, C} (4-provider), skip = resolveSkip(input)

  INPUT(story, runtimeSeconds?, models?, skip?)
      │
      ▼
 ┌─────────────┐
 │  S축 (Story) │  model = models.S (default gemini)
 └─────────────┘
      ├──► S0  runS0(input)                      ──► 02_S0.json  (장르/톤/depth_level D1~D7)
      ├──► S1  runS1(input,S0)                   ──► 03_S1.json  (구조/POV/CDQ)
      ├──► S2  runS2(input,S0,S1)                ──► 04_S2.json  ★canonical character id
      └──► S3  runS3(input,S0,S1,S2)             ──► 05_S3.json  ★canonical location, scene_actions(비트)
      │
      ▼   skip = resolveSkip(input)   ← default 둘 다 skip
 ┌─────────────────────────┐
 │  C 검증 ① (skip default) │
 └─────────────────────────┘
      └──► skip.validation1 ? emptyC1Report()  ← ★ default. LLM 호출 0, markStage skipped
                             : runCValidation1(S0..S3) [Claude] ──► 06_C_validation_1.json
      │
      ▼
 ┌─────────────────────────┐
 │  Mid Preview (skip def.) │
 └─────────────────────────┘
      └──► skip.midPreview ? emptyMidPreview()  ← ★ default. 빈 추천 → L0L1/L2/L3 자체 결정
                           : runMidPreview(S0..S3, c1) [V] ──► 07_mid_preview.json
      │
      ▼
 ┌─────────────┐
 │  V축 (Visual)│  model = models.V
 └─────────────┘
      ├──► L0+L1  runL0L1(S0, mid_preview)       ──► 08_L0_L1.json  ★aspect/fps/resolution
      │           (매체/렌더 + 시각 스타일)
      │
      ├──► L2     runL2(S2,S3,L1, mid_preview)   ──► 09_L2.json     ★location 디자인/의상/팔레트
      │
      ├──► ◇ Assets (L2 직후, 비동기 fire-and-forget — await 안 함)
      │       runAssetsGenerate(S2,L0,L1,L2) [fal.ai T2I] ──► 14b_assets.json
      │       캐릭터/로케이션 reference 이미지. L6에서 I2I용. 실패해도 파이프라인 계속.
      │       ⚠ L6보다 늦으면 순수 T2I로 강등 (IO_MAP 손실지점 ④)
      │
      ├──► L3     [Compact 분기] isCompactDepth(depth) — 현재 COMPACT_DEPTH_LEVELS=[] → 항상 false
      │           → runL3SceneVisualPlan(S0,S2,S3,L1,L2) [V] ──► 10_L3_scene_plans.json
      │           (씬마다 coverage_pattern/lens/lighting_arc/rhythm 디시플린)
      │           ※ compact 경로(스킵+inferL3)는 코드에 남아있으나 현재 비활성
      │
      ├──► ★ Découpage  runDecoupage(S0,S2,S3,L1,L2, L3) [V]  ──► 10b_decoupage.json
      │           감독 페르소나. beat→shot 분해 (4연산 derived/added/merged/split).
      │           샷 개수/리듬(rhythm_role)/카메라의도/쇼트사이즈 저작. 시간=validator.
      │
      ├──► L4     runL4Shots(S0,S2,S3,L1,L2, L3, decoupage) [V]  ──► 11_L4_shots.json
      │           씬별 호출. 데쿠파주 구동 모드: 데쿠파주가 정한 샷에 3분할 spec만 채움
      │           ┌─ Intent  : dramatic_purpose, duration, audience_focus (연출의도 — 직접 생성 stage로 안 감)
      │           ├─ Static  : lens/framing/lighting/blocking, first_frame_prompt(200~400자) ──► L5→L6 이미지
      │           └─ Dynamic : camera_motion, character_motion, motion_prompt(50~80자) ──► L5→L7 영상
      │
      ▼
 ┌─────────────────────────┐
 │  C 적용 ② (조립+검증+정규화)│  V(조립) + C(검증)
 └─────────────────────────┘
      └──► runCApplication2(...,L3,L4) ──► 12_C_application_2.json + 13_shot_sequence.json
            Step1: [V/Gemini] L4(3분할) → ShotSequenceItem 조립 + S/C/V 메타
            Step2: [C/Claude] 액션 스코프/연속성 검증 + 자동 split
            Step3: shot_id 재정렬 + causal_link 갱신
            Step3.5: ★ Layer1 asset-ref 정규화 (canonical 강제, scene.location fallback, 미해결 drop)
      │
      ▼
 ┌─────────────────────────────────────┐
 │  L5 Render Spec (T2I/TI2V 프롬프트)   │  추출 우선, 누락 시 V LLM fallback
 └─────────────────────────────────────┘
      └──► runL5Prompts(shotSequence, L0, S2, L2) ──► 14_final_prompts.json
            샷마다 { t2i:{prompt, aspect_ratio, resolution, reference_assets},
                    ti2v:{motion_prompt, duration_seconds, fps, camera_movement} }
      │
      ▼   (여기까지 runPipeline 반환. L6/L7은 별도 API로 트리거)
  OUTPUT PipelineResult {
    project_id, input, S0~S3, c_validation_1, mid_preview, L0, L1, L2,
    L3, L4, c_validation_2, shot_sequence, final_prompts,
    metadata { ..., llm_calls: {gemini, claude, openai, local} }
  }
      │
      ▼  ───── 생성 단계 (fal.ai, 별도 호출 — /api/svc/generate|resume) ─────
 ┌─────────────┐   runL6Images(final_prompts, +14b_assets 룩업)  ──► 15_L6_images.json
 │  L6 Images   │   asset 있으면 openai/gpt-image-2/edit (I2I) + reference_image_urls
 └─────────────┘   없으면 순수 T2I. submit→poll→progressive save.
      │
      ▼
 ┌─────────────┐   runL7Videos(final_prompts.ti2v, +15_L6 첫프레임)  ──► 16_L7_videos.json
 │  L7 Videos   │   reference-to-video (예: seedance/happy-horse). 첫프레임+motion_prompt.
 └─────────────┘   L6 success 아니면 해당 샷 skipped.
```

## 1.3 LLM 호출 모델 분담 (4-provider dispatch)

모델은 S/V/C 축별로 지정 (`dispatch.ts`, DEFAULT_MODELS). provider ∈ {gemini, claude, openai, local}.

```
DEFAULT_MODELS:
  S축 = gemini/gemini-3-flash-preview   (S0~S3)
  V축 = gemini/gemini-3-flash-preview   (MidPreview, L0L1, L2, L3, Decoupage, L4, C2조립, L5fallback)
  C축 = claude/claude-sonnet-4-6        (C1 검증, C2 검증)

┌──────────────────────┬──────────────────────────────────┐
│  V축 (생성)           │   C축 (검증)                      │
├──────────────────────┼──────────────────────────────────┤
│ L0+L1, L2             │ C1 validation  ← skip default     │
│ L3 scene_plan         │ C2 validation step (액션 스코프)  │
│ Découpage  ★          │                                  │
│ L4 shots (씬당 1회)   │                                  │
│ C2 generate step      │                                  │
│ L5 fallback (누락 시) │                                  │
│ MidPreview ← skip def.│                                  │
└──────────────────────┴──────────────────────────────────┘
이미지/영상: fal.ai (openai/gpt-image-2[/edit], reference-to-video) — LLM 카운트 별개.

→ 호출 횟수 (씬 N개, skip default 적용):
   S0~S3(4) + L0L1(1) + L2(1) + L3(1) + Découpage(N) + L4(N) + C2(2) + L5(0~M)
   = 9 + 2N + (L5 fallback)
   C1·MidPreview skip으로 2회 절감 (default). 끄면 +2.
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
├── 06_C_validation_1.json                  ← skip default 시 미생성
├── 07_mid_preview.json                     ← skip default 시 미생성
├── 08_L0_L1.json
├── 09_L2.json
│
├── 10_L3_scene_plans.json                  ← 씬 비주얼 플랜 (현재 모든 depth)
├── 10b_decoupage.json                      ← ★ 감독 데쿠파주 (beat→shot, 4연산)
│
├── 11_L4_shots.json                        ← 샷 3분할 (데쿠파주 구동)
├── 12_C_application_2.json                 ← C2 report (+ asset-ref 정규화 결과)
├── 13_shot_sequence.json                   ← 최종 ShotSequenceItem[] (canonical asset)
├── 14_final_prompts.json                   ← L5 추출: T2I/TI2V 프롬프트
├── 14b_assets.json                         ← ★ 캐릭터/로케이션 reference 이미지 (fal.ai)
├── 15_L6_images.json                       ← ★ 샷별 첫 프레임 이미지 (T2I/I2I)
├── 16_L7_videos.json                       ← ★ 샷별 영상 클립 (reference-to-video)
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

## 1.5b Skip 모드 (현재 default) ★

피드백이 다운스트림에 실질 반영되지 않는 stage를 건너뛰어 LLM 호출/시간 절약.
`PipelineInput.skip = { validation1?, midPreview? }`, 미지정 시 **default = 둘 다 skip(true)**.

```
resolveSkip(input):
  validation1 = input.skip?.validation1 ?? true   ← default skip
  midPreview  = input.skip?.midPreview  ?? true   ← default skip

C 검증 ①:  skip.validation1 ? emptyC1Report()    : runCValidation1()  [Claude]
Mid Preview: skip.midPreview ? emptyMidPreview()  : runMidPreview()    [V]

emptyMidPreview() = { v_recommendations:{L0:{},L1:{},L2_summary:'',
                       L3_scene_strategy:'',L4_shot_recipe:''},
                      color_script:[], emotional_arc:'', difficulty:'medium', warnings:[] }
  → L0L1/L2/L3이 빈 추천을 받아 S·L 기반으로 자체 결정 (안전 fallback)

emptyC1Report() = { passed:true, issues:[], causality_chain:[], cdq_present:false,
                    cdq_clarity_score:0, cliche_count:0, retry_count:0 }
```

**근거**: c_validation_1은 검증 리포트만 만들고 S를 수정하지 않음 (피드백 루프 없음).
mid_preview의 v_recommendations도 L0L1/L2/L3이 약하게만 참조 → skip해도 품질 영향 미미, 비용↓.
켜려면 `input.skip = { validation1:false, midPreview:false }`.

## 1.6 Compact Mode (현재 비활성) ⚠️

```
COMPACT_DEPTH_LEVELS = []   ← 2026 변경. isCompactDepth()는 항상 false.
→ 모든 depth(D1~D7)가 L3 씬 비주얼 플랜을 거침 (짧은 영상도 풀 파이프라인).
→ 이유: D1~D3가 L3를 스킵하고 L4 즉흥 판단하던 게 연출 규율을 약화시켰음.

코드에는 compact 분기(L3 스킵 + inferL3FromL4Shots 역추론)가 남아있으나 현재 진입 안 함.
재활성화하려면 types/pipeline.ts의 COMPACT_DEPTH_LEVELS 배열에 레벨 추가.
```

<details><summary>구 Compact Mode 흐름 (참고용, 현재 비활성)</summary>

## (구) Compact Mode 흐름 (D1~D3 전용)

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

**(구) 효과** (당시 Compact 활성 기준):
- D1 (15초 영상): LLM 호출 ~7회 → ~6회 / D3: L3 1회 절감
- 다운스트림(C2/UI)은 L3 필드를 inferred로 받음

</details>

## 1.7 Depth Level → 활성 stage 매핑 (현재)

```
┌────┬──────────────┬───────┬──────────┬────────────────────┐
│ D  │ 시간         │ 샷 수  │ 모드     │ L3 단계            │
├────┼──────────────┼───────┼──────────┼────────────────────┤
│ D1 │ 5~15초       │ 1~2   │ 풀(Full) │ LLM 호출           │
│ D2 │ 15~60초      │ 3~10  │ 풀(Full) │ LLM 호출           │
│ D3 │ 1~5분        │ 6~30  │ 풀(Full) │ LLM 호출           │
│ D4 │ 5~10분       │30~60  │ 풀(Full) │ LLM 호출           │
│ D5 │ 10~20분      │60~120 │ 풀(Full) │ LLM 호출           │
│ D6 │ 20~30분      │120~180│ 풀(Full) │ LLM 호출           │
│ D7 │ 30분+        │ 180+  │ 풀(Full) │ LLM 호출           │
└────┴──────────────┴───────┴──────────┴────────────────────┘

★ 현재 COMPACT_DEPTH_LEVELS=[] → 모든 depth가 L3 + Découpage + L4를 거침 (풀 파이프라인).
   짧은 영상(D1~D3)도 씬 비주얼 플랜·데쿠파주를 받아 연출 규율 확보.
S1/S2/S3/Découpage 프롬프트는 depth_level별 구조 복잡도/캐릭터 수/씬 수 가이드 차등화.
L4는 항상 씬별 호출. 비용 절감은 Compact 대신 Skip 모드(C1·MidPreview)로.
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
> ⚠️ 경로 갱신 (2026-06-05): 모든 svc-pipeline 코드는 `src/lib/svc/` 아래로 이동.

- `src/app/api/svc/start/route.ts` — 파이프라인 시작 엔트리
- `src/app/api/svc/resume/{assets,images,videos}/route.ts` — L6/L7/assets 재시도
- `src/app/api/svc/generate/{assets,images,videos}/route.ts` — L6/L7/assets 생성
- `src/app/api/svc/status/[projectId]/route.ts` — 진행상황 폴링
- `src/app/api/svc/logs/[projectId]/route.ts` — 로그 파일 조회
- `src/lib/svc/pipeline/index.ts` — 오케스트레이터 (loadOrRun + resolveSkip + empty fallback)
- `src/lib/svc/pipeline/stages/*.ts` — stage:
  - s0_genre, s1_structure, s2_characters, s3_scenes
  - c_validation_1 (skip default), mid_preview (skip default)
  - l0_l1_visual, l2_design, **assets_generate** (L2 직후 병렬, fal.ai)
  - l3_scene_plan, **decoupage** ⭐ (감독 beat→shot), l4_shots (데쿠파주 구동)
  - c_application_2 (조립 + Layer1 asset-ref 정규화 + split)
  - **l5_prompts** (T2I/TI2V 추출 + LLM fallback), **l6_images** ⭐, **l7_videos** ⭐ (fal.ai 생성)
- `src/lib/svc/pipeline/util/infer_l3.ts` — (구) Compact 사후 L3 역추론 (현재 비활성)
- `src/lib/svc/pipeline/util/asset_refs.ts` — ⭐ Layer1 canonical asset-ref 정규화
- `src/lib/svc/llm/dispatch.ts` — 4-provider dispatcher (S/V/C 축별 모델)
- `src/lib/svc/llm/{gemini,claude,openai,local,fal}.ts` — provider 구현
- `src/lib/svc/llm/raw_collector.ts`, `json_repair.ts`, `retry.ts`
- `src/lib/svc/types/pipeline.ts` — DepthLevel D1~D7, DecoupagePlan, L4Shot, AudioTrackClip, PipelineInput.skip, COMPACT_DEPTH_LEVELS=[]
- `src/lib/svc/logger/index.ts` — PipelineLogger (loadStage 포함)

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
