# Tale-Studio Writer — Facet · 파일 · 프롬프트 인벤토리

> 목적: cowork 전 writer 파이프라인의 **단계(facet) 이름 정렬(align)** 작업용 레퍼런스.
> 생성: 2026-06-08 · 저장 위치: `/home/user/` (repo 밖 — 깃 미추적/업로드 안 됨).
> source-of-truth: `src/lib/writer/pipeline/steps.ts` 의 `WRITER_STEPS` (웹훅 체이닝 캐넌) +
> `src/lib/writer/pipeline/index.ts` 의 `_runPipelineInner` (로컬 resume path, 동일 순서 미러).

---

## 1. 핵심 문제 — 한 facet, 5가지 이름이 따로 논다

코드에 `facet` 리터럴은 **없음**. "facet" = writer 파이프라인의 **단계(stage)** 개념.
한 단계가 아래 6개 축으로 불리는데 서로 안 맞는다(drift).

| 축 | 예시 (genre 단계) | 정합성 |
|---|---|---|
| ① 파일명 | `s0_genre.ts` (레거시 `S/L/C`+번호) | ❌ 일부만 시맨틱 |
| ② step key (`WRITER_STEPS[].key`) | `genre` (film-craft) | ⚠️ |
| ③ 출력필드 (`WriterRunState`) · 타입 | `genre` · `Genre` | ✅ |
| ④ 진입함수 | `runGenre` | ✅ |
| ⑤ 로그/캐시 파일 · `markStage` 라벨 | `02_genre.json` · `genre` | ⚠️ 번호 prefix |
| ⑥ **프롬프트 자기-라벨** | `"S0(장르/톤) 디자이너"` | ❌ 레거시 코드 |

---

## 2. 마스터 정렬 표 (텍스트 13단계 + 미디어 3단계)

| # | 파일 (`pipeline/stages/`) | step key | 진입함수 | 출력필드 · 타입 | 로그파일 | 프롬프트 자기-라벨 (line) |
|---|---|---|---|---|---|---|
| 1 | `s0_genre.ts` | `genre` | `runGenre` | `genre` · `Genre` | `02_genre.json` | **S0**(장르/톤) 디자이너 (`:9`) |
| 2 | `s1_structure.ts` | `narrativeStructure` | `runNarrativeStructure` | `narrativeStructure` · `NarrativeStructure` | `03_narrativeStructure.json` | **S1**(내러티브 구조) 디자이너 (`:9`) |
| 3 | `s2_characters.ts` | `characters` | `runCharacters` | `characters` · `Characters` | `04_characters.json` | **S2**(캐릭터/관계) 디자이너 (`:15`) |
| 4 | `s3_scenes.ts` | `scenes` | `runScenes` | `scenes` · `Scenes` | `05_scenes.json` | **S3**(씬 브레이크다운) 디자이너 (`:28`) ⟶refs S0/S1/S2 |
| 5 | `c_validation_1.ts` | `storyCheck` | `runStoryCheck` | `storyCheck` · `StoryCheckReport` | `06_storyCheck.json` | 핍진성 검증자 (`:38`) ⟶refs **S0~S3** |
| 6 | `mid_preview.ts` | `midPreview` | `runMidPreview` | `midPreview` · `MidPreview` | `07_midPreview.json` | **S↔V** 변환 첫 협상자 (`:24`) ⟶refs S0~S3 |
| 7 | `l0_l1_visual.ts` | **`visualFormat`** ⚠️ | `runRenderFormatArtDirection` | `renderFormat`+`artDirection` · `RenderFormat`/`ArtDirection` | `08_renderFormat_artDirection.json` | renderFormat/artDirection 확정 (`:19`) |
| 8 | `l2_design.ts` | `productionDesign` | `runProductionDesign` | `productionDesign` · `ProductionDesign` | `09_productionDesign.json` | V축 **L2**(프로덕션 디자인) 디자이너 (`:25`) ⟶refs S2 |
| 9 | `l3_scene_plan.ts` | `sceneCinematography` | `runSceneCinematography` | `sceneCinematography` · `SceneCinematography[]` | `10_sceneCinematography.json` | V축 **L3**(씬 비주얼 플랜) 설계자 (`:50`) ⟶refs S3,L0~ |
| 10 | `decoupage.ts` | `decoupage` | `runDecoupage` | `decoupage` · `DecoupagePlan` | `10b_decoupage.json` ⚠️ | 영화 감독·데쿠파주(découpage) (`:25` 모듈 const) |
| 11 | `l4_shots.ts` | `shotDesign` | `runShotDesign` | `shotDesign` · `ShotDesign[]` | `11_shotDesign.json` | V축 **L4**(샷 실행) 디자이너 (`:93`) ⟶refs L3 |
| 12 | `c_application_2.ts` | **`shotCheck`** ⚠️ | `runShotCheck` | `shotSequence`+`shotCheck` · `ShotSequence`/`ShotCheckReport` | `12_shotCheck.json` + `13_shotSequence.json` | gen: **S+V** 마지막 단계 디자이너 (`:51`) / val: 정합성 검증 (`:225`) |
| 13 | `l5_prompts.ts` | `renderPrompts` | `runRenderPrompts` | `renderPrompts` · `RenderPromptsOutput` | `14_renderPrompts.json` | **T2I** 프롬프트 디자이너 (`:208`) + **TI2V** 프롬프트 디자이너 (`:245`) ⟶refs L2/C2/L4 |
| — | `assets_generate.ts` | (API 전용) | `runAssetsGenerate` | — · `AssetsManifest` | `14b_assets.json` ⚠️ | (레퍼런스 이미지 생성) |
| — | `l6_images.ts` | (API 전용) | `runShotImages` | — · `ShotImagesOutput` | `15_shotImages.json` | (L5 프롬프트 소비) |
| — | `l7_videos.ts` | (API 전용) | `runShotVideos` | — · `ShotVideosOutput` | `16_shotVideos.json` | (L5 프롬프트 소비) |

> 참고: `WRITER_STEPS` 는 1~13(텍스트/프롬프트)만 자동 실행. 14b/15/16(에셋·이미지·영상)은
> 별도 API phase(`/api/writer/generate|resume/*`) 로 분리. `00_input.json` 은 입력 스냅샷(index.ts).

---

## 3. 드리프트 핫스팟 (정렬 우선순위)

1. **#7 (visualFormat)** — step key `visualFormat` ≠ 출력 `renderFormat`/`artDirection` ≠ 파일 `l0_l1_visual` ≠ markStage/raw 라벨 `renderFormat_artDirection`. **이름 4개**가 전부 다름.
2. **#12 (shotCheck)** — step key `shotCheck` 인데 `shotSequence` 도 같이 생성(로그도 `12_`+`13_` 2개). `shotSequence` 가 별도 단계처럼 보이지만 같은 파일/함수.
3. **파일명 컨벤션 혼용** — `s0~s3` / `c_validation_1` / `c_application_2` / `l0~l7` (레거시 prefix) vs `decoupage` / `mid_preview` / `assets_generate` (시맨틱). 일관성 없음.
4. **로그 번호** — `02`부터 시작(`01` 없음) + `10b` / `14b` 알파벳 suffix. 비순차.
5. **프롬프트 라벨 3종 혼재** — 레거시 코드(`S0`/`S1`/`S2`/`S3`/`L2`/`L3`/`L4`) + 시맨틱(`renderFormat`/`decoupage`/`T2I`) + 서술(`검증자`/`협상자`).

---

## 4. 프롬프트 위치 — 전부 stage 파일 *인라인* (별도 `prompts/` 디렉토리 없음)

각 stage의 `systemInstruction` / `system` / `SYSTEM_INSTRUCTION` + `userPrompt`:

- `s0_genre.ts:9` · `s1_structure.ts:9` · `s2_characters.ts:15` · `s3_scenes.ts:28`
- `c_validation_1.ts:38` · `mid_preview.ts:24` · `l0_l1_visual.ts:19` · `l2_design.ts:25`
- `l3_scene_plan.ts:50` · `decoupage.ts:25` (모듈 const) · `l4_shots.ts:93`
- `c_application_2.ts:51` (genSystem) + `c_application_2.ts:225` (valSystem) — **2개**
- `l5_prompts.ts:208` (T2I) + `l5_prompts.ts:245` (TI2V) — **2개**

**프롬프트 내 facet 상호참조** (rename 시 함께 수정 필요):
`S0~S3` (c_validation_1, mid_preview) · `S0/S1/S2` (s3_scenes) · `L0~` (l3_scene_plan) ·
`S↔V` (mid_preview) · `S+V` (c_application_2) · `L2`/`C2`/`L4` (l5_prompts).

---

## 5. writer가 쓰는 전체 파일 (역할별)

### 오케스트레이션 / 상태
- `src/lib/writer/pipeline/steps.ts` — 웹훅 체이닝 엔진, `WRITER_STEPS` 캐넌
- `src/lib/writer/pipeline/index.ts` — 로컬 `runPipeline` / `_runPipelineInner` (resume, 파일 캐시)
- `src/lib/writer/run-store.ts` — `writer_runs` DB CRUD (createRun/saveRunState/markCompleted/…)
- `src/lib/writer/use-writer-status.ts` — 클라이언트 진행률 폴링 훅 (+ keepalive)
- `src/lib/writer/adapters.ts` — 산출물 ↔ DB/스토어 어댑터

### Stage (16개, `src/lib/writer/pipeline/stages/`)
`s0_genre.ts` · `s1_structure.ts` · `s2_characters.ts` · `s3_scenes.ts` ·
`c_validation_1.ts` · `mid_preview.ts` · `l0_l1_visual.ts` · `l2_design.ts` ·
`l3_scene_plan.ts` · `decoupage.ts` · `l4_shots.ts` · `c_application_2.ts` ·
`l5_prompts.ts` · `assets_generate.ts` · `l6_images.ts` · `l7_videos.ts`

### 타입 (`src/lib/writer/types/pipeline.ts`)
facet 출력 타입:
`Genre` · `NarrativeStructure` · `Characters` · `Scenes` · `StoryCheckReport` ·
`MidPreview` · `RenderFormat` · `ArtDirection` · `ProductionDesign` · `SceneCinematography` ·
`DecoupagePlan` · `ShotDesign` · `ShotSequence` · `ShotCheckReport` · `RenderPromptsOutput` ·
`AssetsManifest` · `ShotImagesOutput` · `ShotVideosOutput`
하위 타입: `StoryCharacter` · `StoryRelationship` · `StoryScene` · `DecoupageShot` ·
`SceneDecoupage` · `ShotIntent` · `ShotStaticSpec` · `ShotDynamicSpec` · `ShotSequenceItem` ·
`T2IPrompt` · `TI2VPrompt` · `ShotGenerationPrompts` · `AssetItem` · `ShotImageResult` ·
`ShotVideoResult` · `ValidationIssue` · `PipelineInput` · `PipelineResult` ·
`DepthLevel` · `ShotOperation` · `ShotFunction` · `RhythmRole` 등

### LLM 어댑터 (`src/lib/writer/llm/`)
`dispatch.ts` (provider 라우팅 + `generateJson`) · `claude.ts` · `gemini.ts` · `openai.ts` ·
`local.ts` · `fal.ts` (이미지/영상) · `json_repair.ts` · `retry.ts` · `raw_collector.ts`

### 로깅 (`src/lib/writer/logger/index.ts`)
`markStage` / `saveStage` / `flushRawLlm` / `saveLlmCall` (Vercel 에선 FS 쓰기 no-op)

### 유틸 (`src/lib/writer/pipeline/util/`)
`persist_manifest.ts` (characters/locations/scenes/shots DB 기록 — delete-then-insert 멱등) ·
`persist_design_tokens.ts` · `infer_l3.ts` (compact 모드 sceneCinematography 역추론) · `asset_refs.ts`

### 검증기 (`src/lib/writer/pipeline/validators/`)
`action_budget.ts` (씬 액션 예산) · `causality.ts` (인과 검증)

### API 라우트 (`src/app/api/writer/`)
`start/route.ts` · `step/route.ts` · `status/[projectId]/route.ts` · `watchdog/route.ts` ·
`logs/[projectId]/route.ts` · `generate/{assets,images,videos}/route.ts` ·
`resume/{assets,images,videos}/route.ts`

---

## 6. ⚠️ rename 시 함께 바꿔야 정합되는 지점 (한 facet당 체크리스트)

1. 파일명 + `steps.ts` · `index.ts` 의 `import` 경로
2. 진입함수명 (`runX`)
3. `WriterRunState` 필드 + `has()` 가드 + step `key`
4. 출력 타입명 (`types/pipeline.ts`) + 소비처 (`persist_manifest.ts`, `adapters.ts`, director-sync 등)
5. `markStage` / `flushRawLlm` 라벨 (logger + status 라우트 진행률 표기)
6. **`saveStage` / `loadOrRun` 캐시 파일명** ← ⚠️ 로컬 path(`index.ts`)의 **resume 캐시 키**.
   바꾸면 기존 캐시 무효화(재실행 시 처음부터). 웹훅 path는 DB `state` jsonb라 무관.
7. 프롬프트 자기-라벨(⑥) + **프롬프트 내 상호참조**(`S0~S3` 등, §4)

---

## 7. 권장 정렬 방향 (초안 — 아래 **§8 제안 네이밍**이 최신/권장안)

변경량이 가장 적은 기준 = **③출력필드(film-craft 시맨틱)** 에 ①파일명 · ⑥프롬프트 · ⑤로그를 맞추기.

| 현재 파일 → 제안 파일(예) | step key 정렬 |
|---|---|
| `s0_genre` → `genre` | `genre` (그대로) |
| `s1_structure` → `narrative_structure` | `narrativeStructure` |
| `s2_characters` → `characters` | `characters` |
| `s3_scenes` → `scenes` | `scenes` |
| `c_validation_1` → `story_check` | `storyCheck` |
| `mid_preview` → `mid_preview` (유지) | `midPreview` |
| `l0_l1_visual` → `visual_format` | `visualFormat` → 또는 `renderFormatArtDirection` 로 통일 |
| `l2_design` → `production_design` | `productionDesign` |
| `l3_scene_plan` → `scene_cinematography` | `sceneCinematography` |
| `decoupage` → `decoupage` (유지) | `decoupage` |
| `l4_shots` → `shot_design` | `shotDesign` |
| `c_application_2` → `shot_check` | `shotCheck` (+ `shotSequence` 동시생성 주석화) |
| `l5_prompts` → `render_prompts` | `renderPrompts` |
| `l6_images` → `shot_images` · `l7_videos` → `shot_videos` · `assets_generate` (유지) | (API 전용) |

프롬프트 자기-라벨도 `S0(장르/톤)` → `genre(장르/톤)` 식으로, 상호참조 `S0~S3` → `genre~scenes` 로 통일.

---

## 8. 제안 네이밍 (권장안)

목표(우선순위순):
1. **LLM이 변수명으로 오해하지 않고**, 이름이 **실제 내용과 일치**해 context가 정렬됨.
2. coworker가 이름만 보고 바로 파악.
3. **변수명 = 프롬프트 내 facet 이름**(동일 토큰).

핵심 관찰: **static/dynamic 구분이 이미 코드에 존재** — `ShotStaticSpec`(정적, I2I `first_frame_prompt`) / `ShotDynamicSpec`(동적, I2V `motion_prompt`), `T2IPrompt`/`TI2VPrompt`, `ShotImagesOutput`/`ShotVideosOutput`. 이를 **Visual 전체의 조직 원리로 끌어올리고 이름을 일관되게 펴는 것**이 본 제안.

컨벤션: 변수/필드/step key = `camelCase`, 타입 = `PascalCase`, 파일 = `snake_case`(기존 유지).
프롬프트엔 **camelCase 토큰을 그대로** 박는다 — 예: `당신은 storyBrief(장르·톤·감정·런타임·scope) 디자이너이다`.

### 8.1 택소노미 (이 구조를 이름에 반영)

```
Writer
├── Story  (서사 — 매체 무관, "무엇이 일어나는가")
│     storyBrief · narrativeStructure · characters · scenes · storyCheck
│     └─→ visualBrief  (Story→Visual 다리)
└── Visual (영상화 — "어떻게 보이고 움직이는가")
    ├── Look      (전역 정적 룩):  renderFormat · artDirection · productionDesign
    ├── Coverage  (씬 단위 플랜):  sceneCinematography · shotBreakdown
    └── Shot      (샷 단위):
        ├── intent                연출 의도
        ├── STATIC (정적 / I2I):  staticSpec → staticPrompt → shotImage   (+ referenceAssets)
        └── DYNAMIC(동적 / I2V):  dynamicSpec → dynamicPrompt → shotVideo
```

정렬 체인(이름만 펴면 한눈에): `staticSpec → staticPrompt → shotImage` (I2I) · `dynamicSpec → dynamicPrompt → shotVideo` (I2V)

### 8.2 "Depth" → `scope`

`depth_level`(D1~D7) = *런타임 기반 작품 규모/길이 등급*("한 순간 Spark → 장편 Epic"). "depth"는 깊이/디테일로 오해 → 규모를 뜻하는 단어로.

| 후보 | 평가 |
|---|---|
| **`scope`** ✅ 권장 | 규모/범위. 충돌 없음, 한 단어 |
| `runtimeTier` | 가장 명시적("런타임 기반 등급")이나 길다 |
| `scale` ❌ | 충돌 — cinematography `scale`=샷 크기(EWS~ECU) |

추가: 값도 `D3` 같은 코드 대신 **이름 자체**로 노출하면 LLM이 의미를 바로 읽음. ⚠️ 단 현재 등급명 **`Beat`/`Arc`는 story 용어(scene beats / character arc)와 충돌** → 노출 시 그 둘만 변경(예: `Beat`→`snippet`, `Arc`→`vignette`). 타입 `DepthLevel`→`Scope`, 필드 `depth_level`→`scope` (`Genre`/`ShotSequence` 양쪽).

### 8.3 전체 리네임 표 (canonical token = 변수 = 프롬프트 facet)

#### Story
| canonical (신규) | 기존 변수 / step key | 기존 파일 | 콘텐츠 · 변경 사유 |
|---|---|---|---|
| **`storyBrief`** | `genre` | `s0_genre` | genre+tone+emotion+runtime+scope. "genre"는 좁아 LLM이 장르만 출력 |
| `narrativeStructure` | `narrativeStructure` | `s1_structure` | 유지 (정확) |
| `characters` | `characters` | `s2_characters` | 유지 (관계·서브텍스트 포함) |
| `scenes` | `scenes` | `s3_scenes` | 유지 |
| `storyCheck` | `storyCheck` | `c_validation_1` | 변수 유지, 파일 → `story_check` |
| **`visualBrief`** | `midPreview` | `mid_preview` | Story→Visual 변환 추천(룩/커버리지/샷 힌트)+color script+난이도. "midPreview" 의미 불명 |

#### Visual · Look (전역 정적 룩)
| canonical | 기존 | 파일 | 사유 |
|---|---|---|---|
| stage **`look`** | step `visualFormat` | `l0_l1_visual` | renderFormat+artDirection 묶음. step key가 출력과 불일치 → 통일 (markStage 라벨 `renderFormat_artDirection`→`look`) |
| `renderFormat` | `renderFormat` | (위) | 유지 (medium/res/fps/aspect) |
| `artDirection` | `artDirection` | (위) | 유지 (스타일 바이블) |
| `productionDesign` | `productionDesign` | `l2_design` | 유지 (팔레트/로케이션/의상/vfx). 파일 → `production_design` |

#### Visual · Coverage (씬 단위 플랜)
| canonical | 기존 | 파일 | 사유 |
|---|---|---|---|
| `sceneCinematography` | `sceneCinematography` | `l3_scene_plan` | 유지 (정확). 파일 → `scene_cinematography` |
| **`shotBreakdown`** | `decoupage` | `decoupage` | beat→샷 분해 목록. "decoupage"는 비전공/LLM엔 생소 → 투명 용어 (formal명 decoupage는 주석 유지) |

#### Visual · Shot (정적/동적 명시)
| canonical | 기존 | 파일 | 사유 |
|---|---|---|---|
| `shotDesign` | `shotDesign` | `l4_shots` | 유지 (intent+static+dynamic 묶음). 파일 → `shot_design` |
| `intent` / `staticSpec` / `dynamicSpec` | `intent`/`static_spec`/`dynamic_spec` | (위) | **이미 정확 — 유지.** 이 static/dynamic을 바깥으로 전파 |
| `shotSequence` | `shotSequence` | `c_application_2` | 변수 유지, 파일 → `shot_sequence` |
| `shotCheck` | `shotCheck` | `c_application_2`(공유) | 검증. 파일 위와 합침 (assembly+check 한 파일) |
| `renderPrompts` | `renderPrompts` | `l5_prompts` | 유지 (컨테이너). 파일 → `render_prompts` |
| **`staticPrompt`** | `t2i` / `T2IPrompt` | (위) | 정적/I2I 프롬프트. static 체인 정렬 |
| **`dynamicPrompt`** | `ti2v` / `TI2VPrompt` | (위) | 동적/I2V 프롬프트 (`motion_prompt` 필드와 일치) |

#### Visual · Generation (출력)
| canonical | 기존 | 파일 | 사유 |
|---|---|---|---|
| **`referenceAssets`** | `assets` | `assets_generate` | 캐릭터/로케이션 레퍼런스 이미지(I2I refs). "assets" 과부하 → 구체화. 파일 → `reference_assets` |
| `shotImages` | `shotImages` | `l6_images` | 유지 (정적/첫프레임 출력). 파일 → `shot_images` |
| `shotVideos` | `shotVideos` | `l7_videos` | 유지 (동적 출력). 파일 → `shot_videos` |

### 8.4 프롬프트 치환 빠른 표 (L/S 코드 → 신규 토큰)

- `L0`/`L1` → `renderFormat`/`artDirection` (=`look`) · `L2` → `productionDesign` · `L3` → `sceneCinematography`
- (decoupage) → `shotBreakdown` · `L4` → `shotDesign` · `L5` → `renderPrompts` · `L6` → `shotImages` · `L7` → `shotVideos`
- 상호참조: `S0~S3` → `storyBrief~scenes` · `S↔V` → `story↔visual` · `S+V` → `story+visual` · `C1`/`C2` → `storyCheck`/`shotCheck`
- 프롬프트 자기-라벨: `S0(장르/톤) 디자이너` → `storyBrief 디자이너`, `V축 L3(씬 비주얼 플랜) 설계자` → `sceneCinematography 설계자` 등

### 8.5 같이 정리할 함정 (cleanup)

- **`Genre.format`**(`types/pipeline.ts:192`, `"horizontal_16:9"`) = Visual 속성이 Story에 샌 것 + `renderFormat.aspect_ratio`와 **중복**. → `storyBrief`에선 제거하거나 `aspectHint`로, 소유권은 `renderFormat`.
- **`c_application_2` 한 파일이 2 facet 생성**(shotSequence+shotCheck) → 파일 `shot_sequence.ts` 하나로, 함수/필드는 둘 다 명시.
- **로그 파일 번호**(`02`~`16`, `10b`/`14b`)는 로컬 path resume 캐시 키(`index.ts` `loadOrRun`). 이름/번호 변경 시 기존 캐시 무효화(재실행 처음부터) — 웹훅 path(DB `state` jsonb)는 무관.
- `WriterRunState` 필드 · `has()` 가드 · step `key` · `markStage`/`flushRawLlm` 라벨 · `saveStage`/`loadOrRun` 파일명 · 소비처(`persist_manifest`/`adapters`/director-sync) — 한 facet 리네임 시 §6 체크리스트대로 동시 변경.

---

## 9. 변수 워크시트 (Before → After 결정용)

> **After 열은 비워둠** — 직접 결정해 채우기. (제안값은 §8 참고)
> 경로 약어: 스테이지 = `src/lib/writer/pipeline/stages/<file>.ts` · 타입 = `src/lib/writer/types/pipeline.ts` · 스텝 = `src/lib/writer/pipeline/steps.ts` · `[L#]`=프롬프트 내 레거시 코드.

| 변수명 Before | After | 사용위치 (프롬프트) | 사용위치 (코드) | 변수 의미 (실제 쓰이는 의미) |
|---|---|---|---|---|
| `genre` |  | 자기라벨 `s0_genre:9` "S0(장르/톤) 디자이너" + D1~D7 정의블록 `:11-31`; 타 단계서 `S0`로 참조(s3_scenes, c_validation_1, mid_preview) | `WriterRunState.genre`(steps:65) · step key `genre`(:111) · `runGenre`(s0_genre) · type `Genre`(:185) · log `02_genre.json` | **[Story]** 스토리 추출: 장르·서브장르·톤[]·타깃감정[]·런타임초·scope·format. 파이프라인 최상위 "창작 브리프"(이름은 좁지만 톤/스케일까지 결정) |
| `narrativeStructure` |  | `s1_structure:9` "S1(내러티브 구조) 디자이너"; `S1`로 참조(s3_scenes:74) | field(steps:66) · key(:121) · `runNarrativeStructure`(s1_structure) · type `NarrativeStructure`(:195) · log `03_` | **[Story]** 구조유형(기승전결/3막/영웅서사)·acts[]·POV·테마·중심극적질문(CDQ)·전환점 위치 |
| `characters` |  | `s2_characters:15` "S2(캐릭터/관계) 디자이너"; `S2`로 참조(l2_design:31, s3_scenes) | field(:67) · key(:131) · `runCharacters`(s2_characters) · type `Characters`(:235) · `persist_manifest`(characters) · log `04_` | **[Story]** 캐릭터[](아크/동기 want·need·wound/외형)·관계[]·서브텍스트 노트[] |
| `scenes` |  | `s3_scenes:28` "S3(씬 브레이크다운) 디자이너" | field(:68) · key(:141) · `runScenes`(s3_scenes) · type `Scenes`(:264) · `persist_manifest`(scenes) · log `05_` | **[Story]** 씬[](로케이션/시간/등장인물/목적/감정비트/대사요약/`scene_actions`=분할 전 액션)+총추정초 |
| `storyCheck` |  | `c_validation_1:38` "핍진성 검증자"(S0~S3 검토) | field(:69) · key `storyCheck`(:151) · `runStoryCheck`(c_validation_1) · type `StoryCheckReport`(:283) · skip `skip.validation1` · log `06_` | **[Story·검증]** 인과사슬·CDQ 명료도·클리셰 카운트·이슈[]·passed (skip 시 `emptyC1Report`) |
| `midPreview` |  | `mid_preview:24` "S↔V 변환의 첫 협상자"(S0~S3 기반) | field(:70) · key `midPreview`(:165) · `runMidPreview`(mid_preview) · type `MidPreview`(:304) · skip `skip.midPreview` · log `07_` | **[Story→Visual 다리]** L0~L4 비주얼 추천(`v_recommendations`)+color_script+감정아크 시각화+제작난이도. 사실상 Visual 진입 브리프 |
| `renderFormat` |  | `l0_l1_visual:19` "Visual 축 renderFormat(매체/포맷)…확정" | field(:73) · **step key `visualFormat`**(:187, artDirection와 공동생성) · `runRenderFormatArtDirection`(l0_l1_visual) · type `RenderFormat`(:322) · `persist_design_tokens` · log `08_renderFormat_artDirection` | **[Visual/Look]** 매체·해상도·fps·aspect_ratio·렌더링기법. 전역 출력 스펙 |
| `artDirection` |  | `l0_l1_visual:19` (동일 프롬프트, "artDirection(비주얼 스타일)") | field(:73) · 같은 step `visualFormat` · type `ArtDirection`(:330) · `persist_design_tokens` · log `08_`(공유) | **[Visual/Look]** art_style·shape_language·line_quality·캐릭터비율·텍스처철학. 전역 스타일 바이블 |
| `productionDesign` |  | `l2_design:25` "V축 L2(프로덕션 디자인) 디자이너"(S2 참조) | field(:75) · key `productionDesign`(:197) · `runProductionDesign`(l2_design) · type `ProductionDesign`(:338) · `persist_design_tokens`+`persist_manifest`(locations) · log `09_` | **[Visual/Look]** 전역 팔레트(primary/secondary/accent/forbidden)·색의미·로케이션[](스타일/조명원/소품)·의상·vfx |
| `sceneCinematography` |  | `l3_scene_plan:50` "V축 L3(씬 비주얼 플랜) 설계자"(S3·L0~ 참조) | field(:76) · key `sceneCinematography`(:223, `compact` 동반) · `runSceneCinematography`(l3_scene_plan) · type `SceneCinematography[]`(:361) · compact 시 `infer_l3` 역추론 · log `10_` | **[Visual/Coverage·씬]** 커버리지 패턴·렌즈 vocab·카메라 마운팅/에너지·조명 아크·팔레트 강조·POV·리듬/컷 페이스 (정적+동적 혼합, 씬 촬영문법) |
| `decoupage` |  | `decoupage:25` "영화 감독…데쿠파주(découpage) 샷 분해" | field(:80) · key `decoupage`(:262) · `runDecoupage`(decoupage) · type `DecoupagePlan`(:469) · log `10b_` | **[Visual/Coverage·편집]** 비트(`scene_actions`)→샷 N:M 분해. operation(derived/added/merged/split)·shot_function·rhythm_role·shot_size·duration. 시간/편집 구조 |
| `shotDesign` |  | `l4_shots:93` "V축 L4(샷 실행) 디자이너"(L3 참조) | field(:81) · key `shotDesign`(:282) · `runShotDesign`(l4_shots) · type `ShotDesign`(:587) · log `11_` | **[Visual/Shot]** 샷별 3분할 묶음 = `intent`+`static_spec`+`dynamic_spec` |
| `intent` |  | `l4_shots:93` (L4a 연출의도 부분) | `ShotDesign.intent`(:588) · type `ShotIntent`(:485) | **[Visual/Shot]** 샷 연출 의도: story_beat_ref·dramatic_purpose·duration+근거·관객 시선 포커스·씬 내 위치 |
| `static_spec` |  | `l4_shots:93` (L4b 정적, Image 입력); 출력 `first_frame_prompt` | `ShotDesign.static_spec`(:589) · type `ShotStaticSpec`(:497) | **[Visual/Shot·정적·I2I]** 프레임 외형: 렌즈mm·샷타입·앵글·DoF·구도·조명(K/방향/품질)·캐릭터 blocking·소품·팔레트 → `first_frame_prompt` |
| `dynamic_spec` |  | `l4_shots:93` (L4c 동적, Video 입력); 출력 `motion_prompt` | `ShotDesign.dynamic_spec`(:590) · type `ShotDynamicSpec`(:547) | **[Visual/Shot·동적·I2V]** 시간/움직임: 카메라 모션·캐릭터 모션(동사1~2)·시선 아크·환경변화·전환(in/out) → `motion_prompt` |
| `shotSequence` |  | `c_application_2:51` "S+V 변환 마지막 단계 디자이너" | field(:82) · **step key `shotCheck`**(:309, shotCheck와 공동생성) · `runShotCheck`(c_application_2) · type `ShotSequence`(:662) · `persist_manifest`(shots) · log `13_shotSequence` | **[Visual/Shot·최종]** 조립된 최종 샷 시퀀스: 샷별 S/C/V+에셋참조+first_frame_generation+video_generation+action_budget+연속성. director/editor 소비 |
| `shotCheck` |  | `c_application_2:225` "샷 시퀀스 액션 스코프·정합성 검증" | field(:83) · 같은 step `shotCheck` · type `ShotCheckReport`(:293) · log `12_shotCheck` | **[Visual/Shot·검증]** 샷 분할 수·액션 위반 수정 수·이슈[]·passed |
| `renderPrompts` |  | `l5_prompts:208` "T2I 프롬프트 디자이너" + `:245` "TI2V 프롬프트 디자이너"(L2/C2/L4 참조) | field(:84) · key `renderPrompts`(:334) · `runRenderPrompts`(l5_prompts) · type `RenderPromptsOutput`(:57) · log `14_` | **[Visual/Render]** 샷별 최종 생성 프롬프트 컨테이너: `t2i`+`ti2v`+l0_meta(aspect/fps/res)+추출 통계 |
| `t2i` |  | `l5_prompts:208` (T2I 디자이너) | `ShotGenerationPrompts.t2i`(:53) · type `T2IPrompt`(:32) | **[Visual/Render·정적·I2I]** 첫프레임 프롬프트(200~400자)+negative+aspect+`reference_assets`(IP-Adapter ID) |
| `ti2v` |  | `l5_prompts:245` (TI2V 디자이너) | `ShotGenerationPrompts.ti2v`(:54) · type `TI2VPrompt`(:41) | **[Visual/Render·동적·I2V]** `motion_prompt`(50~100자, 동사1~2)+duration+fps+camera_movement |
| `assets` |  | (LLM 프롬프트 없음 — 이미지 생성) | `runAssetsGenerate`(assets_generate:80) · type `AssetsManifest`(:97) · log `14b_assets` | **[Visual/Gen·정적 ref]** 캐릭터/로케이션 레퍼런스 이미지 매니페스트(L6 T2I의 I2I 입력). L0 `reference_assets` ID와 1:1 |
| `shotImages` |  | (`t2i` 프롬프트 소비, 자체 LLM 프롬프트 없음) | `runShotImages`(l6_images:41) · type `ShotImagesOutput`(:127) · log `15_` | **[Visual/Gen·정적]** 샷별 첫프레임 이미지(fal T2I 결과) url/상태 |
| `shotVideos` |  | (`ti2v` 프롬프트 소비) | `runShotVideos`(l7_videos:41) · type `ShotVideosOutput`(:154) · log `16_` | **[Visual/Gen·동적]** 샷별 영상 클립(fal TI2V 결과) url/duration/first_frame_url/상태 |
| `depth_level` |  | `s0_genre:11-31` (D1~D7 등급 정의 — genre 프롬프트 핵심 블록) | type `DepthLevel`(:4) · `Genre.depth_level`(:191) · `ShotSequence.depth_level`(:666) · `isCompactDepth`/`COMPACT_DEPTH_LEVELS`(:10-13) · genre 가드(s0_genre:64) · steps compact 판정 | **[횡단]** 런타임 기반 작품 규모 등급 D1(Spark·5~15s·1~2샷)~D7(Epic·30분+·180+샷). 샷 수·복잡도 스케일 결정 → 제안 `scope` |

