# V축 재설계 — L3 (Scene Plan) + L4 (Shot 3분할)

> 작성일: 2026-04-20
> 적용 대상: `experiment/svc-pipeline` (이미 구현 완료)
> 연관: `v_axis_recap.md`, `pipeline_content_gaps.md`, `linear_pipeline.md`

---

## 0. 한 줄

기존 V축 (L0~L3 평면 구조)을 **L0~L2 (글로벌) + L3 (씬 디시플린) + L4 (샷 3분할: 의도/정적/동적)**로 재설계. T2I2V 파이프라인의 정적/동적 분리 + 스토리 1:1 매칭 부재 두 갭을 동시에 메움.

---

## 1. 변경 동기 (Two gaps)

### Gap A: 글로벌만 있고 1:1 매칭 부재
- 기존 L0~L2는 모두 **프로젝트 글로벌**
- 기존 L3는 **샷 단위**라 점프 큼
- 그 사이 **씬 단위 영상 문법**이 빠짐
- 결과: 354샷 정량 분석에서 카메라 46종/앵글 41종 — 씬 내부 일관성 붕괴 추정

### Gap B: T2I2V 파이프라인의 정적/동적 미분리
- 기존 L3는 정적(lighting, composition) + 동적(camera_movement, action) 섞임
- 출력 단계(`first_frame_prompt`, `motion_prompt`)에서만 split → LLM이 매 샷 멘탈 split → 일관성 없음
- Image 생성기는 풍부한 정적 묘사 필요 (200~400자 OK)
- Video 생성기는 압축된 동적 표현 필수 (50~80자, 동사 1~2개)

---

## 2. 새 구조

```
┌──────────────────────────────────────────────────────────────┐
│                       V축 (Visual)                            │
└──────────────────────────────────────────────────────────────┘
   │
   ├── L0 (불변)              매체/렌더 — 프로젝트 1회
   ├── L1 (스타일)            art_style/shape/line — 프로젝트 1회
   ├── L2 (디자인)            palette/locations/costumes — 프로젝트 1회
   │
   ├── L3 (씬 비주얼 플랜)    ← NEW. 씬마다 1개
   │   coverage_pattern, lens_vocabulary, camera_mounting,
   │   camera_energy, lighting_arc, rhythm_profile,
   │   spatial_axis_180, dominant_pov, shot_count_target
   │
   └── L4 (샷 3분할)          ← REPLACES old L3. 샷마다 3개 sub-spec
       ├── L4a (Intent)       연출 의도 — story_beat 1:1
       ├── L4b (Static)       Image 생성기 입력 — 풍부
       └── L4c (Dynamic)      Video 생성기 입력 — 압축
```

---

## 3. 각 레이어 책임

### L3 — Scene Visual Plan (NEW)

씬 단위 영상 문법. L3는 **"이 씬을 어떻게 찍을 것인가"**의 디시플린.

```ts
interface L3SceneVisualPlan {
  scene_id: string

  coverage_pattern: 'master_inserts' | 'shot_reverse' | 'developing'
                  | 'handheld_continuous' | 'montage' | 'single_take'
  shot_count_target: number

  lens_vocabulary: number[]     // [50] 단일 / [35,85] 2종
  camera_mounting: 'tripod' | 'handheld' | 'gimbal' | 'steadicam' | 'mixed'
  camera_energy: 'static' | 'breathing' | 'kinetic'

  lighting_arc: {
    start_K: number, end_K: number,
    dominant_ratio: string, quality: 'hard' | 'soft' | 'diffused'
  }
  palette_emphasis: string[]

  dominant_pov: string
  spatial_axis_180?: { from_char: string, to_char: string }

  rhythm_profile: 'accelerating' | 'sustained' | 'decaying' | 'punctuated'
  cut_pace: 'long_takes' | 'medium' | 'rapid'
  avg_shot_seconds: number

  silence_intentional: boolean
  sound_motif_hints: string[]
  visual_intent: string   // 1줄 근거
}
```

L4 단계에서 위 디시플린 안에서만 결정 → 씬 일관성 자동 확보.

### L4a — Shot Intent

각 샷을 **왜** 만드는가. Story beat 1:1 매핑.

```ts
interface L4aShotIntent {
  shot_id: string
  scene_id: string
  story_beat_ref: number          // S3.scenes[i].scene_actions의 index
  dramatic_purpose: string        // "Kai의 망설임 노출"
  duration_seconds: number        // 5~15초 가변
  duration_justification: string  // 왜 이 길이
  audience_focus: string          // 관객 시선 지점
  shot_position_in_scene:
    | 'opening' | 'developing' | 'climax' | 'resolution' | 'transition'
}
```

### L4b — Shot Static Spec

Image 생성기(Qwen3 Image / Imagen) 입력. **첫 프레임의 모든 정적 요소**.

```ts
interface L4bShotStatic {
  shot_id: string

  // 카메라 (frame start)
  lens_mm: number              // L3.lens_vocabulary에서 선택
  shot_type: string
  camera_angle: string
  depth_of_field: 'shallow' | 'medium' | 'deep'

  // 구도
  framing: { rule, layers: {foreground, midground, background}, focal_point }

  // 조명 (frozen)
  lighting: { key_fill_ratio, color_temp_kelvin, quality, key_direction }

  // Blocking
  character_blocking: Array<{ character_id, position_in_frame, pose, gaze, asset_version }>
  prop_placement: Array<{ prop, position_in_frame, significance? }>

  // 스타일
  palette_emphasis: string[]
  texture_notes: string
  color_grading_intent: string

  // 컴파일 결과
  first_frame_prompt: string   // 200~400자 OK
}
```

### L4c — Shot Dynamic Spec

Video 생성기(Hunyuan / Kling / Veo) 입력. **5~15초 동안의 변화**. 압축 필수.

```ts
interface L4cShotDynamic {
  shot_id: string

  camera_motion: { type, direction?, speed, magnitude }
  character_motion: Array<{ character_id, verb, magnitude }>  // 동사 1~2개
  gaze_arc?: Array<{ character_id, from, to }>
  environmental_change?: Array<{ type, magnitude }>

  transition_in?: 'cut' | 'fade' | 'dissolve' | 'match_cut' | 'pre_lap' | 'l_cut'
  transition_out?: 'cut' | 'fade' | 'dissolve' | 'match_cut' | 'j_cut'

  motion_prompt: string        // 50~80자, 동사 1~2개
}
```

---

## 4. 흐름 변경 (Before / After)

### Before
```
S3 → L2 → L3 (per-shot, 정적+동적 섞임) → C2 (compose ShotSequenceItem)
                                              ├ first_frame_prompt (정적 모음)
                                              └ motion_prompt (동적 모음)
```

### After
```
S3 → L2 → L3 (per-scene 영상 문법) → L4 (per-shot, 3분할)
                                          ├ L4a Intent (story 1:1)
                                          ├ L4b Static (Image용, 풍부)
                                          └ L4c Dynamic (Video용, 압축)
                                          │
                                          ▼
                                      C2 (조립 + 검증)
                                      ShotSequenceItem
                                      ├ first_frame_prompt = L4b.first_frame_prompt
                                      └ motion_prompt = L4c.motion_prompt
```

---

## 5. 디시플린 전파 메커니즘

L3 → L4의 자유도 통제:

| L3 결정 | L4 적용 |
|--------|--------|
| `lens_vocabulary: [50]` | L4b.lens_mm은 반드시 50 |
| `camera_mounting: tripod` + `camera_energy: static` | L4c.camera_motion.type = 'static'만 |
| `lighting_arc.start_K~end_K` | L4b.lighting.color_temp_kelvin은 이 범위 |
| `lighting_arc.dominant_ratio: 4:1` | L4b.lighting.key_fill_ratio = 4:1 |
| `shot_count_target: 6` | L4 샷 수 = 6 ±1 |
| `spatial_axis_180: {Kai, Oracle}` | L4b.character_blocking gaze 일관 |
| `avg_shot_seconds: 8` | L4a.duration_seconds 평균 8 ±2 |

→ LLM 자유도 80% → 20% 감소 → 씬 일관성 ↑

---

## 6. 구현 파일 매핑

| 파일 | 변경 |
|-----|------|
| `src/lib/types/pipeline.ts` | `L3ShotPlan` 제거, `L3SceneVisualPlan` + `L4aShotIntent` + `L4bShotStatic` + `L4cShotDynamic` + `L4Shot` 추가. `MidPreview.v_recommendations`에 `L3_scene_strategy` + `L4_shot_recipe` (was `L3_recipe`) |
| `src/lib/pipeline/stages/l3_scene_plan.ts` | **신규** (씬 단위 비주얼 플랜) |
| `src/lib/pipeline/stages/l4_shots.ts` | **신규** (씬별 호출, 3분할 출력) |
| `src/lib/pipeline/stages/l3_shots.ts` | **삭제** |
| `src/lib/pipeline/stages/mid_preview.ts` | 프롬프트 업데이트 (L3_scene_strategy + L4_shot_recipe) |
| `src/lib/pipeline/stages/c_application_2.ts` | 시그니처: `l3Shots` → `l3ScenePlans, l4Shots`. 프롬프트 업데이트 |
| `src/lib/pipeline/index.ts` | orchestrator에 L3/L4 단계 추가 |

로그 파일 번호:
- `10_L3_scene_plans.json` (NEW)
- `11_L4_shots.json` (NEW, replaces old `10_L3.json`)
- `12_C_application_2.json` (was `11`)
- `13_shot_sequence.json` (was `12`)

---

## 7. L2 영향 (왜 별도 변경 없는가)

L2는 그대로. 이유:
- L2는 프로젝트 글로벌 vocabulary (palette/locations/costumes)
- L3가 L2.global_palette에서 씬별 emphasis 선택
- L4가 L2.locations / L2.costumes에서 샷별 인용
- L2 자체에는 씬/샷 정보 불필요

(추후 L2에 `motion_philosophy` 같은 글로벌 모션 기조를 넣을 여지는 있음. 지금은 미구현.)

---

## 8. 비용 추정

추가된 LLM 호출:
- L3 (씬 비주얼 플랜): 1회, 모든 씬 한꺼번에
- L4 (샷 3분할): **씬당 1회** (씬 디시플린 명확화 위해 분리)
  - 45씬 = 45 Gemini 호출 추가
  - 씬당 ~5K 입력 + ~10K 출력 = 15K 토큰
  - 45회 × 15K = 675K 토큰
  - Gemini Flash 비용: in 200K × $0.075/1M + out 475K × $0.30/1M ≈ $0.16

대신 절감:
- 기존 L3 (단일 호출, 354샷) 출력 1.3M tok → $0.40
- 새 L4 분산 호출 + L3 scene plan 추가 → ~$0.20

**비용 비슷하거나 약간 절감** + 씬 일관성/디시플린 확보.

---

## 9. Compact Mode (D1~D3 — 구현 완료 2026-04-20)

### 9.1 동기

D1~D3 짧은 영상에선 L3 (씬 비주얼 플랜) 효용이 낮음:
- L3의 가치는 **씬 간 대비** (씬1=핸드헬드, 씬2=트라이포드)
- 1~5 씬짜리 영상엔 대비할 기회 자체가 없음
- 단일 씬 = L2가 곧 디시플린 (L3는 사실상 L2의 복사본)
- 고정 오버헤드 비중 ↑
- 향후 D1/D2는 특화 파이프라인 분리 예정. 현재는 Compact Mode가 D1~D3 통합 커버

### 9.2 분기 조건

```ts
isCompactDepth(S0.depth_level)  →  Compact Mode
// COMPACT_DEPTH_LEVELS = ['D1', 'D2', 'D3']
```

`types/pipeline.ts`의 `isCompactDepth()` 헬퍼로 결정. depth_level 기반이라 명확.

### 9.3 동작

```
일반 모드 (씬 ≥ 4):
  L2 → L3 (1 LLM 호출, 모든 씬) → L4 (씬별 호출, N회) → C2

Compact 모드 (씬 ≤ 3):
  L2 → [L3 스킵] → L4 compact (씬별 호출, 디시플린 직접 결정) → C2
```

### 9.4 L4 두 모드

```ts
runL4Shots(s0, s2, s3, l1, l2, l3?: L3SceneVisualPlan[], midPreview, logger)
```

- `l3` 제공: 디시플린 준수 모드 (현재 구현)
- `l3` undefined: **compact mode** — L4 프롬프트에 "L3 미제공. 직접 결정. lens_vocabulary / camera_mounting / lighting_arc / coverage 모두 샷에서 자체 결정" 명시

### 9.5 Inferred L3 (다운스트림 호환)

Compact mode 결과에서도 L3 형태 데이터를 사후 추출:

```
L4 완료 후:
  각 씬에 대해 inferred L3 생성
  - lens_vocabulary: 해당 씬 L4b.lens_mm의 unique 집합
  - camera_mounting: L4c.camera_motion.type에서 역추론
  - lighting_arc: L4b.lighting의 시작/끝 색온도
  - shot_count_target: 실제 샷 수
  - coverage_pattern: shot_type 분포로 역추론
  - 등

PipelineResult.L3 = inferred (실제 호출은 안 했지만 데이터 채움)
```

→ C2와 다운스트림 분석 코드 변경 없음.

### 9.6 효과 추정

| 항목 | 일반 모드 | Compact (1분, 2씬) |
|-----|---------|-----------------|
| LLM 호출 | L3 1회 + L4 N회 | L4 N회만 (L3 스킵) |
| 시간 | -10~20초 (L3 1회 절감) | |
| 비용 | -$0.02~0.05 | (짧은 영상에선 비중 큼) |
| 출력 다양성 | L3 디시플린 제약 받음 | L4가 더 자유 |

### 9.7 코드 변경 영향 (실제 구현)

| 파일 | 변경 |
|-----|------|
| `types/pipeline.ts` | `COMPACT_DEPTH_LEVELS`, `isCompactDepth()` 헬퍼 추가. D1/D2도 DepthLevel에 추가 |
| `pipeline/index.ts` | `isCompactDepth(S0.depth_level)`로 분기. compact면 L3 stage 스킵, L4 호출 후 `inferL3FromL4Shots()`로 사후 채움 |
| `stages/l4_shots.ts` | `scenePlans` 인자 `L3SceneVisualPlan[] \| null` (null = compact). 프롬프트 자체에서 디시플린 직접 결정 모드 분기 |
| `util/infer_l3.ts` | **신규** — L4 결과에서 씬별 lens/mount/energy/lighting_arc/coverage 등 역추론 |
| `stages/s0_genre.ts` | D1/D2 가이드 + 시간→D 매핑 (5~15s→D1, 15~60s→D2) |
| `stages/s1_structure.ts` | D1/D2 구조 가이드 (D1=구조 없음, D2=미니) |
| `stages/s2_characters.ts` | D1/D2 캐릭터 가이드 (D1=1명 or 사물, D2=1~2명) |
| `stages/s3_scenes.ts` | sceneCountHintMap에 D1/D2 추가 |
| `stages/c_application_2.ts` | 시그니처 무변경 (compact일 땐 inferred L3 받음) |
| `page.tsx` | L3 stage 라벨에 "D4+, Compact일 땐 스킵" 명시 |

로그 파일:
- 일반 모드: `10_L3_scene_plans.json`
- Compact 모드: `10_L3_scene_plans_inferred.json` (note 필드 포함)
- `11_L4_shots.json`에 `compact_mode: boolean` 메타 포함

### 9.8 검증 필요 (실행 후)

- [ ] D3 (1~5분) Compact Mode 결과물의 씬 내 일관성 측정
- [ ] D4 일반 모드와 비교 (전환점 적절성)
- [ ] Inferred L3가 실제 L3와 얼마나 유사한가 (D3 케이스로 양쪽 다 돌려 비교)
- [ ] D1/D2 케이스 실제 작동 확인 (15초/30초 영상)
- [ ] dual-axis 마이그레이션

### 9.9 대안 (기각)

- ❌ **L3+L4 단일 호출 (combined mode)**: 출력 크기 증가, schema 복잡
- ❌ **L3 default 룰 하드코딩**: 보수적/단조로움, 다양성 손실
- ❌ **Mid Preview가 L3 필드 직접 채움**: Mid Preview 스키마 복잡, 사용자 협상 UX 변경 필요

채택: **L4 compact mode + Inferred L3 사후 채움**. 가장 유연하면서 다운스트림 호환.

---

## 10. 미연결 / 후속 과제

- [ ] Compact Mode 구현 (§9 — 설계 동의 후 대기)
- [ ] dual-axis도 같은 구조로 마이그레이션 (현재 svc-pipeline만)
- [ ] L4 결과 정량 검증 — 씬 내 lens/camera 일관성 측정
- [ ] L3 scene_plan과 S2.character의 voice/personality 연동 (gaze/pose에 반영)
- [ ] action_budget validator를 L3 단계에 통합 (shot_count_target 산정 자동화)
- [ ] page.tsx UI에 L3/L4 단계 노출 ✅ (라벨만 — 상세 뷰는 미구현)
- [ ] 비교 실험: 새 구조 vs 기존 구조 결과물 (씬 내부 일관성 정량 비교)
- [ ] 비교 실험: 일반 모드 vs Compact 모드 (짧은 영상에서)

---

## 11. 명명 결정 기록

- 사용자 요청: "L2.5 대신 L3로 해주고 L4a, L4b, L4c 계층 따로 만들어줘"
- 결과: L3 (씬 플랜), L4a/b/c (샷 3분할) 네이밍 채택
- 기존 L3ShotPlan은 폐기 (백워드 호환 없음 — 실험 단계라 부담 없음)
- `MidPreview.L3_recipe`도 `L3_scene_strategy` + `L4_shot_recipe` 2개로 분리 (의미 명확화)

---

## 부록: 관련 문서

- `dev/writer_advencement/v_axis_recap.md` — 재설계 직전 상태
- `dev/writer_advencement/pipeline_content_gaps.md` — 갭 분석 (특히 §4 추가 수용 개념)
- `dev/writer_advencement/dual_axis_model.md` — S/V/C 이론
- `dev/writer_advencement/linear_pipeline.md` — 선형 파이프라인 설계
- `dev/writer_advencement/pipeline_diagrams.md` — 구현체 도식 (재설계 후 업데이트 필요)
- `experiment/svc-pipeline/README.md` — 파이프라인 README (재설계 후 업데이트 필요)
