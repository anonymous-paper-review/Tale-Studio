# Tale-Studio Writer — Stage별 프롬프트 Facet(JSON 키) ↔ 변수 정밀 감사

> 목적: 각 stage의 **프롬프트 내부 JSON 출력 키(= 프롬프트 facet)** 와 **TS 타입 필드 / 코드 변수명**을
> 1:1 대조해, 리네임 시 "프롬프트 facet 이름 = 변수 이름" 정렬을 안전하게 하기 위한 상세 워크시트.
> 생성: 2026-06-08 · 저장: `/home/user/` (repo 밖 — 깃 미추적/업로드 안 됨).
> 짝 문서: `writer-facet-inventory.md`(상위 5축 정렬·제안 네이밍). 본 문서는 그 **하위 상세(키 레벨)**.
> 수집: 9개 서브에이전트 병렬 감사(stage 파일 16개 / facet 블록 18개). 각 stage는 파일을 직접 읽어 추출.

**범례**: ✅ 프롬프트 키 = TS 필드 (이름 일치) · ⚠️ 부분 불일치(타입강도/enum노출/optional/길이 등) · ❌ 한쪽에만 존재(프롬프트 또는 TS 전용)

**커버리지**: 16개 stage `.ts` 파일 = 18개 facet 블록
(genre · narrativeStructure · characters · scenes · storyCheck · midPreview · **renderFormat** · **artDirection** · productionDesign · sceneCinematography · decoupage · shotDesign · **shotSequence** · **shotCheck** · renderPrompts · assets_generate · shotImages · shotVideos). 사용자 기준 "14 stage" = `l0_l1_visual`(L0+L1)·`c_application_2`(seq+check)를 1파일로 셀 때.

---

## A. 크로스-스테이지 드리프트 요약 (리네임 전 반드시 인지)

리네임은 "변수명 = 프롬프트 facet"이 목표지만, 감사 결과 **프롬프트 키 ≠ TS 필드 ≠ step key**가 여러 층위에서 갈린다. 9개 패턴:

### A-1. snake_case ↔ camelCase 컨벤션 분리 (전 stage 공통)
- **데이터 페이로드 키**(프롬프트 JSON + TS 필드)는 대부분 `snake_case`(예: `runtime_seconds`, `structure_type`, `first_frame_prompt`).
- **facet명/변수/식별자/타입**은 `camelCase`/`PascalCase`(예: `narrativeStructure`, `runDecoupage`, `ShotStaticSpec`).
- → "facet명(camel) ↔ payload키(snake)"는 **의도적 2-컨벤션**. 리네임 시 둘을 어느 한쪽으로 통일할지 결정 필요.
- **단일 타입 내 혼용(진짜 비일관)**: `Genre`만 camel(`subGenre`/`targetEmotion`) + snake(`runtime_seconds`/`depth_level`) 섞임 — 정리 1순위.

### A-2. 프롬프트 facet ⊊ TS 필드 (출력 비대칭 — "키 매칭"의 함정)
여러 stage에서 LLM이 내는 키는 TS 필드의 **부분집합**이고, 나머지는 코드가 합성/주입. "프롬프트 facet"과 "state facet"을 **분리 인지**해야 함:
- `storyCheck`: 프롬프트 `llm_issues`(4키) → `StoryCheckReport`(7필드). `issues`/`passed`/`causality_chain`/`retry_count`는 코드 합성.
- `sceneCinematography`: LLM은 `scene_plans`만. `shot_count_total`(reduce)·`budget_issues`(validator)는 코드.
- `decoupage`: `shot_count`/`shot_id`/`scene_id`/`beat_count`/`coverage_ratio` + `DecoupagePlan` 집계 전부 코드.
- `shotSequence`: 컨테이너(`project_id`/`total_*`/`depth_level`) 주입, `shot_id`/`causal_link` 재계산.
- `shotCheck`: 프롬프트 `shots_to_split`/`semantic_issues`(로컬 DTO) → `ShotCheckReport`(4필드)로 변환·집계.
- `renderPrompts`: 프롬프트는 타입당 **단 1키**(`prompt`/`motion_prompt`). 나머지는 extraction/`renderFormat` 복사.

### A-3. step key ↔ 출력 facet 불일치 (1 step → 다중 facet / 다중 이름)
- `visualFormat`(step key) → `renderFormat` + `artDirection` 산출. **한 단계 3종 이름** 공존: step `visualFormat` / 라벨·로그 `renderFormat_artDirection` / 필드 `renderFormat`+`artDirection`.
- `shotCheck`(step key) → `shotSequence` + `shotCheck` 산출(로그도 `13_` + `12_` 2개). 단일 key ↔ 2 필드 비대칭.

### A-4. enum 미강제 (TS `string` + 프롬프트 부분 노출 → LLM 드리프트 리스크)
- 대부분 enum 후보가 **TS는 `string`/`number`**(타입 강제 없음), 프롬프트도 일부만 노출.
  - 리스크 큰 곳: `Genre.format`(타입 string), `sceneCinematography.camera_mounting`/`lighting_arc.quality`(가이드 미열거), `ShotStaticSpec.framing.rule`·`ShotDynamicSpec.camera_motion.*`(출력예시 1개/`...` 생략), `C.hook_type`(string).
- **모범(완전 정합)**: `decoupage`의 5개 enum(operation/shot_function/rhythm_role/shot_size/camera_intent) 프롬프트 리터럴 ↔ TS union 철자·순서까지 일치. `ValidationSeverity`(CRITICAL/WARNING/INFO)도 정합.

### A-5. category enum 커버리지 갭 (단계별 부분집합)
- `ValidationIssue.category` = 7값. `storyCheck` 프롬프트는 5값만, `shotCheck` 프롬프트는 3값만 emit(나머지는 타 단계 소관). 타입은 7값 전체 허용이나 실제 생성은 부분집합.

### A-6. 레거시 S/L/C 코드 잔존 (프롬프트 텍스트 + 일부 키 자체)
- 프롬프트 본문 잔재: `c_validation_1`(S0~S3), `l2_design`(`S2.appearance_description`/`V축 L2`), `mid_preview`(`S↔V`/`L0`~`L4`), `s3_scenes`(S0/S1/S2), `l3_scene_plan`(S3/L0~), `l4_shots`(L3).
- ⚠️ **키 자체에 박힌 레거시**: `MidPreview.v_recommendations`의 `L0`/`L1`/`L2_summary`/`L3_scene_strategy`/`L4_shot_recipe` — CLAUDE.md "L0~L4는 코드 식별자에 없다" 원칙과 충돌(여기선 실제 TS 키). 리네임 시 1순위.

### A-7. post-LLM 값 정규화/override (키 rename 아님 — 값 덮어쓰기, 혼동 주의)
- `shot_id` 전역 재인덱싱: `decoupage`(`shot_<globalIdx>`), `l4_shots`(3파트 동기화), `shotSequence`(`shot_<i+1>`) — LLM 값 무시.
- `genre.depth_level` D1~D7 밖이면 `D3` 강제. fal `status` 대문자→소문자 매핑(assets/L6/L7).

### A-8. 의미적 동명이인 / 길이·철자 충돌 (리네임 시 헷갈림 유발)
- `MidPreview.L2_summary`/`L3_scene_strategy`/`L4_shot_recipe`(string 힌트) ↔ 후속 풀 구조 `ProductionDesign`/`SceneCinematography`/`ShotDesign`(동명·다른 깊이).
- `motion_prompt` 길이 가이드: L4 `50~80자` ↔ TI2V/L5 `50~100자` (같은 키, 다른 상한).
- `RhythmRole`(`sustain`/`accelerate`) ↔ `SceneCinematography.rhythm_profile`(`sustained`/`accelerating`) — 단어형 다른 별개 enum.
- L6 `image_url` → L7 `first_frame_url` (같은 값, 역할 리네임).
- `action_budget.*` 소문자 enum ↔ `ValidationSeverity` 대문자 enum 혼동 주의.

### A-9. status enum 비대칭 (generation 출력)
- `ShotVideoResult.status` = 4값(`+skipped`) + `skipped_count` 필수. `assets`/`ShotImageResult` = 3값(skipped 없음). 같은 카운터군 내 `pending_count?`(optional) ↔ `skipped_count`(필수) optionality 불일치.

---

## B. 스테이지별 상세 (프롬프트 JSON 키 ↔ TS 필드 ↔ 변수)

> 각 블록: facet 메타 → `프롬프트 JSON 키 ↔ TS 필드` 표(✅/⚠️/❌) → 코드 변수명 → 드리프트 메모.
> 순서: Story(6) → Visual·Look(3) → Coverage(2) → Shot(2파일) → Render(1) → Generation(3).

### s0_genre.ts — facet `genre`
- entry fn: `runGenre(input: PipelineInput, logger: PipelineLogger, axisConfig: LlmAxisConfig): Promise<Genre>` · WriterRunState field: `genre?: Genre` (steps.ts:65, set via `return { genre }` steps.ts:117) · log file: `02_genre.json` (from `saveStage('02_genre.json', result)` s0_genre.ts:68)
- 프롬프트 자기-라벨: "당신은 영상 제작의 S0(장르/톤) 디자이너이다." (`s0_genre.ts:9`)
- 프롬프트 상호참조(레거시 S/L/C 코드): `S0` (`s0_genre.ts:9`, systemInstruction 본문) — userPrompt/출력스키마 내 레거시 코드 참조 none

#### 프롬프트 JSON 출력 키 ↔ TS 타입 필드
| 프롬프트 JSON key (중첩은 a.b) | 프롬프트가 적은 값타입/enum | 대응 TS 필드 | 일치 | 비고 |
|---|---|---|---|---|
| `genre` | `"string"` | `Genre.genre: string` | ✅ | 동일명 |
| `subGenre` | `"string (optional)"` | `Genre.subGenre?: string` | ✅ | 동일명, 양쪽 optional |
| `tone` | `["string", ...]` | `Genre.tone: string[]` | ✅ | 동일명 |
| `targetEmotion` | `["string", ...]` | `Genre.targetEmotion: string[]` | ✅ | 동일명 (camelCase) |
| `runtime_seconds` | `number` | `Genre.runtime_seconds: number` | ✅ | 동일명 (snake_case) |
| `depth_level` | `"D1" \| "D2" \| "D3" \| "D4" \| "D5" \| "D6" \| "D7"` | `Genre.depth_level: DepthLevel` | ✅ | 동일명 (snake_case). enum 값 = `DepthLevel` 정의(pipeline.ts:4)와 정확히 일치 |
| `format` | `"horizontal_16:9" \| "vertical_9:16" \| "cinema_2.39:1"` | `Genre.format: string` | ⚠️ | 키 이름은 일치하나 TS는 `string`(자유형) — 프롬프트가 enum 3종으로 제약, 타입에는 enum 미반영(주석으로만 pipeline.ts:192) |

TS 타입 전체 필드 점검 (Genre, pipeline.ts:185-193): `genre`✅ `subGenre`✅ `tone`✅ `targetEmotion`✅ `runtime_seconds`✅ `depth_level`✅ `format`✅(⚠️ enum 미반영). 프롬프트에만 있고 TS에 없는 키: 없음. TS에만 있고 프롬프트에 없는 필드: 없음.

#### 코드 변수명
- 함수/파라미터: `runGenre` / `input`, `logger`, `axisConfig`
- 결과·프롬프트 지역변수: `systemInstruction` (s0_genre.ts:9), `userPrompt` (s0_genre.ts:34), `result` (s0_genre.ts:51, `generateJson<Genre>` 결과)
- 타입: `Genre` (pipeline.ts:185), 보조 `DepthLevel` (pipeline.ts:4), `PipelineInput` (pipeline.ts:164)

#### 드리프트 메모
- snake/camel 혼용: 동일 타입 안에서 `subGenre`/`targetEmotion`(camelCase)와 `runtime_seconds`/`depth_level`(snake_case)가 공존 — 프롬프트 JSON·TS 타입 양쪽 동일하게 혼용이라 키 매칭은 정합이나, 네이밍 컨벤션이 일관되지 않음.
- `format`: 프롬프트는 3-값 enum, TS는 `string`. 키명 일치, 타입 강도 불일치(⚠️).
- LLM 응답 → state remap: **없음**. `result`(generateJson 출력)를 키 변경 없이 그대로 `saveStage`/`return { genre }` 함. 단, 후처리 1건 — `depth_level`가 D1~D7 밖이면 `'D3'`로 강제 덮어쓰기(안전가드, s0_genre.ts:64-66). 키 rename은 아니고 값 정규화.
- 그 외 키 이름 일치, optional 일치 → 정합.

### s1_structure.ts — facet `narrativeStructure`
- entry fn: `runNarrativeStructure(input: PipelineInput, genre: Genre, logger: PipelineLogger, axisConfig: LlmAxisConfig): Promise<NarrativeStructure>` · WriterRunState field: `narrativeStructure?: NarrativeStructure` (steps.ts:66, set via `return { narrativeStructure }` steps.ts:127) · log file: `03_narrativeStructure.json` (from `saveStage('03_narrativeStructure.json', result)` s1_structure.ts:66)
- 프롬프트 자기-라벨: "당신은 영상 제작의 S1(내러티브 구조) 디자이너이다." (`s1_structure.ts:9`)
- 프롬프트 상호참조(레거시 S/L/C 코드): `S1` (`s1_structure.ts:9`, systemInstruction). 그 외 `CDQ`/`Central Dramatic Question`(도메인 약어, 레거시 stage 코드 아님, s1_structure.ts:10/19). 레거시 S/L/C stage 코드 참조 그 외 none

#### 프롬프트 JSON 출력 키 ↔ TS 타입 필드
| 프롬프트 JSON key (중첩은 a.b) | 프롬프트가 적은 값타입/enum | 대응 TS 필드 | 일치 | 비고 |
|---|---|---|---|---|
| `structure_type` | `"string"` | `NarrativeStructure.structure_type: string` | ✅ | 동일명 (snake_case). enum 예시(3-act/kishōtenketsu/…)는 systemInstruction 가이드·TS 주석에만, 타입은 string |
| `acts` | `[ {...} ]` (배열) | `NarrativeStructure.acts: Array<{...}>` | ✅ | 동일명 |
| `acts[].act_id` | `"string"` | `NarrativeStructure.acts[].act_id: string` | ✅ | 동일명 (snake_case) |
| `acts[].purpose` | `"string"` | `NarrativeStructure.acts[].purpose: string` | ✅ | 동일명 |
| `acts[].proportion` | `number` | `NarrativeStructure.acts[].proportion: number` | ✅ | 동일명. 합 1.0 제약(프롬프트 본문, 코드 검증 없음) |
| `pov` | `"string"` | `NarrativeStructure.pov: string` | ✅ | 동일명. enum 예시(1st_person/3rd_limited/3rd_omniscient)는 TS 주석에만 |
| `theme` | `"string"` | `NarrativeStructure.theme: string` | ✅ | 동일명 |
| `central_dramatic_question` | `"string (yes/no question)"` | `NarrativeStructure.central_dramatic_question: string` | ✅ | 동일명 (snake_case) |
| `turning_point_position` | `number (0~1)` | `NarrativeStructure.turning_point_position: number` | ✅ | 동일명 (snake_case). 0~1 범위 제약은 프롬프트·주석에만, 코드 검증 없음 |

TS 타입 전체 필드 점검 (NarrativeStructure, pipeline.ts:195-206): `structure_type`✅ `acts`✅(+`act_id`✅ `purpose`✅ `proportion`✅) `pov`✅ `theme`✅ `central_dramatic_question`✅ `turning_point_position`✅. 프롬프트에만 있고 TS에 없는 키: 없음. TS에만 있고 프롬프트에 없는 필드: 없음.

#### 코드 변수명
- 함수/파라미터: `runNarrativeStructure` / `input`, `genre`, `logger`, `axisConfig`
- 결과·프롬프트 지역변수: `systemInstruction` (s1_structure.ts:9), `userPrompt` (s1_structure.ts:34), `result` (s1_structure.ts:54, `generateJson<NarrativeStructure>` 결과)
- 타입: `NarrativeStructure` (pipeline.ts:195), 보조 `Genre` (pipeline.ts:185, 입력), `PipelineInput` (pipeline.ts:164)

#### 드리프트 메모
- 키 네이밍 전부 snake_case로 일관 (`structure_type`/`act_id`/`central_dramatic_question`/`turning_point_position`) — s0_genre의 camel/snake 혼용과 달리 이 stage 내부는 일관됨. 단 facet명/변수명/필드명 축은 camelCase(`narrativeStructure`)인데 페이로드 키는 snake_case 라 facet↔payload 컨벤션은 갈림.
- 프롬프트 JSON key ↔ TS 필드: 9개(중첩 포함) 전부 키명·구조·optional 정합. 누락/추가 키 없음.
- enum/범위 제약은 모두 자유 `string`/`number` 타입 + 주석·프롬프트 본문 가이드로만 표현 (`structure_type`, `pov`, `proportion` 합=1.0, `turning_point_position` 0~1). 타입 레벨 강제 없음 — s0의 `format`과 동일 패턴.
- LLM 응답 → state remap: **없음**. `result`(generateJson 출력)를 키 변경/정규화 없이 그대로 `saveStage`/`return { narrativeStructure }` 함. s0와 달리 후처리 안전가드도 없음.
- 종합: 키 매칭 전부 정합, 컨벤션상 facet명(camel) vs payload키(snake) 차이만 존재.


### s2_characters.ts — facet `characters`
- entry fn: `runCharacters(input: PipelineInput, genre: Genre, narrativeStructure: NarrativeStructure, logger: PipelineLogger, axisConfig: LlmAxisConfig): Promise<Characters>` · WriterRunState field: `characters` (PipelineResult.characters, pipeline.ts:684) · log file: `04_characters.json`
- 프롬프트 자기-라벨: "당신은 영상 제작의 S2(캐릭터/관계) 디자이너이다." (`s2_characters.ts:15`)
- 프롬프트 상호참조(레거시 S/L/C 코드): `S2` (self-label, `s2_characters.ts:15`) — 그 외 다른 stage(S0/S1/L/C) 상호참조 코드 none

#### 프롬프트 JSON 출력 키 ↔ TS 타입 필드
| 프롬프트 JSON key (중첩 a.b, 배열 a[].b) | 프롬프트 값타입/enum | 대응 TS 필드 | 일치 | 비고 |
|---|---|---|---|---|
| `characters` | array | `Characters.characters: StoryCharacter[]` | ✅ | |
| `characters[].id` | string (snake_case) | `StoryCharacter.id: string` | ✅ | |
| `characters[].name` | string | `StoryCharacter.name: string` | ✅ | |
| `characters[].age` | string (optional) | `StoryCharacter.age?: string` | ✅ | 둘 다 optional |
| `characters[].role` | "protagonist" \| "antagonist" \| "supporting" | `StoryCharacter.role: string` | ⚠️ | 프롬프트는 3-값 enum 리터럴, TS는 느슨한 `string` (주석에 동일 3값 표기). enum 미강제 |
| `characters[].personality` | ["string", ...] | `StoryCharacter.personality: string[]` | ✅ | |
| `characters[].arc` | object | `StoryCharacter.arc: {...}` | ✅ | |
| `characters[].arc.start_state` | string | `StoryCharacter.arc.start_state: string` | ✅ | snake_case 양쪽 동일 |
| `characters[].arc.end_state` | string | `StoryCharacter.arc.end_state: string` | ✅ | snake_case 양쪽 동일 |
| `characters[].arc.arc_type` | string | `StoryCharacter.arc.arc_type: string` | ⚠️ | 양쪽 `string`이나 systemInstruction은 7종 arc enum(positive_change/negative_change/fall/flat/steadfast/redemption/corruption/disillusionment/circular) 나열, 출력 형식·TS 모두 미강제 |
| `characters[].voice` | string (대사 톤) | `StoryCharacter.voice: string` | ✅ | |
| `characters[].appearance_description` | string | `StoryCharacter.appearance_description: string` | ✅ | snake_case 양쪽 동일 |
| `characters[].motivation` | object | `StoryCharacter.motivation: {...}` | ✅ | |
| `characters[].motivation.want` | string | `StoryCharacter.motivation.want: string` | ✅ | |
| `characters[].motivation.need` | string | `StoryCharacter.motivation.need: string` | ✅ | |
| `characters[].motivation.wound` | string (optional) | `StoryCharacter.motivation.wound?: string` | ✅ | 둘 다 optional |
| `relationships` | array | `Characters.relationships: StoryRelationship[]` | ✅ | |
| `relationships[].between` | ["char_id_1", "char_id_2"] | `StoryRelationship.between: [string, string]` | ⚠️ | TS는 정확히 2-튜플 `[string,string]`, 프롬프트 예시도 2원소지만 JSON array는 길이 미강제 |
| `relationships[].type` | string | `StoryRelationship.type: string` | ✅ | |
| `relationships[].state_change` | string (optional) | `StoryRelationship.state_change?: string` | ✅ | snake_case 양쪽 동일, 둘 다 optional |
| `relationships[].visible_in_video` | boolean | `StoryRelationship.visible_in_video: boolean` | ✅ | snake_case 양쪽 동일 |
| `subtext_notes` | ["string", ...] | `Characters.subtext_notes: string[]` | ✅ | snake_case 양쪽 동일 |

TS 필드 빠짐(프롬프트 키에 없는 TS 필드): 없음 — `Characters`/`StoryCharacter`/`StoryRelationship`의 모든 필드가 프롬프트에 출력 키로 존재 ✅

#### 코드 변수명
- 함수/파라미터: `runCharacters` / params: `input`, `genre`, `narrativeStructure`, `logger`, `axisConfig`
- 결과·프롬프트 지역변수: `systemInstruction` (s2_characters.ts:15), `userPrompt` (s2_characters.ts:42), `result` (s2_characters.ts:85)
- 타입: `Characters` (pipeline.ts:235), 중첩 `StoryCharacter` (pipeline.ts:208), `StoryRelationship` (pipeline.ts:228)

#### 드리프트 메모
- generateJson 이후 LLM-response→state 키 remap **없음**: `generateJson<Characters>(...)` 결과(`result`)를 그대로 `saveStage('04_characters.json', result)` 후 `return result`. 키 변환/리네임/필드 매핑 코드 부재 (s2_characters.ts:85-99).
- 로그 파일명 prefix(`04_`)와 stage 라벨(`'characters'`) 불일치 없음. `markStage`/`saveLlmCall`은 라벨 `'characters'`, `saveStage`는 `'04_characters.json'`.
- enum 강제 부재(드리프트 리스크): `role`, `arc.arc_type`은 프롬프트 systemInstruction에 enum 후보가 나열되나 (1) 출력 형식 블록에서 `role`만 리터럴 union으로 표기·`arc_type`은 `"string"`, (2) TS는 둘 다 `string`. 런타임 검증 없음 → LLM이 enum 밖 값을 내도 타입 통과.
- 튜플 길이 미강제: `between`은 TS `[string,string]`(2개 고정)이나 JSON 출력이 1개 또는 3개+를 내도 컴파일·런타임 검증 없음.
- snake_case vs camelCase 혼용 없음 (s2 내부): `start_state`/`end_state`/`arc_type`/`appearance_description`/`state_change`/`visible_in_video`/`subtext_notes` 모두 프롬프트·TS 양쪽 snake_case로 정합. (단 같은 pipeline.ts의 형제 타입 `Genre.subGenre`/`targetEmotion`, `NarrativeStructure`는 camelCase 혼재 — 본 stage 범위 밖이나 파일 전반 명명 비일관 존재.)
- `markStage('characters','completed', { character_count: result.characters.length })`: 메타데이터 키 `character_count`(snake_case), TS 출력 스키마와 무관한 로깅 전용 필드.

---

### s3_scenes.ts — facet `scenes`
- entry fn: `runScenes(input: PipelineInput, genre: Genre, narrativeStructure: NarrativeStructure, characters: Characters, logger: PipelineLogger, axisConfig: LlmAxisConfig): Promise<Scenes>` · WriterRunState field: `scenes` (PipelineResult.scenes, pipeline.ts:685) · log file: `05_scenes.json`
- 프롬프트 자기-라벨: "당신은 영상 제작의 S3(씬 브레이크다운) 디자이너이다." (`s3_scenes.ts:28`)
- 프롬프트 상호참조(레거시 S/L/C 코드): `S3` (self-label, `s3_scenes.ts:28`); `S0/S1/S2` ("주어진 S0/S1/S2 위에서", `s3_scenes.ts:29`); `S1.acts` (출력 형식 act_ref 주석 "act_id (S1.acts 중 하나)", `s3_scenes.ts:77`)

#### 프롬프트 JSON 출력 키 ↔ TS 타입 필드
| 프롬프트 JSON key (중첩 a.b, 배열 a[].b) | 프롬프트 값타입/enum | 대응 TS 필드 | 일치 | 비고 |
|---|---|---|---|---|
| `scenes` | array | `Scenes.scenes: StoryScene[]` | ✅ | |
| `scenes[].scene_id` | "scene_1" (string) | `StoryScene.scene_id: string` | ✅ | snake_case 양쪽 동일 |
| `scenes[].act_ref` | "act_id (S1.acts 중 하나)" (string) | `StoryScene.act_ref: string` | ✅ | snake_case 양쪽 동일. NarrativeStructure.acts[].act_id 참조(런타임 미검증) |
| `scenes[].location` | string | `StoryScene.location: string` | ✅ | |
| `scenes[].time_of_day` | string | `StoryScene.time_of_day: string` | ✅ | snake_case 양쪽 동일 |
| `scenes[].weather` | string (optional) | `StoryScene.weather?: string` | ✅ | 둘 다 optional |
| `scenes[].characters_in_scene` | ["char_id", ...] | `StoryScene.characters_in_scene: string[]` | ✅ | snake_case 양쪽 동일 |
| `scenes[].purpose` | string (씬 목적 분류 중) | `StoryScene.purpose: string` | ⚠️ | 양쪽 `string`. systemInstruction은 10종 enum(exposition/conflict/decision/revelation/transformation/transition/setup/payoff/climax/resolution) 나열하나 출력 형식·TS 모두 미강제 |
| `scenes[].emotion_beat` | {"start","end"} | `StoryScene.emotion_beat: {start;end}` | ✅ | |
| `scenes[].emotion_beat.start` | string | `StoryScene.emotion_beat.start: string` | ✅ | |
| `scenes[].emotion_beat.end` | string | `StoryScene.emotion_beat.end: string` | ✅ | |
| `scenes[].dialogue_summary` | string | `StoryScene.dialogue_summary: string` | ✅ | snake_case 양쪽 동일 |
| `scenes[].key_dialogue` | array | `StoryScene.key_dialogue?: Array<{...}>` | ⚠️ | TS는 **optional** (`key_dialogue?`), 프롬프트 출력 형식엔 항상 필드로 등장(필수처럼) — optionality 불일치 |
| `scenes[].key_dialogue[].character_id` | string | `key_dialogue[].character_id: string` | ✅ | snake_case 양쪽 동일 |
| `scenes[].key_dialogue[].line` | string | `key_dialogue[].line: string` | ✅ | |
| `scenes[].key_dialogue[].delivery` | string | `key_dialogue[].delivery: string` | ✅ | |
| `scenes[].info_asymmetry` | string | `StoryScene.info_asymmetry: string` | ⚠️ | 양쪽 `string`. systemInstruction은 3종 enum("audience=character"/"audience>character"/"character>audience") 나열·TS 주석에도 동일 표기하나 출력 형식·TS 타입 미강제 |
| `scenes[].estimated_seconds` | number | `StoryScene.estimated_seconds: number` | ✅ | snake_case 양쪽 동일 |
| `scenes[].scene_actions` | ["action 1", ...] | `StoryScene.scene_actions: string[]` | ✅ | snake_case 양쪽 동일 |
| `total_estimated_seconds` | number | `Scenes.total_estimated_seconds: number` | ✅ | snake_case 양쪽 동일 |

TS 필드 빠짐(프롬프트 키에 없는 TS 필드): 없음 — `Scenes`/`StoryScene`의 모든 필드가 프롬프트 출력 키로 존재 (`key_dialogue`만 optionality 차이 ⚠️, 위 표 참조) ✅

#### 코드 변수명
- 함수/파라미터: `runScenes` / params: `input`, `genre`, `narrativeStructure`, `characters`, `logger`, `axisConfig`
- 결과·프롬프트 지역변수: `totalSecondsTarget` (s3_scenes.ts:16, = `genre.runtime_seconds`), `sceneCountHintMap` (s3_scenes.ts:17, Record<string,string>), `sceneCountHint` (s3_scenes.ts:26), `systemInstruction` (s3_scenes.ts:28), `userPrompt` (s3_scenes.ts:57), `result` (s3_scenes.ts:93)
- 타입: `Scenes` (pipeline.ts:264), 중첩 `StoryScene` (pipeline.ts:241)

#### 드리프트 메모
- generateJson 이후 LLM-response→state 키 remap **없음**: `generateJson<Scenes>(...)` 결과(`result`)를 그대로 `saveStage('05_scenes.json', result)` 후 `return result`. 키 변환/리네임/필드 매핑 코드 부재 (s3_scenes.ts:93-107).
- `key_dialogue` optionality 드리프트: TS `key_dialogue?`(optional)인데 프롬프트 출력 형식 JSON엔 항상 등장 → LLM이 빈 씬에도 채워 보내거나, 반대로 누락 시 TS는 허용하나 다운스트림이 존재 가정하면 깨질 수 있음. 명시적 "(optional)" 라벨이 프롬프트에 없음(다른 optional 필드 `weather`엔 있음).
- enum 강제 부재(드리프트 리스크): `purpose`(10종), `info_asymmetry`(3종)는 systemInstruction에만 후보 나열, 출력 형식 블록·TS 타입 모두 느슨한 `string` → enum 밖 값 통과. `info_asymmetry`는 TS 주석에도 3종 표기되나 미강제.
- 교차 stage 참조 무결성 미검증: `act_ref`→S1(NarrativeStructure).acts[].act_id, `characters_in_scene`/`key_dialogue[].character_id`→S2 characters[].id. 프롬프트는 `[characters ID들]` 블록으로 실제 id 목록을 주입(s3_scenes.ts:66-67, `characters.characters.map((c) => \`${c.id} (${c.name})\`).join(', ')`)하나, 코드에 응답 id가 실제 존재하는지 검증하는 로직 없음.
- snake_case vs camelCase 혼용: s3 출력 키·StoryScene 필드는 전부 snake_case로 정합. **단 지역변수**는 camelCase(`totalSecondsTarget`/`sceneCountHintMap`/`sceneCountHint`), `genre.runtime_seconds`(snake)와 `genre.depth_level`(snake)를 읽음 — 명명 컨벤션이 데이터(snake)와 코드 로컬(camel)에서 갈림(일반적 패턴이나 기록).
- `markStage('scenes','completed', { scene_count: result.scenes.length })`: 메타데이터 키 `scene_count`(snake_case), 출력 스키마 무관 로깅 전용.
- `estimated_seconds` 총합 제약은 프롬프트 가이드(systemInstruction "총합 ≈ ${totalSecondsTarget}초")일 뿐 코드/타입 검증 없음. `total_estimated_seconds`와 `sum(scenes[].estimated_seconds)` 일치 미검증.


### c_validation_1.ts — facet `storyCheck`
- entry fn: `runStoryCheck(genre: Genre, narrativeStructure: NarrativeStructure, characters: Characters, scenes: Scenes, logger: PipelineLogger, axisConfig: LlmAxisConfig, retryCount = 0): Promise<StoryCheckReport>` · WriterRunState field: `storyCheck?: StoryCheckReport` (steps.ts:69) · log file: `06_storyCheck.json`
- 프롬프트 자기-라벨: "당신은 영상 서사의 핍진성 검증자이다. 주어진 S0~S3를 보고" (`c_validation_1.ts:38`)
- 프롬프트 상호참조(레거시 S/L/C 코드): `S0~S3` (`38`), `S1.central_dramatic_question` (`42`), `S2.personality` (`47`), `S1.theme` / `S3` (`58`), `S2.character_id, S3.scene_id, S1` (`85`)

#### 프롬프트 JSON 출력 키 ↔ TS 타입 필드
주의: 프롬프트가 emit하는 JSON은 `LlmValidationResponse`(중간 DTO, c_validation_1.ts:15-20)이며, 최종 `StoryCheckReport`(pipeline.ts:283)가 아니다. LLM은 `cdq_present`/`cdq_clarity_score`/`cliche_count`/`llm_issues`만 emit; 나머지 report 필드(`passed`/`issues`/`causality_chain`/`retry_count`)는 코드가 룰기반 검증(`analyzeCausalityChain`)·인자로 합성. 아래 표는 프롬프트 키→(DTO 경유)→`StoryCheckReport` 필드 기준.

| 프롬프트 JSON key (중첩 a.b) | 프롬프트 값타입/enum | 대응 TS 필드 | 일치 | 비고 |
|---|---|---|---|---|
| `cdq_present` | boolean | `StoryCheckReport.cdq_present` (boolean) | ✅ | DTO `LlmValidationResponse.cdq_present` → report.cdq_present 직결 (line 111). snake_case 동일 |
| `cdq_clarity_score` | number (0~1) | `StoryCheckReport.cdq_clarity_score` (number, 0~1) | ✅ | DTO → report.cdq_clarity_score 직결 (line 112). snake_case 동일 |
| `cliche_count` | number | `StoryCheckReport.cliche_count` (number) | ✅ | DTO → report.cliche_count 직결 (line 113). snake_case 동일 |
| `llm_issues` | ValidationIssue[] | `StoryCheckReport.issues` (ValidationIssue[]) | ⚠️ | 키 이름 다름: 프롬프트/DTO=`llm_issues`, report 필드=`issues`. 코드가 `[...ruleIssues, ...llmResult.llm_issues]`로 병합 후 `issues`에 배정 (line 104,109). 즉 프롬프트 `llm_issues`는 `issues`의 부분집합 |
| `llm_issues[].category` | "causality"\|"cdq"\|"verisimilitude"\|"cliche"\|"theme" | `ValidationIssue.category` (pipeline.ts:276) | ⚠️ | 프롬프트 enum은 5개만 열거; TS enum은 7개 ('causality'\|'cdq'\|'verisimilitude'\|'cliche'\|`'action_budget'`\|`'continuity'`\|'theme'). 프롬프트에 `action_budget`/`continuity` 누락 |
| `llm_issues[].severity` | "CRITICAL"\|"WARNING"\|"INFO" | `ValidationIssue.severity` (=`ValidationSeverity`, pipeline.ts:273) | ✅ | 3개 enum 완전 일치 |
| `llm_issues[].location` | string (예: S2.character_id, S3.scene_id, S1) | `ValidationIssue.location` (string) | ✅ | 타입 일치. 단 예시값이 레거시 S코드 — TS 주석 예시는 "S3.scene_2"/"shot_5" (drift, 아래 메모) |
| `llm_issues[].message` | string | `ValidationIssue.message` (string) | ✅ | 일치 |
| `llm_issues[].suggestion` | string (optional) | `ValidationIssue.suggestion?` (string) | ✅ | optional 일치 |

TS `StoryCheckReport` 필드 중 프롬프트가 emit하지 않는 것 (코드 합성, ❌=프롬프트 부재):
| TS 필드 | 타입 | 출처 | 일치 |
|---|---|---|---|
| `passed` | boolean | ❌ 프롬프트 부재. 코드가 `!hasCritical`로 계산 (line 108,112) | ❌(코드합성) |
| `issues` | ValidationIssue[] | ⚠️ 위 `llm_issues` + ruleIssues 병합 | ⚠️ |
| `causality_chain` | Array<{from;to;connector:'therefore'\|'but'\|'and_then'}> | ❌ 프롬프트 부재. 룰기반 `analyzeCausalityChain(scenes).chain` (line 34,110) | ❌(룰기반) |
| `cdq_present` | boolean | ✅ 프롬프트 | ✅ |
| `cdq_clarity_score` | number | ✅ 프롬프트 | ✅ |
| `cliche_count` | number | ✅ 프롬프트 | ✅ |
| `retry_count` | number | ❌ 프롬프트 부재. 코드가 `retryCount` 인자에서 배정 (line 114) | ❌(인자) |

#### 코드 변수명
- 함수/파라미터: `runStoryCheck` · params `genre`, `narrativeStructure`, `characters`, `scenes`, `logger`, `axisConfig`, `retryCount`
- 결과·프롬프트 지역변수(실제 식별자): `causality`(룰 검증 결과), `ruleIssues`(ValidationIssue[]), `system`(systemInstruction 문자열), `user`(userPrompt 문자열), `llmResult`(LlmValidationResponse), `allIssues`(병합 배열), `hasCritical`(boolean), `report`(StoryCheckReport)
- 중간 DTO 타입: `LlmValidationResponse` (c_validation_1.ts:15, 로컬 정의 — pipeline.ts 아님)
- 타입: `StoryCheckReport` (pipeline.ts:283), 중첩 `ValidationIssue` (pipeline.ts:275), `ValidationSeverity` (pipeline.ts:273)

#### 드리프트 메모
- **DTO ↔ report 키 불일치**: 프롬프트가 `llm_issues`를 emit하나 최종 report 필드는 `issues`. 프롬프트만 보면 `issues`/`passed`/`causality_chain`/`retry_count`가 안 보임 — report의 절반은 코드/룰 합성. facet 정렬 시 "프롬프트 facet = LlmValidationResponse(4키)" vs "state facet = StoryCheckReport(7필드)"로 분리 인지 필요.
- **category enum drift**: TS `ValidationIssue.category`는 7값(`action_budget`,`continuity` 포함)인데 c_validation_1 프롬프트 enum은 5값만. `action_budget`/`continuity`는 shot 단계(ShotCheckReport) 소관이라 의도적 누락으로 보이나, 프롬프트가 그 두 값을 emit할 수 없음.
- **location 예시 레거시 코드 drift**: 프롬프트는 `S1`/`S2.character_id`/`S3.scene_id` 예시(레거시 S0~S3 어휘), TS 주석 예시는 `S3.scene_2`/`shot_5`. CLAUDE.md 글로서리상 옛 `S/L+숫자` prefix는 2026-06-05 리네임으로 폐기됐다고 명시 — 이 프롬프트는 아직 레거시 S0~S3 라벨을 사용 중(미리네임 잔재).
- snake_case 정합: 프롬프트 키·DTO·report 모두 snake_case로 일관 (camelCase 혼입 없음). 코드 remap은 `llm_issues`→`issues` 병합 1건뿐.

---

### mid_preview.ts — facet `midPreview`
- entry fn: `runMidPreview(genre: Genre, narrativeStructure: NarrativeStructure, characters: Characters, scenes: Scenes, validation: StoryCheckReport, logger: PipelineLogger, axisConfig: LlmAxisConfig): Promise<MidPreview>` · WriterRunState field: `midPreview?: MidPreview` (steps.ts:70) · log file: `07_midPreview.json`
- 프롬프트 자기-라벨: "당신은 S↔V 변환의 첫 협상자이다." (`mid_preview.ts:24`)
- 프롬프트 상호참조(레거시 S/L/C 코드): `S↔V` (`1`, `24`), `S0~S3` / `V축` (`25`), `L0` (`27`, `59`), `L1` (`28`, `60`), `L2_summary` (`61`), `L3_scene_strategy` (`62`), `L4_shot_recipe` (`63`), `[C 검증 결과]` (`53`)

#### 프롬프트 JSON 출력 키 ↔ TS 타입 필드
프롬프트 JSON은 `MidPreview`(pipeline.ts:304)를 직접 emit. `generateJson<MidPreview>` 결과를 remap 없이 그대로 `result`로 반환 (mid_preview.ts:73,87) → state `midPreview`에 직결. 코드 후처리·키 변경 없음.

| 프롬프트 JSON key (중첩 a.b) | 프롬프트 값타입/enum | 대응 TS 필드 | 일치 | 비고 |
|---|---|---|---|---|
| `v_recommendations` | object | `MidPreview.v_recommendations` (object) | ✅ | snake_case 동일 |
| `v_recommendations.L0` | object {medium,resolution{width,height},fps,aspect_ratio,rendering_method} | `v_recommendations.L0: Partial<RenderFormat>` (pipeline.ts:306) | ✅ | 프롬프트 L0 내부 키 5개 = RenderFormat(pipeline.ts:322) 전 필드(`medium`,`resolution`,`fps`,`aspect_ratio`,`rendering_method`)와 일치. TS는 `Partial<>`라 부분집합 허용 |
| `v_recommendations.L0.medium` | "..." (string) | `RenderFormat.medium` (string) | ✅ | 일치 |
| `v_recommendations.L0.resolution` | {width:number,height:number} | `RenderFormat.resolution: {width;height}` | ✅ | 중첩 객체 일치 |
| `v_recommendations.L0.resolution.width` | number | `RenderFormat.resolution.width` (number) | ✅ | 일치 |
| `v_recommendations.L0.resolution.height` | number | `RenderFormat.resolution.height` (number) | ✅ | 일치 |
| `v_recommendations.L0.fps` | number | `RenderFormat.fps` (number) | ✅ | 일치 |
| `v_recommendations.L0.aspect_ratio` | "..." (string) | `RenderFormat.aspect_ratio` (string) | ✅ | snake_case 동일 |
| `v_recommendations.L0.rendering_method` | "..." (string) | `RenderFormat.rendering_method` (string) | ✅ | snake_case 동일 |
| `v_recommendations.L1` | object {art_style,shape_language,line_quality,character_proportion,texture_philosophy} | `v_recommendations.L1: Partial<ArtDirection>` (pipeline.ts:307) | ✅ | 프롬프트 L1 내부 키 5개 = ArtDirection(pipeline.ts:330) 전 필드와 일치. TS는 `Partial<>` |
| `v_recommendations.L1.art_style` | "..." (string) | `ArtDirection.art_style` (string) | ✅ | snake_case 동일 |
| `v_recommendations.L1.shape_language` | "..." (string) | `ArtDirection.shape_language` (string) | ✅ | snake_case 동일 |
| `v_recommendations.L1.line_quality` | "..." (string) | `ArtDirection.line_quality` (string) | ✅ | snake_case 동일 |
| `v_recommendations.L1.character_proportion` | "..." (string) | `ArtDirection.character_proportion` (string) | ✅ | snake_case 동일 |
| `v_recommendations.L1.texture_philosophy` | "..." (string) | `ArtDirection.texture_philosophy` (string) | ✅ | snake_case 동일 |
| `v_recommendations.L2_summary` | string (2~3 문장) | `v_recommendations.L2_summary` (string) (pipeline.ts:308) | ✅ | 일치 |
| `v_recommendations.L3_scene_strategy` | string (1~2 문장: 커버리지/리듬) | `v_recommendations.L3_scene_strategy` (string) (pipeline.ts:309) | ✅ | 일치 |
| `v_recommendations.L4_shot_recipe` | string (1~2 문장: 정적/동적) | `v_recommendations.L4_shot_recipe` (string) (pipeline.ts:310) | ✅ | 일치 |
| `color_script` | Array<{scene_id,dominant,mood}> | `MidPreview.color_script: Array<{scene_id;dominant;mood}>` (pipeline.ts:312) | ✅ | snake_case 동일 |
| `color_script[].scene_id` | "scene_1" (string) | `color_script[].scene_id` (string) | ✅ | 일치 |
| `color_script[].dominant` | "color_name" (string) | `color_script[].dominant` (string) | ✅ | 일치 |
| `color_script[].mood` | string | `color_script[].mood` (string) | ✅ | 일치 |
| `emotional_arc_visualization` | string (감정 곡선 텍스트) | `MidPreview.emotional_arc_visualization` (string) (pipeline.ts:313) | ✅ | snake_case 동일 |
| `production_difficulty` | "low"\|"medium"\|"high" | `MidPreview.production_difficulty` ('low'\|'medium'\|'high') (pipeline.ts:314) | ✅ | enum 3값 완전 일치 |
| `warnings` | ["string", ...] | `MidPreview.warnings: string[]` (pipeline.ts:315) | ✅ | 일치 |

TS `MidPreview` 전 필드 커버리지: `v_recommendations`(+L0/L1/L2_summary/L3_scene_strategy/L4_shot_recipe), `color_script`, `emotional_arc_visualization`, `production_difficulty`, `warnings` — 모두 프롬프트에 존재. 누락 필드 없음(❌ 없음).

#### 코드 변수명
- 함수/파라미터: `runMidPreview` · params `genre`, `narrativeStructure`, `characters`, `scenes`, `validation`(StoryCheckReport), `logger`, `axisConfig`
- 결과·프롬프트 지역변수(실제 식별자): `systemInstruction`(시스템 문자열), `userPrompt`(유저 문자열), `result`(MidPreview, remap 없이 그대로 return)
- 타입: `MidPreview` (pipeline.ts:304); 중첩 참조 `Partial<RenderFormat>` (RenderFormat pipeline.ts:322), `Partial<ArtDirection>` (ArtDirection pipeline.ts:330)

#### 드리프트 메모
- **정합** (키/타입/enum): 프롬프트 JSON 23개 키(중첩 포함) 전부 `MidPreview`와 1:1, snake_case 일관, remap 없음, 누락/잉여 키 없음.
- 단, **상호참조 어휘 drift**: 프롬프트는 facet을 레거시 코드(`S↔V`,`S0~S3`,`V축`,`L0`~`L4`,`C 검증 결과`)로 지칭. JSON 키 `L0`/`L1`/`L2_summary`/`L3_scene_strategy`/`L4_shot_recipe`는 앱 파이프라인 라벨 L0~L4 어휘를 그대로 키명에 박아둔 형태 — CLAUDE.md 글로서리상 "L0~L4는 앱 라벨(제품 단계)이며 코드 식별자엔 없다"는 원칙과 충돌(여기선 코드 타입의 실제 키로 박혀 있음). facet 리네임 시 `L0/L1` 키 vs `renderFormat`/`artDirection` 후속 스테이지 어휘 간 매핑 인지 필요.
- L2_summary/L3_scene_strategy/L4_shot_recipe는 string 단일 힌트일 뿐, 후속 스테이지의 풀 L2(`ProductionDesign`)/L3(`SceneCinematography`)/L4(`ShotDesign`) 구조와 동명이지 다른 깊이 — 이름 충돌 주의(요약 힌트 ↔ 완전 구조).


### l0_l1_visual.ts — facet `renderFormat`
- entry fn: `runRenderFormatArtDirection(genre: Genre, midPreview: MidPreview, logger: PipelineLogger, axisConfig: LlmAxisConfig): Promise<RenderFormatArtDirectionResult>` · WriterRunState field: `renderFormat` (steps.ts:73, patched steps.ts:193) · step key: `visualFormat` (steps.ts:187) · log file: `08_renderFormat_artDirection.json` (l0_l1_visual.ts:61)
- 프롬프트 자기-라벨: "당신은 Visual 축 renderFormat(매체/포맷)과 artDirection(비주얼 스타일)을 확정한다." (`l0_l1_visual.ts:19`)
- 프롬프트 상호참조(레거시 S/L/C 코드): 없음 (systemInstruction/userPrompt 내 S/L/C prefix 코드 미사용; "Visual 축"만 언급, l0_l1_visual.ts:19)

#### 프롬프트 JSON 출력 키 ↔ TS 타입 필드
프롬프트 출력 형식(l0_l1_visual.ts:43-47)은 `{ "renderFormat": {...full RenderFormat}, "artDirection": {...full ArtDirection} }` — 즉 renderFormat 키 하위 구조는 명시적 JSON 스켈레톤이 아니라 systemInstruction의 "renderFormat 필수:" 불릿(l0_l1_visual.ts:22-27)으로 규정. 아래 표는 그 불릿 = TS `RenderFormat`(pipeline.ts:322-328) 대응.

| 프롬프트 JSON key (중첩 a.b) | 프롬프트 값타입/enum | 대응 TS 필드 | 일치 | 비고 |
|---|---|---|---|---|
| renderFormat | object (래퍼) | (래퍼; state.renderFormat에 매핑) | ✅ | 프롬프트 래퍼 키 = result.renderFormat = WriterRunState.renderFormat (steps.ts:193) |
| renderFormat.medium | "live_action_stylized" \| "3d_cgi" \| "2d_animation" 등 (예시 string, 자유) | medium: string | ✅ | TS는 자유 string; 프롬프트는 enum 예시만 제시 |
| renderFormat.resolution | { width, height } | resolution: { width: number; height: number } | ✅ | width/height 하위키 타입은 프롬프트 미명시(number 암묵) |
| renderFormat.resolution.width | (number 암묵) | resolution.width: number | ⚠️ | 프롬프트가 "width, height"만 나열, 타입 미표기 — number는 TS에서만 강제 |
| renderFormat.resolution.height | (number 암묵) | resolution.height: number | ⚠️ | 동상 |
| renderFormat.fps | 24 \| 30 \| 60 (number enum) | fps: number | ✅ | TS는 일반 number; 프롬프트는 3값 제한 |
| renderFormat.aspect_ratio | "16:9" \| "9:16" \| "2.39:1" 등 (string) | aspect_ratio: string | ✅ | snake_case, 양쪽 일치 |
| renderFormat.rendering_method | "stylized_pbr" \| "cel_shaded" \| "photorealistic" 등 (string) | rendering_method: string | ✅ | snake_case, 양쪽 일치 |

#### 코드 변수명
- 함수/파라미터: `runRenderFormatArtDirection` / params `genre, midPreview, logger, axisConfig` (l0_l1_visual.ts:11-16)
- 결과·프롬프트 지역변수(실제 식별자): `systemInstruction` (l0_l1_visual.ts:19), `userPrompt` (l0_l1_visual.ts:37), `result` (l0_l1_visual.ts:49); steps.ts에서 호출 결과 `r`, patch `{ renderFormat: r.renderFormat, ... }` (steps.ts:191-193)
- 로컬 결과 타입: `interface RenderFormatArtDirectionResult { renderFormat: RenderFormat; artDirection: ArtDirection }` (l0_l1_visual.ts:6-9)
- 타입 `RenderFormat` (pipeline.ts:322-328)

#### 드리프트 메모
- **step key ↔ 출력필드 불일치**: WRITER_STEPS key = `visualFormat` (steps.ts:187) 이지만 이 단계는 `renderFormat`+`artDirection` 두 필드를 산출하고 로그는 `08_renderFormat_artDirection.json`. "visualFormat"이라는 이름의 state 필드/타입/로그는 어디에도 없음 — step key가 facet명과 완전 분리됨.
- **markStage/saveLlmCall 라벨 ↔ step key 불일치**: 내부 stage 라벨은 `'renderFormat_artDirection'` (l0_l1_visual.ts:17,54,62), step key는 `'visualFormat'`, flushRawLlm도 `'renderFormat_artDirection'` (steps.ts:192). 동일 단계에 3종 이름 공존(visualFormat / renderFormat_artDirection / renderFormat+artDirection).
- **이중 facet, 단일 프롬프트**: 한 LLM 호출이 renderFormat+artDirection을 동시 생성 후 steps.ts:193에서 `r.renderFormat`/`r.artDirection`로 분해해 별개 state 필드에 기록 (LLM-response→state 분할 remap 존재).
- 키 케이스: 프롬프트·TS 모두 snake_case(medium/resolution/fps/aspect_ratio/rendering_method) 일관 — camelCase 충돌 없음. (래퍼 키 renderFormat/artDirection만 camelCase, 이는 TS 필드명과도 일치.)
- 값 enum 좁힘: 프롬프트가 medium/fps/aspect_ratio/rendering_method에 예시 enum을 제시하나 TS는 전부 자유 string/number — 런타임 검증 없음(생성 후 타입가드 미존재).

---

### l0_l1_visual.ts — facet `artDirection`
- entry fn: `runRenderFormatArtDirection(genre: Genre, midPreview: MidPreview, logger: PipelineLogger, axisConfig: LlmAxisConfig): Promise<RenderFormatArtDirectionResult>` · WriterRunState field: `artDirection` (steps.ts:74, patched steps.ts:193) · step key: `visualFormat` (steps.ts:187) · log file: `08_renderFormat_artDirection.json` (l0_l1_visual.ts:61)
- 프롬프트 자기-라벨: "당신은 Visual 축 renderFormat(매체/포맷)과 artDirection(비주얼 스타일)을 확정한다." (`l0_l1_visual.ts:19`)
- 프롬프트 상호참조(레거시 S/L/C 코드): 없음 ("Visual 축"만 언급, l0_l1_visual.ts:19; S/L/C prefix 코드 미사용)

#### 프롬프트 JSON 출력 키 ↔ TS 타입 필드
프롬프트 출력 래퍼 `{ ..., "artDirection": {...full ArtDirection} }` (l0_l1_visual.ts:46); 하위 구조는 systemInstruction "artDirection 필수:" 불릿(l0_l1_visual.ts:29-34) = TS `ArtDirection`(pipeline.ts:330-336).

| 프롬프트 JSON key (중첩 a.b) | 프롬프트 값타입/enum | 대응 TS 필드 | 일치 | 비고 |
|---|---|---|---|---|
| artDirection | object (래퍼) | (래퍼; state.artDirection에 매핑) | ✅ | 프롬프트 래퍼 키 = result.artDirection = WriterRunState.artDirection (steps.ts:193) |
| artDirection.art_style | "noir" \| "ghibli_like" \| "anime" 등 (string) | art_style: string | ✅ | snake_case, 양쪽 일치 |
| artDirection.shape_language | "angular" \| "round" \| "mixed" (string) | shape_language: string | ✅ | TS는 자유 string; 프롬프트는 3값 제시 |
| artDirection.line_quality | "clean" \| "variable_weight" \| "rough" (string) | line_quality: string | ✅ | 동상 |
| artDirection.character_proportion | "7:1" \| "8:1" 등 (string) | character_proportion: string | ✅ | snake_case, 양쪽 일치 |
| artDirection.texture_philosophy | "photorealistic" \| "painterly" \| "flat" 등 (string) | texture_philosophy: string | ✅ | snake_case, 양쪽 일치 |

#### 코드 변수명
- 함수/파라미터: `runRenderFormatArtDirection` / params `genre, midPreview, logger, axisConfig` (l0_l1_visual.ts:11-16) — renderFormat과 동일 함수(facet 공유)
- 결과·프롬프트 지역변수(실제 식별자): `systemInstruction`, `userPrompt`, `result` (l0_l1_visual.ts:19,37,49); steps.ts 호출 결과 `r`, patch `r.artDirection` (steps.ts:191,193)
- 로컬 결과 타입: `RenderFormatArtDirectionResult.artDirection` (l0_l1_visual.ts:6-9)
- 타입 `ArtDirection` (pipeline.ts:330-336)

#### 드리프트 메모
- step key `visualFormat`(steps.ts:187)는 artDirection facet과도 직접 매칭되지 않음 — renderFormat 블록의 동일 드리프트 적용(단일 step이 2 facet 산출).
- 키 케이스: 프롬프트·TS 모두 snake_case(art_style/shape_language/line_quality/character_proportion/texture_philosophy) 완전 일치 — remap·충돌 없음.
- 값 enum 좁힘: 프롬프트가 모든 필드에 예시/제한 enum 제시하나 TS는 전부 자유 string — 런타임 강제 없음.
- 누락/잉여 키 없음: 프롬프트 5개 불릿 ↔ TS 5개 필드 1:1 완전 대응.

---

### l2_design.ts — facet `productionDesign`
- entry fn: `runProductionDesign(characters: Characters, scenes: Scenes, artDirection: ArtDirection, midPreview: MidPreview, logger: PipelineLogger, axisConfig: LlmAxisConfig): Promise<ProductionDesign>` · WriterRunState field: `productionDesign` (steps.ts:75, patched steps.ts:219) · step key: `productionDesign` (steps.ts:197) · log file: `09_productionDesign.json` (l2_design.ts:87)
- 프롬프트 자기-라벨: "당신은 V축 L2(프로덕션 디자인) 디자이너이다." (`l2_design.ts:25`)
- 프롬프트 상호참조(레거시 S/L/C 코드): `V축 L2` (l2_design.ts:25), `S2.appearance_description` (l2_design.ts:31) — 레거시 S 코드 참조. (참고: TS 필드명은 실제로 `StoryCharacter.appearance_description`, pipeline.ts:220)

#### 프롬프트 JSON 출력 키 ↔ TS 타입 필드
프롬프트 출력 스켈레톤(l2_design.ts:50-73) = TS `ProductionDesign`(pipeline.ts:338-354).

| 프롬프트 JSON key (중첩 a.b) | 프롬프트 값타입/enum | 대응 TS 필드 | 일치 | 비고 |
|---|---|---|---|---|
| global_palette | object | global_palette: object | ✅ | snake_case 일치 |
| global_palette.primary | "string" | global_palette.primary: string | ✅ | |
| global_palette.secondary | "string" | global_palette.secondary: string | ✅ | |
| global_palette.accent | "string" | global_palette.accent: string | ✅ | |
| global_palette.forbidden | ["string", ...] | global_palette.forbidden: string[] | ✅ | 배열, 일치 |
| color_meaning | { "color_name": "meaning" } (동적 키 객체) | color_meaning: Record<string, string> | ✅ | 프롬프트 예시 키 `color_name`은 placeholder(실제 색명이 키), TS Record와 의미 일치 |
| color_meaning.color_name | "meaning" (string, 동적 키) | Record<string,string> value | ✅ | `color_name`은 리터럴 키 아님 — 동적 키 예시 |
| locations | [ {...} ] (array) | locations: Array<{...}> | ✅ | snake_case 일치 |
| locations[].id | "string (location name)" | locations[].id: string | ✅ | 프롬프트 주석: id=location name (uniqueLocations 문자열과 매칭 의도, l2_design.ts:23) |
| locations[].style_description | "string" | locations[].style_description: string | ✅ | snake_case 일치 |
| locations[].lighting_sources | ["string", ...] | locations[].lighting_sources: string[] | ✅ | 배열, 일치 |
| locations[].props | ["string", ...] | locations[].props: string[] | ✅ | 배열, 일치 |
| costumes | { "character_id": ["item1", ...] } (동적 키 객체) | costumes: Record<string, string[]> | ✅ | `character_id`는 placeholder 키(실제 char id가 키), value=string[] 일치 |
| costumes.character_id | ["item1", "item2", ...] (string[], 동적 키) | Record<string,string[]> value | ✅ | 동적 키 예시 |
| vfx_approach | "string" | vfx_approach: string | ✅ | snake_case 일치 |

#### 코드 변수명
- 함수/파라미터: `runProductionDesign` / params `characters, scenes, artDirection, midPreview, logger, axisConfig` (l2_design.ts:12-19)
- 결과·프롬프트 지역변수(실제 식별자): `uniqueLocations` (l2_design.ts:23, scenes에서 location 중복제거), `systemInstruction` (l2_design.ts:25), `userPrompt` (l2_design.ts:38), `result` (l2_design.ts:75); steps.ts 호출 결과 `productionDesign`, patch `{ productionDesign }` (steps.ts:201,219)
- 타입 `ProductionDesign` (pipeline.ts:338-354)

#### 드리프트 메모
- **정합** (key 차원): 프롬프트 출력 스켈레톤의 모든 키가 `ProductionDesign` TS 필드와 1:1, snake_case 일관, 누락/잉여/케이스 충돌 없음. LLM-response→state remap 없음(`runProductionDesign` 반환값을 그대로 `{ productionDesign }`으로 patch, steps.ts:219).
- 동적-키 객체 2종(color_meaning, costumes): 프롬프트 스켈레톤이 placeholder 리터럴 키(`"color_name"`, `"character_id"`)를 보여줘 LLM이 이를 그대로 키로 출력할 소지 있음(드리프트 위험) — TS `Record`는 임의 키 허용이라 타입 에러는 안 나지만, 의도는 "실제 색명/캐릭터 id가 키". TS 차원에선 무해, 데이터 품질 차원의 잠재 risk.
- `locations[].id` 의미 결합: 프롬프트가 id를 "location name"으로 지정(l2_design.ts:63) → 입력 `uniqueLocations`(scene.location 문자열, l2_design.ts:23)와 string-match 전제. AssetItem.id(pipeline.ts:83)와 후속 매칭이 이 문자열 동일성에 의존하나 본 stage 코드엔 강제 없음(프롬프트 지시만).
- 레거시 코드 참조 잔존: systemInstruction이 `S2.appearance_description`(l2_design.ts:31)·`V축 L2`(l2_design.ts:25)로 옛 S/V/L 코드 표기 사용 — CLAUDE.md 글로서리상 2026-06-05 리네임으로 폐기된 S/L prefix가 프롬프트 본문에 남아있음. (코드 식별자엔 영향 없음, 프롬프트 텍스트 한정.)


### l3_scene_plan.ts — facet `sceneCinematography`
- entry fn: `runSceneCinematography(genre: Genre, characters: Characters, scenes: Scenes, artDirection: ArtDirection, productionDesign: ProductionDesign, midPreview: MidPreview, logger: PipelineLogger, axisConfig: LlmAxisConfig): Promise<L3Result>` · WriterRunState field: `sceneCinematography` (PipelineResult.sceneCinematography: SceneCinematography[]) · log file: `10_sceneCinematography.json`
- 프롬프트 자기-라벨: "당신은 V축 L3(씬 비주얼 플랜) 설계자이다." (`l3_scene_plan.ts:50`)
- 프롬프트 상호참조(레거시 S/L/C 코드): `S3` (`l3_scene_plan.ts:51`), `L0~L2` (`l3_scene_plan.ts:52`), `L4` (`l3_scene_plan.ts:52`), `L3` (`l3_scene_plan.ts:50,52`); 비-stage 참조 `180°`/`spatial_axis_180` (`l3_scene_plan.ts:57,129`); midPreview 키 `L3_scene_strategy` (`l3_scene_plan.ts:108`)

#### 프롬프트 JSON 출력 키 ↔ TS 타입 필드
프롬프트 루트는 `{ "scene_plans": [ {…} ] }` (`l3_scene_plan.ts:114-138`). TS는 `SceneCinematography` (pipeline.ts:361-403) — 배열 요소 객체와 1:1. 래퍼 키 `scene_plans`는 `L3Result.scene_plans`/`generateJson<{ scene_plans: SceneCinematography[] }>` 필드명일 뿐, `SceneCinematography`에는 없음(설계상 정상).

| 프롬프트 JSON key (중첩 a.b, 배열 a[].b) | 프롬프트 값타입/enum | 대응 TS 필드 | 일치 | 비고 |
|---|---|---|---|---|
| scene_plans | array(객체) | (L3Result.scene_plans / 래퍼) | ⚠️ | `SceneCinematography`에는 없는 래퍼 키. `L3Result.scene_plans`·LLM 응답 제네릭 타입에만 존재. snake_case 동일. |
| scene_plans[].scene_id | string ("scene_X") | scene_id: string | ✅ | snake_case 동일 |
| scene_plans[].coverage_pattern | string ("shot_reverse" 예시) | coverage_pattern: 'master_inserts'\|'shot_reverse'\|'developing'\|'handheld_continuous'\|'montage'\|'single_take' | ✅ | 프롬프트 예시값 1개만 노출; enum 전체는 systemInstruction 가이드(`l3:60-66`)에 master_inserts/shot_reverse/developing/handheld_continuous/montage/single_take 6종 모두 등장 → TS와 일치 |
| scene_plans[].shot_count_target | number (6) | shot_count_target: number | ✅ | snake_case 동일 |
| scene_plans[].lens_vocabulary | number[] ([50]) | lens_vocabulary: number[] | ✅ | snake_case 동일 |
| scene_plans[].camera_mounting | string ("handheld") | camera_mounting: 'tripod'\|'handheld'\|'gimbal'\|'steadicam'\|'mixed' | ⚠️ | 키명 일치. 프롬프트 예시값 "handheld"는 enum 내. **단 프롬프트는 enum 후보군을 미명시**(가이드 섹션에도 mounting 후보 목록 없음) — 모델이 tripod/gimbal/steadicam/mixed를 알 단서 부족. |
| scene_plans[].camera_energy | string ("breathing") | camera_energy: 'static'\|'breathing'\|'kinetic' | ✅ | 키명 일치. enum 3종 static/breathing/kinetic 모두 systemInstruction(`l3:75-78`)에 명시 |
| scene_plans[].lighting_arc | object | lighting_arc: {…} | ✅ | snake_case 동일 |
| scene_plans[].lighting_arc.start_K | number (3200) | lighting_arc.start_K: number | ✅ | 대소문자 포함 동일(start_K) |
| scene_plans[].lighting_arc.end_K | number (3200) | lighting_arc.end_K: number | ✅ | 동일(end_K) |
| scene_plans[].lighting_arc.dominant_ratio | string ("4:1") | lighting_arc.dominant_ratio: string | ✅ | snake_case 동일 |
| scene_plans[].lighting_arc.quality | string ("soft") | lighting_arc.quality: 'hard'\|'soft'\|'diffused' | ⚠️ | 키명 일치. 프롬프트 예시 "soft"는 enum 내. **프롬프트는 hard/diffused 후보 미명시** (lens 가이드의 lighting과 무관). 단, camera_energy/lighting 별도. 모델이 enum 전체 알 단서 부족. |
| scene_plans[].palette_emphasis | string[] (["#color1","#color2"]) | palette_emphasis: string[] | ✅ | snake_case 동일 |
| scene_plans[].dominant_pov | string ("character_id") | dominant_pov: string | ✅ | snake_case 동일. TS 주석상 character_id\|"omniscient" |
| scene_plans[].spatial_axis_180 | object {from_char,to_char} | spatial_axis_180?: {from_char;to_char} | ✅ | snake_case 동일. TS는 optional(?), 프롬프트는 항상 출력 예시 — 대화 씬만 필수라는 규칙은 systemInstruction(`l3:57`) |
| scene_plans[].spatial_axis_180.from_char | string ("id_a") | spatial_axis_180.from_char: string | ✅ | snake_case 동일 |
| scene_plans[].spatial_axis_180.to_char | string ("id_b") | spatial_axis_180.to_char: string | ✅ | snake_case 동일 |
| scene_plans[].rhythm_profile | string ("sustained") | rhythm_profile: 'accelerating'\|'sustained'\|'decaying'\|'punctuated' | ⚠️ | 키명 일치. 프롬프트 예시 "sustained"는 enum 내. enum 4종(accelerating/sustained/decaying/punctuated) 중 sustained/accelerating/decaying/punctuated 모두 systemInstruction cut_pace↔rhythm 가이드(`l3:80-84`)에 등장 → 단서 있음 |
| scene_plans[].cut_pace | string ("medium") | cut_pace: 'long_takes'\|'medium'\|'rapid' | ✅ | 키명 일치. enum 3종 long_takes/medium/rapid 모두 가이드(`l3:80-84`)에 등장 |
| scene_plans[].avg_shot_seconds | number (8) | avg_shot_seconds: number | ✅ | snake_case 동일 |
| scene_plans[].silence_intentional | boolean (false) | silence_intentional: boolean | ✅ | snake_case 동일 |
| scene_plans[].sound_motif_hints | string[] (["..."]) | sound_motif_hints: string[] | ✅ | snake_case 동일 |
| scene_plans[].visual_intent | string (1줄) | visual_intent: string | ✅ | snake_case 동일 |

TS 필드 역방향 커버리지: `SceneCinematography`의 모든 필드(scene_id, coverage_pattern, shot_count_target, lens_vocabulary, camera_mounting, camera_energy, lighting_arc{start_K,end_K,dominant_ratio,quality}, palette_emphasis, dominant_pov, spatial_axis_180{from_char,to_char}, rhythm_profile, cut_pace, avg_shot_seconds, silence_intentional, sound_motif_hints, visual_intent)가 프롬프트 출력 예시에 모두 존재 ✅. 누락 TS 필드 없음(❌ 없음).

#### 코드 변수명
- 함수/파라미터: `runSceneCinematography` · params `genre`, `characters`, `scenes`, `artDirection`, `productionDesign`, `midPreview`, `logger`, `axisConfig`
- 결과·프롬프트 지역변수(실제 식별자): `sceneAnalyses` (씬별 action budget), `allBudgetIssues`, `sceneToShotHint`, `systemInstruction`, `userPrompt`, `llmResult` (타입 `{ scene_plans: SceneCinematography[] }`), `shotCountTotal`
- 반환 타입: `L3Result` { scene_plans: SceneCinematography[]; shot_count_total: number; budget_issues: ValidationIssue[] } (l3_scene_plan.ts:18-22, 로컬 인터페이스 — pipeline.ts 아님)
- 핵심 타입 `SceneCinematography` (pipeline.ts:361); 부수 `ValidationIssue` (pipeline.ts:275), `MidPreview` (pipeline.ts:304)

#### 드리프트 메모
- **LLM 응답 → state 키 remap: 부분 분리 있음.** LLM은 `{ scene_plans }`만 반환(`generateJson<{ scene_plans: SceneCinematography[] }>`, l3:140). 코드가 (a) `shot_count_total`을 `reduce`로 계산(l3:152-155), (b) `budget_issues`를 LLM 외부 validator `analyzeSceneActionBudget`에서 산출(l3:37-41)해 합성. 즉 `L3Result`/저장 JSON의 3키 중 `scene_plans`만 LLM 출력이고 `shot_count_total`·`budget_issues`는 코드 생성 → 과제 예시(scene_plans/budget_issues split)에 해당.
- 저장(`10_sceneCinematography.json`)과 반환 객체 모두 동일 3키(scene_plans, shot_count_total, budget_issues) 사용 — 일관.
- snake_case vs camelCase: 프롬프트 JSON 키·TS 필드 모두 일관된 snake_case. **함수/스테이지 식별자만 camelCase**(`sceneCinematography`, `shotCountTotal`, `runSceneCinematography`) — 데이터 필드와 코드 식별자 컨벤션 분리(정상 패턴).
- `coverage_pattern`/`rhythm_profile`/`cut_pace`/`camera_energy` enum은 systemInstruction 가이드에 후보값 모두 노출되어 모델 단서 충분. 반면 `camera_mounting`(tripod/handheld/gimbal/steadicam/mixed)·`lighting_arc.quality`(hard/soft/diffused)는 **출력 예시에 1개 값만, 가이드에도 후보 미열거** → 모델이 TS enum 전체를 알 단서 부족(잠재 드리프트, 키명 자체는 정합).

---

### decoupage.ts — facet `decoupage`
- entry fn: `runDecoupage(genre: Genre, characters: Characters, scenes: Scenes, _artDirection: ArtDirection, productionDesign: ProductionDesign, sceneCinematographyPlans: SceneCinematography[] | null, logger: PipelineLogger, axisConfig: LlmAxisConfig): Promise<DecoupagePlan>` (per-scene 내부 fn `decoupageForScene(...): Promise<SceneDecoupage>`, prompt fn `buildUserPrompt(...): string`) · WriterRunState field: `decoupage` (DecoupagePlan; PipelineResult에는 직접 필드 없음 — shotDesign 입력으로 사용) · log file: `10b_decoupage.json` (per-scene LLM call: `decoupage_<scene_id>`)
- 프롬프트 자기-라벨: "당신은 영화 감독이다. 한 씬의 내러티브 비트(scene_actions)를 받아 *데쿠파주(découpage)* — 샷 분해 — 를 저작한다." (`decoupage.ts:25`)
- 프롬프트 상호참조(레거시 S/L/C 코드): 프롬프트 본문(systemInstruction `decoupage.ts:25-56` + buildUserPrompt `81-128`)에는 S/L/C 스테이지 코드 **없음**. 레거시 코드는 파일 헤더 주석에만: `S3` (`decoupage.ts:2`), `L4` (`decoupage.ts:9`), `L4` (`decoupage.ts:167` 주석), `linear_pipeline.md Turn 7` (`decoupage.ts:2`). buildUserPrompt는 `sceneCinematography`를 라벨로 참조(`decoupage.ts:77`).

#### 프롬프트 JSON 출력 키 ↔ TS 타입 필드
프롬프트 루트 `{ shot_count, rhythm_profile, uncovered_beats, shots:[…] }` (`decoupage.ts:108-128`). 이는 LLM 응답 shape = `SceneDecoupageResponse` (decoupage.ts:58-63), TS 영속 타입은 `SceneDecoupage`/`DecoupageShot` (pipeline.ts:459-467, 441-457) + 집계 `DecoupagePlan` (pipeline.ts:469-476).

루트(per-scene 응답) ↔ SceneDecoupage:
| 프롬프트 JSON key | 프롬프트 값타입/enum | 대응 TS 필드 (SceneDecoupage) | 일치 | 비고 |
|---|---|---|---|---|
| shot_count | number | shot_count: number | ⚠️ | 키명 일치. **단 코드가 LLM 값 무시**: `shot_count: shots.length`로 덮어씀(decoupage.ts:198). LLM shot_count는 `SceneDecoupageResponse.shot_count`로만 파싱(decoupage.ts:147), 영속값엔 미반영. |
| rhythm_profile | string (1줄) | rhythm_profile: string | ✅ | snake_case 동일. `parsed.rhythm_profile ?? ''`로 매핑(decoupage.ts:200) |
| uncovered_beats | number[] | uncovered_beats: number[] | ✅ | snake_case 동일. `parsed.uncovered_beats ?? []`(decoupage.ts:201) |
| shots | array(객체) | shots: DecoupageShot[] | ✅ | snake_case 동일. 단 응답 요소는 `Omit<DecoupageShot,'scene_id'>`(decoupage.ts:62) — scene_id는 코드가 주입 |

shots[] 요소(LLM) ↔ DecoupageShot:
| 프롬프트 JSON key (shots[].x) | 프롬프트 값타입/enum | 대응 TS 필드 (DecoupageShot) | 일치 | 비고 |
|---|---|---|---|---|
| shots[].shot_id | string ("shot_<scene_id>_001") | shot_id: string | ⚠️ | 키명 일치. 코드가 **재작성**: 우선 `s.shot_id ?? shot_<scene>_NNN`(decoupage.ts:181), 이후 전역 재인덱싱으로 `shot_<globalIdx>`로 **전부 덮어씀**(decoupage.ts:228-231). LLM 제공 shot_id는 최종 미보존. |
| shots[].operation | enum: derived\|added\|merged\|split | operation: ShotOperation (derived\|added\|merged\|split) | ✅ | **enum 4값 완전 일치** (프롬프트 `decoupage.ts:115` vs ShotOperation pipeline.ts:415-419). 가이드 섹션(`decoupage.ts:32-40`)도 derived/added/merged/split 동일 |
| shots[].shot_function | enum: establishing\|master\|action\|reaction\|insert\|cutaway\|detail\|pov\|reveal\|transition | shot_function: ShotFunction (establishing\|master\|action\|reaction\|insert\|cutaway\|detail\|pov\|reveal\|transition) | ✅ | **enum 10값 완전 일치** (프롬프트 `decoupage.ts:116` vs ShotFunction pipeline.ts:421-431). 순서·철자 동일 |
| shots[].source_beats | number[] ([0]) | source_beats: number[] | ✅ | snake_case 동일. 코드가 비배열 방어 `Array.isArray(s.source_beats)?…:[]`(decoupage.ts:186) |
| shots[].added_rationale | string ("operation=added일 때만") | added_rationale?: string | ✅ | snake_case 동일. TS optional, 프롬프트도 조건부 |
| shots[].beat_summary | string | beat_summary: string | ✅ | snake_case 동일 |
| shots[].shot_size | enum: EWS\|WS\|FS\|MFS\|MS\|MCU\|CU\|ECU\|OTS\|2S\|POV | shot_size: 'EWS'\|'WS'\|'FS'\|'MFS'\|'MS'\|'MCU'\|'CU'\|'ECU'\|'OTS'\|'2S'\|'POV' | ✅ | **enum 11값 완전 일치** (프롬프트 `decoupage.ts:120` vs pipeline.ts:451). 순서·철자 동일 |
| shots[].intended_duration_seconds | number (6) | intended_duration_seconds: number | ✅ | snake_case 동일 |
| shots[].rhythm_role | enum: establish\|develop\|punctuate\|sustain\|accelerate\|breath | rhythm_role: RhythmRole (establish\|develop\|punctuate\|sustain\|accelerate\|breath) | ✅ | **enum 6값 완전 일치** (프롬프트 `decoupage.ts:122` vs RhythmRole pipeline.ts:433-439). 순서·철자 동일 |
| shots[].camera_intent | enum: static\|motivated_move | camera_intent: 'static'\|'motivated_move' | ✅ | **enum 2값 완전 일치** (프롬프트 `decoupage.ts:123` vs pipeline.ts:454) |
| shots[].camera_move_motivation | string ("motivated_move일 때만") | camera_move_motivation?: string | ✅ | snake_case 동일. TS optional, 프롬프트 조건부 |
| shots[].dramatic_purpose | string ("왜 이 샷인가") | dramatic_purpose: string | ✅ | snake_case 동일 |
| (없음 — 프롬프트 미출력) | — | scene_id: string | ⚠️ | DecoupageShot.scene_id는 **프롬프트에 없음**(응답은 Omit<…,'scene_id'>). 코드가 주입(decoupage.ts:185). 설계상 정상. |

SceneDecoupage 코드-생성(프롬프트 미존재) 필드:
| TS 필드 (SceneDecoupage) | 출처 | 일치 | 비고 |
|---|---|---|---|
| scene_id | 코드 주입 `scene.scene_id` (decoupage.ts:196) | ⚠️ | 프롬프트 루트엔 없음(buildUserPrompt 입력엔 존재). 코드 생성. |
| beat_count | 코드 `scene.scene_actions.length` (decoupage.ts:194,197) | ⚠️ | 프롬프트 출력 아님. 코드 계산. |
| coverage_ratio | 코드 `shots.length/beatCount` (decoupage.ts:199) | ⚠️ | 프롬프트 출력 아님. 코드 계산. |

DecoupagePlan(집계 — 전부 코드 생성, LLM 직접 출력 아님; pipeline.ts:469-476):
| TS 필드 (DecoupagePlan) | 출처 | 일치 | 비고 |
|---|---|---|---|
| scenes | `sceneDecoupages` 누적 (decoupage.ts:235) | ⚠️ | 코드 집계. SceneDecoupage[] |
| total_shots | `allShots.length` (decoupage.ts:237) | ⚠️ | 코드 계산 |
| total_added | `filter(operation==='added').length` (decoupage.ts:238) | ⚠️ | 코드 계산. operation enum 값 'added' 참조 — ShotOperation과 일치 |
| total_merged | `filter(operation==='merged').length` (decoupage.ts:239) | ⚠️ | 코드 계산. 'merged' 참조 일치 |
| total_split | `filter(operation==='split').length` (decoupage.ts:240) | ⚠️ | 코드 계산. 'split' 참조 일치 |
| director_notes | 씬별 `beat_count→shot_count (rhythm_profile)` join (decoupage.ts:241) | ⚠️ | 코드 생성 문자열 |

#### 코드 변수명
- 함수/파라미터: `runDecoupage` · params `genre`, `characters`, `scenes`, `_artDirection`(언더스코어=의도적 미사용), `productionDesign`, `sceneCinematographyPlans`, `logger`, `axisConfig`. 내부: `decoupageForScene(scene, plan, genre, characters, productionDesign, logger, axisConfig)`, `buildUserPrompt(scene, plan, genre, characters, productionDesign)`, `coerceSceneShots(raw)`
- 결과·프롬프트 지역변수(실제 식별자): `SYSTEM_INSTRUCTION`(모듈 상수), `beatList`, `planHint`, `userPrompt`, `raw`(generateJson<unknown> 응답), `parsed`(타입 `SceneDecoupageResponse`), `shots`(DecoupageShot[]), `sid`, `beatCount`, `sceneDecoupages`(SceneDecoupage[]), `plan`(이중 의미: ① find된 SceneCinematography per scene, decoupage.ts:220 / ② 최종 DecoupagePlan, decoupage.ts:235), `globalIdx`, `allShots`, `sceneDec`
- 응답 shape 타입: `SceneDecoupageResponse` { shot_count?; rhythm_profile?; uncovered_beats?; shots: Omit<DecoupageShot,'scene_id'>[] } (decoupage.ts:58-63, 로컬 인터페이스 — pipeline.ts 아님)
- 핵심 타입: `DecoupagePlan` (pipeline.ts:469), `SceneDecoupage` (pipeline.ts:459), `DecoupageShot` (pipeline.ts:441); enum `ShotOperation` (pipeline.ts:415), `ShotFunction` (pipeline.ts:421), `RhythmRole` (pipeline.ts:433); 부수 `SceneCinematography` (pipeline.ts:361), `StoryScene` (pipeline.ts:241)

#### 드리프트 메모
- **enum 정합: 완벽.** operation(4)=ShotOperation, shot_function(10)=ShotFunction, rhythm_role(6)=RhythmRole, shot_size(11), camera_intent(2) — 5개 enum 모두 프롬프트 리터럴과 TS union 값/철자/순서까지 일치. RhythmRole은 'sustain'·'accelerate'(SceneCinematography.rhythm_profile의 'sustained'/'accelerating'과 다른 단어형) — 두 타입은 별개 enum이므로 혼동 주의지만 각각 내부 정합.
- **LLM 응답 → state 키 remap 다수 (과제 핵심):**
  1. `shot_count`: LLM 출력 무시, `shots.length`로 영속(decoupage.ts:198). LLM 값은 `SceneDecoupageResponse.shot_count`로만 파싱 후 버림.
  2. `shot_id`: LLM 값 → 표준화(`shot_<scene>_NNN`) → **전역 재인덱싱 `shot_<globalIdx>`로 전면 덮어쓰기**(decoupage.ts:225-232). 씬 경계 넘는 순번.
  3. `scene_id`: shots[] 요소에 코드 주입(LLM 응답은 Omit<…,'scene_id'>).
  4. `beat_count`/`coverage_ratio`: 코드 계산 추가.
  5. DecoupagePlan 전체(scenes/total_shots/total_added/total_merged/total_split/director_notes): per-scene 결과 집계 — LLM 직접 출력 아님.
- **응답 shape 방어 정규화**: `coerceSceneShots`(decoupage.ts:131-152)가 3가지 모델 응답 형태(`{shots:[…]}` / `[…]` / `[{shots:[…]}]`)를 단일 `SceneDecoupageResponse`로 흡수. `uncovered_beats` 비배열→[], `shot_count`/`rhythm_profile` 타입가드.
- snake_case vs camelCase: 데이터 필드(프롬프트 JSON + TS)는 일관 snake_case. 식별자만 camelCase(`runDecoupage`, `sceneDecoupages`, `globalIdx`, `beatCount`, `coverceSceneShots`…) + 모듈 상수 `SYSTEM_INSTRUCTION`(UPPER_SNAKE). 데이터/코드 컨벤션 분리 — 정합.
- 변수명 `plan` 이중 사용(per-scene SceneCinematography vs 최종 DecoupagePlan, 같은 함수 스코프 아님이라 충돌 없음) — 가독성상 주의점이나 기능 드리프트 아님.


### l4_shots.ts — facet `shotDesign`
- entry fn: `runShotDesign(genre: Genre, characters: Characters, scenes: Scenes, artDirection: ArtDirection, productionDesign: ProductionDesign, sceneCinematographyPlans: SceneCinematography[] | null, decoupage: DecoupagePlan | null, logger: PipelineLogger, axisConfig: LlmAxisConfig): Promise<ShotDesign[]>` (`l4_shots.ts:26-36`)
  - per-scene worker: `generateL4ForScene(scene: StoryScene, plan: SceneCinematography | null, sceneDec: DecoupageShot[] | null, genre, characters, artDirection, productionDesign, logger, axisConfig): Promise<ShotDesign[]>` (`l4_shots.ts:59-69`) — this is where the prompt + `generateJson` LLM call live.
- WriterRunState field: `shotDesign` (markStage name `'shotDesign'` `l4_shots.ts:38,54`; `PipelineResult.shotDesign: ShotDesign[]` pipeline.ts:691)
- log file:
  - **stage aggregate**: `11_shotDesign.json` (`logger.saveStage('11_shotDesign.json', { shots: allShots, compact_mode })` `l4_shots.ts:53`)
  - **per-scene LLM raw**: `saveLlmCall('L4_shots_${scene.scene_id}', …)` `l4_shots.ts:244`. Logger writes `NNN_<safeLabel>.json` where `NNN` = a non-deterministic global call counter (`llmCallCounter`, padStart 3) and `safeLabel` = label with `[^a-z0-9_-]` → `_` (`logger/index.ts:86-91`). So filename ≈ `NNN_L4_shots_<sceneId>.json` (one per scene; NN prefix is counter-based, not a fixed stage number).
- 프롬프트 자기-라벨: "당신은 V축 L4(샷 실행) 디자이너이다." (`l4_shots.ts:93`)
  - 보조 라벨(주석/프롬프트 본문): "L4는 3분할:" → "L4a (Intent): 연출 의도. story_beat_ref로 scene_actions에 1:1 매핑." / "L4b (Static): Image 생성기 입력. 첫 프레임의 모든 정적 요소." / "L4c (Dynamic): Video 생성기 입력. 5~15초의 동적 변화. 압축 필수." (`l4_shots.ts:105-108`)
- 프롬프트 상호참조(레거시 S/L/C 코드): `L3` (반복: l4_shots.ts:6,73,82, +규칙 83-91), `L3.lens_vocabulary` (83), `L3.camera_mounting + camera_energy` (84), `L3.lighting_arc.start_K~end_K` (86), `L3.lighting_arc.dominant_ratio` (89), `L3.shot_count_target` (90), `L3.spatial_axis_180` (91), `L3.avg_shot_seconds` (113), `L3.palette_emphasis` (간접: TS 주석 pipeline.ts:539), `S3.scenes[i].scene_actions` (간접: TS 주석 pipeline.ts:488). 출력형식 자체-라벨 `L4a/L4b/L4c`는 위 자기-라벨 참고.
- 비고: **compact/decoupage 분기로 프롬프트 텍스트가 달라짐. JSON 출력 스키마(키 집합)는 분기와 무관하게 동일** (출력형식 블록 `l4_shots.ts:168-237`은 분기 밖, 단일 정의). 달라지는 부분:
  - `compactMode` (= `plan === null`, `l4_shots.ts:70`) → `disciplineSection` 두 버전(`l4_shots.ts:72-91`): Compact는 lens/camera_motion/color_temp/key_fill을 L4가 자체 결정, 일반 모드는 L3 vocabulary 강제.
  - `decoupageDriven` (= `sceneDec !== null && sceneDec.length>0`, `l4_shots.ts:71`) → `[데쿠파주 확정 모드]` systemInstruction 블록 추가(`l4_shots.ts:93-102`): 샷 수/경계/순서 고정, `static_spec.shot_type`←데쿠파주 `shot_size`, `intent.duration_seconds`←`intended_duration_seconds`, `dynamic_spec.camera_motion.type`←`camera_intent`, `intent.shot_id`←데쿠파주 `shot_id`. userPrompt에도 `[감독 데쿠파주]` 샷 목록 inject(`l4_shots.ts:157-164`).
  - 샷 목표 수 텍스트도 분기(`l4_shots.ts:165-166`): decoupage=고정 N, compact=`estimated_seconds/8` 근사, 일반=`plan.shot_count_target`.

#### intent (ShotIntent) — 프롬프트 JSON 키 ↔ TS 필드
출력형식 블록 `l4_shots.ts:172-181`; TS `ShotIntent` pipeline.ts:485-495. 모두 snake_case 양측 일치.

| 프롬프트 JSON key | 프롬프트 값타입/enum | 대응 TS 필드 | 일치 | 비고 |
|---|---|---|---|---|
| `intent.shot_id` | string `"shot_<scene>_<NNN>"` | `shot_id: string` | ✅ | 코드가 post-LLM에서 override (remap §드리프트) |
| `intent.scene_id` | string (씬 id 리터럴 주입 `"${scene.scene_id}"`) | `scene_id: string` | ✅ | 코드가 post-LLM에서 override |
| `intent.story_beat_ref` | number (예 `0`) | `story_beat_ref: number` | ✅ | TS 주석=scene_actions index |
| `intent.dramatic_purpose` | string `"..."` | `dramatic_purpose: string` | ✅ | — |
| `intent.duration_seconds` | number (예 `8`) | `duration_seconds: number` | ✅ | decoupage 모드: `intended_duration_seconds` 따르라 지시(l4_shots.ts:100) |
| `intent.duration_justification` | string `"..."` | `duration_justification: string` | ✅ | — |
| `intent.audience_focus` | string `"..."` | `audience_focus: string` | ✅ | — |
| `intent.shot_position_in_scene` | enum `"opening"\|"developing"\|"climax"\|"resolution"\|"transition"` | `shot_position_in_scene: 'opening'\|'developing'\|'climax'\|'resolution'\|'transition'` | ✅ | enum 완전 일치 |

**TS 필드 커버리지(ShotIntent)**: 8/8 모두 프롬프트에 존재. 누락 없음.

#### static_spec (ShotStaticSpec) — 프롬프트 JSON 키 ↔ TS 필드
출력형식 블록 `l4_shots.ts:182-215`; TS `ShotStaticSpec` pipeline.ts:497-545. 모두 snake_case 양측 일치.

| 프롬프트 JSON key | 프롬프트 값타입/enum | 대응 TS 필드 | 일치 | 비고 |
|---|---|---|---|---|
| `static_spec.shot_id` | string | `shot_id: string` | ✅ | post-LLM override |
| `static_spec.lens_mm` | number (예 `50`) | `lens_mm: number` | ✅ | — |
| `static_spec.shot_type` | string (예 `"MS"`) | `shot_type: string` | ✅ | decoupage 모드: `shot_size` 그대로 쓰라 지시(l4_shots.ts:99) |
| `static_spec.camera_angle` | string (예 `"eye_level"`) | `camera_angle: string` | ✅ | — |
| `static_spec.depth_of_field` | enum `"shallow"\|"medium"\|"deep"` | `depth_of_field: 'shallow'\|'medium'\|'deep'` | ✅ | enum 일치 |
| `static_spec.framing` | object | `framing: {…}` | ✅ | 중첩 아래 |
| `static_spec.framing.rule` | string (예 `"thirds"`) | `framing.rule: 'thirds'\|'center'\|'symmetry'\|'diagonal'\|'frame_in_frame'\|'asymmetric'` | ⚠️ | 프롬프트는 예시값 1개("thirds")만 제시, enum 6종 미열거. 형은 맞음(자유 string처럼 보일 수 있음) |
| `static_spec.framing.layers` | object | `framing.layers: {foreground?,midground?,background?}` | ✅ | 중첩 아래 |
| `static_spec.framing.layers.foreground` | string `"..."` | `framing.layers.foreground?: string` | ✅ | TS optional, 프롬프트는 항상 표기 |
| `static_spec.framing.layers.midground` | string `"..."` | `framing.layers.midground?: string` | ✅ | TS optional |
| `static_spec.framing.layers.background` | string `"..."` | `framing.layers.background?: string` | ✅ | TS optional |
| `static_spec.framing.focal_point` | string `"..."` | `framing.focal_point: string` | ✅ | — |
| `static_spec.lighting` | object | `lighting: {…}` | ✅ | 중첩 아래 |
| `static_spec.lighting.key_fill_ratio` | string (예 `"4:1"`) | `lighting.key_fill_ratio: string` | ✅ | — |
| `static_spec.lighting.color_temp_kelvin` | number (예 `3200`) | `lighting.color_temp_kelvin: number` | ✅ | — |
| `static_spec.lighting.quality` | enum (예 `"soft"`) | `lighting.quality: 'hard'\|'soft'\|'diffused'` | ⚠️ | 프롬프트 예시값 "soft" 1개만, enum 3종 미열거 |
| `static_spec.lighting.key_direction` | string (예 `"top_left"`) | `lighting.key_direction: string` | ✅ | — |
| `static_spec.character_blocking[]` | array<object> | `character_blocking: Array<{…}>` | ✅ | 요소 아래 |
| `static_spec.character_blocking[].character_id` | string `"..."` | `…character_id: string` | ✅ | — |
| `static_spec.character_blocking[].position_in_frame` | string (예 `"left_third"`) | `…position_in_frame: string` | ✅ | — |
| `static_spec.character_blocking[].pose` | string `"..."` | `…pose: string` | ✅ | — |
| `static_spec.character_blocking[].gaze` | string (예 `"toward_camera"`) | `…gaze: string` | ✅ | — |
| `static_spec.character_blocking[].asset_version` | string (예 `"v1"`) | `…asset_version: string` | ✅ | systemInstruction에 v1/v2+ 규칙(l4_shots.ts:125-126) |
| `static_spec.prop_placement[]` | array<object> | `prop_placement: Array<{…}>` | ✅ | 요소 아래 |
| `static_spec.prop_placement[].prop` | string `"..."` | `…prop: string` | ✅ | — |
| `static_spec.prop_placement[].position_in_frame` | string `"..."` | `…position_in_frame: string` | ✅ | — |
| `static_spec.prop_placement[].significance` | string `"..."` | `…significance?: string` | ✅ | TS optional, 프롬프트는 표기 |
| `static_spec.palette_emphasis` | array<string> (예 `["#..."]`) | `palette_emphasis: string[]` | ✅ | — |
| `static_spec.texture_notes` | string `"..."` | `texture_notes: string` | ✅ | — |
| `static_spec.color_grading_intent` | string `"..."` | `color_grading_intent: string` | ✅ | — |
| `static_spec.first_frame_prompt` | string `"200~400자 정적 묘사"` | `first_frame_prompt: string` | ✅ | 최종 출력. l5_prompts.ts가 rich-A 소스로 소비(드리프트 §) |
| — (프롬프트 누락) | — | `focal_distance_m?: number` | ❌ | **TS 필드인데 출력형식 블록에 없음**. optional이라 LLM이 안 냄 |

**TS 필드 커버리지(ShotStaticSpec, 최상위)**: shot_id, lens_mm, shot_type, camera_angle, **focal_distance_m(❌)**, depth_of_field, framing, lighting, character_blocking, prop_placement, palette_emphasis, texture_notes, color_grading_intent, first_frame_prompt → `focal_distance_m` 1개만 프롬프트 미요청.

#### dynamic_spec (ShotDynamicSpec) — 프롬프트 JSON 키 ↔ TS 필드
출력형식 블록 `l4_shots.ts:216-234`; TS `ShotDynamicSpec` pipeline.ts:547-585. 모두 snake_case 양측 일치.

| 프롬프트 JSON key | 프롬프트 값타입/enum | 대응 TS 필드 | 일치 | 비고 |
|---|---|---|---|---|
| `dynamic_spec.shot_id` | string | `shot_id: string` | ✅ | post-LLM override |
| `dynamic_spec.camera_motion` | object | `camera_motion: {…}` | ✅ | 중첩 아래 |
| `dynamic_spec.camera_motion.type` | enum (프롬프트 `"static"\|"handheld_drift"\|"dolly_in"\| ...`) | `camera_motion.type: 'static'\|'pan'\|'tilt'\|'dolly_in'\|'dolly_out'\|'tracking'\|'crane'\|'handheld_drift'\|'rack_focus'` | ⚠️ | 프롬프트는 enum 일부+`...`(생략) 표기. TS는 9종 완전. decoupage 모드: `camera_intent` 따르라(l4_shots.ts:101) |
| `dynamic_spec.camera_motion.direction` | string (예 `"forward"`) | `camera_motion.direction?: string` | ✅ | TS optional, 프롬프트는 표기 |
| `dynamic_spec.camera_motion.speed` | enum (예 `"slow"`) | `camera_motion.speed: 'slow'\|'medium'\|'fast'` | ⚠️ | 프롬프트 예시값 "slow" 1개만, enum 3종 미열거 |
| `dynamic_spec.camera_motion.magnitude` | enum (예 `"minimal"`) | `camera_motion.magnitude: 'minimal'\|'moderate'\|'large'` | ⚠️ | 프롬프트 예시값 "minimal" 1개만 |
| `dynamic_spec.character_motion[]` | array<object> | `character_motion: Array<{…}>` | ✅ | 요소 아래. 규칙: 동사 1~2개(l4_shots.ts:117) |
| `dynamic_spec.character_motion[].character_id` | string `"..."` | `…character_id: string` | ✅ | — |
| `dynamic_spec.character_motion[].verb` | string (예 `"고개를 든다"`) | `…verb: string` | ✅ | TS 주석=동사 1~2개 |
| `dynamic_spec.character_motion[].magnitude` | enum (예 `"small"`) | `…magnitude: 'micro'\|'small'\|'medium'\|'large'` | ⚠️ | 프롬프트 예시값 "small" 1개만, enum 4종 미열거 |
| `dynamic_spec.gaze_arc[]` | array<object> | `gaze_arc?: Array<{…}>` | ✅ | TS optional. 요소 아래 |
| `dynamic_spec.gaze_arc[].character_id` | string `"..."` | `…character_id: string` | ✅ | — |
| `dynamic_spec.gaze_arc[].from` | string (예 `"down"`) | `…from: string` | ✅ | — |
| `dynamic_spec.gaze_arc[].to` | string (예 `"toward_camera"`) | `…to: string` | ✅ | — |
| `dynamic_spec.environmental_change` | array (프롬프트 `[]` 빈배열 예시) | `environmental_change?: Array<{type, magnitude}>` | ⚠️ | 프롬프트는 빈배열만 예시, **요소 스키마(type/magnitude) 미제시**. TS에는 `type:string`, `magnitude:'subtle'\|'moderate'\|'strong'` 정의 |
| `dynamic_spec.environmental_change[].type` | (프롬프트 미제시) | `…type: string` | ❌ | 요소 키가 프롬프트 출력형식에 없음(빈배열만). TS 주석 예: rain_intensifies/light_flicker |
| `dynamic_spec.environmental_change[].magnitude` | (프롬프트 미제시) | `…magnitude: 'subtle'\|'moderate'\|'strong'` | ❌ | 요소 키가 프롬프트 출력형식에 없음 |
| `dynamic_spec.transition_in` | string (예 `"cut"`) | `transition_in?: 'cut'\|'fade'\|'dissolve'\|'match_cut'\|'pre_lap'\|'l_cut'` | ⚠️ | TS optional+enum 6종; 프롬프트 예시값 "cut" 1개만 |
| `dynamic_spec.transition_out` | string (예 `"cut"`) | `transition_out?: 'cut'\|'fade'\|'dissolve'\|'match_cut'\|'j_cut'` | ⚠️ | TS optional+enum 5종; 프롬프트 예시값 "cut" 1개만 |
| `dynamic_spec.motion_prompt` | string `"50~80자, 동사 1~2개"` | `motion_prompt: string` | ✅ | 최종 출력. l5_prompts.ts가 rich-A 소스로 소비(드리프트 §) |

**TS 필드 커버리지(ShotDynamicSpec, 최상위)**: shot_id, camera_motion, character_motion, gaze_arc, environmental_change(요소 스키마만 ❌), transition_in, transition_out, motion_prompt → 최상위 키는 모두 프롬프트에 등장. environmental_change만 요소 스키마 미제시.

#### 코드 변수명
- **함수/파라미터**:
  - `runShotDesign(genre, characters, scenes, artDirection, productionDesign, sceneCinematographyPlans, decoupage, logger, axisConfig)` (`l4_shots.ts:26-36`)
  - `generateL4ForScene(scene, plan, sceneDec, genre, characters, artDirection, productionDesign, logger, axisConfig)` (`l4_shots.ts:59-69`)
- **runShotDesign 지역변수**: `compactMode` (37), `allShots: ShotDesign[]` (41), 루프 `scene` (42), `plan` (43), `sceneDec: DecoupageShot[] | null` (48), `sceneShots` (49).
- **generateL4ForScene 지역변수**: `compactMode` (70), `decoupageDriven` (71), `disciplineSection` (72; 분기 프롬프트 변수), `systemInstruction` (93; decoupageDriven/일반 분기 포함), `userPrompt` (128; compact/decoupage 분기 inject 포함), `rawResult` (239), `shots: ShotDesign[]` (256), 방어 파싱 `r` (257), `inner` (267). 표준화 map: 콜백 인자 `shot, i` (283), `sid` (284).
- **LLM 디스패치 식별자**: `generateJson<unknown>(userPrompt, axisConfig, { systemInstruction, temperature: 0.6 })` (239-242), `describeAxisConfig(axisConfig)` (247), `axisConfig.provider` (248).
- **타입**: `ShotDesign` (pipeline.ts:587-591) = `{ intent: ShotIntent; static_spec: ShotStaticSpec; dynamic_spec: ShotDynamicSpec }`; `ShotIntent` (pipeline.ts:485-495); `ShotStaticSpec` (pipeline.ts:497-545); `ShotDynamicSpec` (pipeline.ts:547-585). import alias 동일명 (`l4_shots.ts:9-23`).

#### 드리프트 메모
- **snake↔camel: 드리프트 없음(정합).** 프롬프트 JSON 키와 TS 인터페이스 필드 모두 일관 snake_case. 코드 어디에도 camelCase 변환/remap 없음.
- **post-LLM remap (shot_id/scene_id 강제 override)** — `l4_shots.ts:283-292`: LLM 응답을 `shots.map((shot,i)=>…)`로 재구성. `sid`는 (decoupage 모드면) `sceneDec[i].shot_id`, 아니면 `shot.intent.shot_id ?? shot_<scene_id>_<i+1 padStart3>`. 반환 객체는 세 파트를 spread 후 키 덮어쓰기:
  - `intent: { ...shot.intent, shot_id: sid, scene_id: scene.scene_id }` ← intent의 `shot_id`+`scene_id` 둘 다 코드가 덮어씀(LLM 값 무시 가능).
  - `static_spec: { ...shot.static_spec, shot_id: sid }` ← `shot_id`만 override (static_spec엔 scene_id 필드 없음 — TS에도 없음, 정합).
  - `dynamic_spec: { ...shot.dynamic_spec, shot_id: sid }` ← `shot_id`만 override.
  - 결과: 세 파트의 `shot_id`가 동일 `sid`로 강제 동기화. 이름 충돌/리네임 아님 — **값 정규화**(키 이름은 그대로).
- **LLM 응답 형상 방어 파싱** — `l4_shots.ts:256-280`: 4케이스(`{shots}` / `[{shots}]` / `[{intent,…}]` / `{shots:[{shots}]}`) 언래핑. 키 이름 변경 없음, 배열 깊이만 정규화.
- **first_frame_prompt 다운스트림 관계**: l4 출력 `static_spec.first_frame_prompt`(snake) → **l5_prompts.ts:115-120**가 `shot.static_spec.first_frame_prompt`를 "rich-A" 후보로 읽어 T2I `prompt`로 추출(우선순위: ① ShotSequence `first_frame_generation.composition_prompt`(C2 출력) → ② `static_spec.first_frame_prompt`(L4b)). c_application_2.ts:55,152는 "L4b.first_frame_prompt 그대로 사용" 지시. 필드명 보존, remap 없음.
- **motion_prompt 다운스트림 관계**: l4 출력 `dynamic_spec.motion_prompt`(snake) → **l5_prompts.ts:134-139**가 `shot.dynamic_spec.motion_prompt`를 "rich-A" 후보로 읽어 TI2V `motion_prompt`로 추출(우선순위: ① ShotSequence `video_generation.motion_prompt`(C2 출력) → ② `dynamic_spec.motion_prompt`(L4c)). l7_videos.ts는 `shot.ti2v.motion_prompt`(l5 산출) 사용. adapters.ts:166-168도 `dynamicSpec.motion_prompt`를 action description으로 참조. 필드명 보존, remap 없음.
  - 주의(이름 일치하나 의미상 길이 불일치): L4 `motion_prompt`는 50~80자(l4_shots.ts:119,233 / pipeline.ts:584), 그러나 TI2V `motion_prompt`(pipeline.ts:42)·l5 별도 생성 프롬프트(l5_prompts.ts:260)는 "50~100자". 같은 키명, 길이 가이드 상한만 80↔100 불일치(드리프트성 메모).
- **TS-only 필드(프롬프트 미요청, ❌)**: `static_spec.focal_distance_m?`(pipeline.ts:504), `dynamic_spec.environmental_change[].type`/`.magnitude` 요소 스키마(pipeline.ts:574-577) — 출력형식 블록에 없어 LLM이 생성 안 함(optional이라 타입 에러는 없음).
- **enum 부분 노출(⚠️)**: framing.rule, lighting.quality, camera_motion.type/speed/magnitude, character_motion[].magnitude, transition_in/out — 프롬프트 출력형식이 enum 전체를 안 적고 예시값 1개 또는 `...`로 생략. 키명·형은 정합하나 LLM이 enum 범위를 프롬프트만으로는 못 봄(systemInstruction의 별도 규칙으로 일부 보강: camera_motion.type 제약 l4_shots.ts:84-87).


### c_application_2.ts — facet `shotSequence`
- entry fn: `runShotCheck(projectId: string, genre: Genre, narrativeStructure: NarrativeStructure, characters: Characters, scenes: Scenes, renderFormat: RenderFormat, artDirection: ArtDirection, productionDesign: ProductionDesign, sceneCinematographyPlans: SceneCinematography[], shotDesigns: ShotDesign[], sceneBudgetIssues: ValidationIssue[], logger: PipelineLogger, vAxisConfig: LlmAxisConfig, cAxisConfig: LlmAxisConfig): Promise<{ shotSequence: ShotSequence; report: ShotCheckReport }>` (`c_application_2.ts:32`) · WriterRunState field: `shotSequence` (`steps.ts:82`) · step key: `shotCheck`(공유) · log file: `13_shotSequence.json` (saveStage, `c_application_2.ts:351`) + raw LLM call `shotCheck_generate` (`c_application_2.ts:179`)
- 프롬프트 자기-라벨: "당신은 S+V 변환의 마지막 단계 디자이너이다." (`c_application_2.ts:51`, genSystem)
- 프롬프트 상호참조(레거시 S/L/C 코드): `L4` / `L4a` / `L4b` / `L4c` (`52`, `55-57`, `61-63`), `S3` (`57`), `L4b.first_frame_prompt` (`55`,`152`), `L4c.motion_prompt` (`56`,`155`), `L4a.dramatic_purpose` (`131`), `L4b.character_blocking` (`61`,`63`), `L4b.prop_placement` (`61`), `L4b.framing` (`143`), `L5`/`L6` (`324`, code comment); user 프롬프트 섹션 라벨 `S.`/`C.`/`V.` (`58-60`). 비고: `S/L+숫자` prefix는 폐기됐다고 CLAUDE.md가 명시하나 이 프롬프트엔 `L4*`/`S3` 잔존.

#### 프롬프트 JSON 출력 키 ↔ TS 타입 필드
genSystem→genUser 출력 형식(`c_application_2.ts:120-172`)은 `{ "shots": [ ShotSequenceItem ] }`. TS 대응: 코드 인터페이스 `ShotSequenceGenResponse { shots: ShotSequenceItem[] }` (`c_application_2.ts:23-25`); 각 원소는 `ShotSequenceItem` (`pipeline.ts:597-660`). 최종 반환 컨테이너 `ShotSequence` (`pipeline.ts:662-668`)는 프롬프트가 생성하지 않고 **코드가 조립**(아래 별도 표).

| 프롬프트 JSON key | 프롬프트 값타입/enum | 대응 TS 필드 | 일치 | 비고 |
|---|---|---|---|---|
| `shots[]` | array of object | `ShotSequenceItem[]` (genResponse.shots) | ✅ | 코드 `ShotSequenceGenResponse.shots` → 후처리 후 `ShotSequence.shots` |
| `shots[].shot_id` | string ("shot_1") | `ShotSequenceItem.shot_id: string` | ✅ | 코드가 `shot_${i+1}`로 **재정렬 덮어씀**(`309`) |
| `shots[].duration_seconds` | number (8) | `duration_seconds: number` | ✅ | |
| `shots[].S` | object | `S: {...}` | ✅ | |
| `shots[].S.scene_id` | string | `S.scene_id: string` | ✅ | |
| `shots[].S.scene_purpose` | string | `S.scene_purpose: string` | ✅ | |
| `shots[].S.emotion_beat` | object | `S.emotion_beat: {start;end}` | ✅ | |
| `shots[].S.emotion_beat.start` | string | `S.emotion_beat.start: string` | ✅ | |
| `shots[].S.emotion_beat.end` | string | `S.emotion_beat.end: string` | ✅ | |
| `shots[].S.character_action` | string ("L4a.dramatic_purpose 기반") | `S.character_action: string` | ✅ | |
| `shots[].S.dialogue` | string (선택) | `S.dialogue?: string` | ✅ | 둘 다 optional |
| `shots[].C` | object | `C: {...}` | ✅ | |
| `shots[].C.hook_type` | string enum(10종: curiosity_gap/incomplete_action/interrupted_dialogue/unexplained_detail/micro_incongruence/visual_bait/time_pressure/promise/pattern_break/sensory_pull) | `C.hook_type?: string` | ⚠️ | TS는 그냥 `string`(enum 미고정); 프롬프트는 10-값 열거(`66`). optional 일치(프롬프트 "선택"). |
| `shots[].C.causal_link` | object | `C.causal_link: {from;to}` | ✅ | 코드가 **재계산 덮어씀**(`315-318`) |
| `shots[].C.causal_link.from` | null \| "shot_X" | `C.causal_link.from: string\|null` | ✅ | |
| `shots[].C.causal_link.to` | "shot_Y" \| null | `C.causal_link.to: string\|null` | ✅ | |
| `shots[].C.motif_active` | string (선택) | `C.motif_active?: string` | ✅ | 둘 다 optional |
| `shots[].C.info_disclosure` | string | `C.info_disclosure: string` | ✅ | TS required, 프롬프트 비표시-선택; 형 일치 |
| `shots[].V` | object | `V: {...}` | ✅ | |
| `shots[].V.camera` | object | `V.camera: {type;angle;movement}` | ✅ | |
| `shots[].V.camera.type` | string ("MS") | `V.camera.type: string` | ✅ | |
| `shots[].V.camera.angle` | string ("eye_level") | `V.camera.angle: string` | ✅ | |
| `shots[].V.camera.movement` | string ("static") | `V.camera.movement: string` | ✅ | |
| `shots[].V.lighting` | object | `V.lighting: {key_fill_ratio;color_temp}` | ✅ | |
| `shots[].V.lighting.key_fill_ratio` | string ("4:1") | `V.lighting.key_fill_ratio: string` | ✅ | |
| `shots[].V.lighting.color_temp` | string ("3200K") | `V.lighting.color_temp: string` | ✅ | |
| `shots[].V.composition` | string ("L4b.framing 요약") | `V.composition: string` | ✅ | |
| `shots[].V.mood` | string | `V.mood: string` | ✅ | |
| `shots[].assets` | object | `assets: {...}` | ✅ | |
| `shots[].assets.characters[]` | array obj | `assets.characters: Array<{id;asset_version;visible_parts?}>` | ✅ | |
| `shots[].assets.characters[].id` | string | `.id: string` | ✅ | 코드 normalize로 canonical 강제(`325-328`) |
| `shots[].assets.characters[].asset_version` | string ("v1") | `.asset_version: string` | ✅ | |
| `shots[].assets.characters[].visible_parts` | string[] (["full"]) | `.visible_parts?: string[]` | ✅ | optional |
| `shots[].assets.locations[]` | array obj | `assets.locations: Array<{id;asset_version}>` | ✅ | |
| `shots[].assets.locations[].id` | string | `.id: string` | ✅ | |
| `shots[].assets.locations[].asset_version` | string ("a") | `.asset_version: string` | ✅ | |
| `shots[].assets.props[]` | array obj | `assets.props?: Array<{id;asset_version;first_appearance?}>` | ✅ | optional 배열 |
| `shots[].assets.props[].id` | string | `.id: string` | ✅ | |
| `shots[].assets.props[].asset_version` | string ("v1") | `.asset_version: string` | ✅ | |
| `shots[].assets.props[].first_appearance` | bool (true) | `.first_appearance?: boolean` | ✅ | optional |
| `shots[].first_frame_generation` | object | `first_frame_generation: {base_assets;composition_prompt}` | ✅ | |
| `shots[].first_frame_generation.base_assets` | string[] | `.base_assets: string[]` | ✅ | |
| `shots[].first_frame_generation.composition_prompt` | string (200~400자) | `.composition_prompt: string` | ✅ | |
| `shots[].video_generation` | object | `video_generation: {motion_prompt}` | ✅ | |
| `shots[].video_generation.motion_prompt` | string (50~80자) | `.motion_prompt: string` | ✅ | |
| `shots[].action_budget` | object | `action_budget: {...}` | ✅ | |
| `shots[].action_budget.primary_action_count` | number (1) | `.primary_action_count: number` | ✅ | |
| `shots[].action_budget.secondary_action_count` | number (0) | `.secondary_action_count: number` | ✅ | |
| `shots[].action_budget.camera_movement_complexity` | enum "none"\|"simple"\|"complex" | `.camera_movement_complexity: 'none'\|'simple'\|'complex'` | ✅ | enum 정확히 일치 |
| `shots[].action_budget.environmental_changes` | number (0) | `.environmental_changes: number` | ✅ | |
| `shots[].action_budget.passed_validation` | bool (true) | `.passed_validation: boolean` | ✅ | |
| `shots[].continuity` | object | `continuity: {...}` | ✅ | |
| `shots[].continuity.carry_forward_from` | null \| "shot_X" | `.carry_forward_from: string\|null` | ✅ | |
| `shots[].continuity.consistent_elements` | string[] (["lighting",...]) | `.consistent_elements: string[]` | ✅ | |
| `shots[].continuity.changes` | string[] (["camera_angle",...]) | `.changes: string[]` | ✅ | |
| `shots[].continuity.is_scene_transition` | bool (false) | `.is_scene_transition: boolean` | ✅ | |

ShotSequence 컨테이너(프롬프트 미생성 — 코드 조립, `c_application_2.ts:332-338`):
| TS 필드 (`pipeline.ts`) | 출처 | 일치 |
|---|---|---|
| `project_id: string` (663) | `projectId` 파라미터 | ✅ 코드주입 |
| `total_shots: number` (664) | `finalShots.length` | ✅ 코드주입 |
| `total_duration_seconds: number` (665) | `finalShots.reduce(... duration_seconds)` | ✅ 코드주입 |
| `depth_level: DepthLevel` (666, 'D1'~'D7') | `genre.depth_level` | ✅ 코드주입(프롬프트엔 없음) |
| `shots: ShotSequenceItem[]` (667) | 후처리된 `finalShots` | ✅ |

#### 코드 변수명
- 함수/파라미터: `runShotCheck(...)` (`c_application_2.ts:32-47`); 파라미터 `projectId, genre, narrativeStructure, characters, scenes, renderFormat, artDirection, productionDesign, sceneCinematographyPlans, shotDesigns, sceneBudgetIssues, logger, vAxisConfig`(V축=Gemini, 샷 조립), `cAxisConfig`(C축=Claude, 검증).
- 프롬프트 지역변수: `genSystem` (`51`, systemInstruction), `genUser` (`76`, user prompt), `genRaw` (`174`, LLM 원응답).
- 결과 지역변수: 코드 인터페이스 `ShotSequenceGenResponse {shots}` (`23`); `extractShots()` 헬퍼 (`191`) → `genShots` (`218`) → `genResult` (`222`); 후처리 `finalShots` (`298`,`307`,`311`,`328`); `assetRegistry`(`325`), `sceneLocationById`(`326`), `assetNorm`(`327`), `totalDuration`(`330`); 최종 `shotSequence: ShotSequence` (`332`).
- 타입 (pipeline.ts): `ShotSequenceItem` (597-660), `ShotSequence` (662-668), `DepthLevel` (4).

#### 드리프트 메모
- **S/C/V 중첩 ↔ 프롬프트 키: 정합.** ShotSequenceItem의 `S`/`C`/`V` 대문자 중첩 객체가 프롬프트 출력 형식(`126-144`)과 키·중첩 깊이까지 1:1 일치. (이 facet엔 V 중첩이 아니라 S/C/V 셋 모두; 표 참조.)
- **snake↔camel: 정합(전부 snake_case).** ShotSequenceItem 모든 필드가 snake_case(예: `duration_seconds`, `first_frame_generation`, `carry_forward_from`)이고 프롬프트 JSON 키도 동일 snake_case. camelCase 혼입 없음. remap 없음(키 그대로 매칭).
- **코드 덮어쓰기(프롬프트값 → 코드 재계산).** `shot_id`는 LLM값을 버리고 `shot_${i+1}` 재정렬(`307-310`); `C.causal_link.from/to`는 split 후 인접 shot_id로 재계산(`311-320`). 프롬프트가 from/to를 채우라 하지만 최종값은 코드가 결정 → 프롬프트 지시와 실효 동작 불일치(드리프트 아님이나 주의).
- **컨테이너 키는 프롬프트에 없음.** `project_id`/`total_shots`/`total_duration_seconds`/`depth_level`은 ShotSequence(컨테이너) 필드로 프롬프트 JSON에 부재 — 코드가 주입(`332-338`). 프롬프트는 `shots[]` 배열만 생성.
- **hook_type enum 미고정(⚠️).** 프롬프트는 10값 열거(`66`)지만 TS `C.hook_type?: string`은 자유 문자열 — 타입이 enum을 강제하지 않음.
- **방어적 shape 보정.** LLM이 `{shots}`/`[{shots}]`/`[{shot_id…}]`/`{shot_sequence:{shots}}` 등 변주 응답 → `extractShots()`가 흡수(`191-216`). 키 이름이 `shot_sequence`로 와도 `shots` 추출. snake_case `shot_sequence` 변주만 처리하고 camelCase는 미처리.

---

### c_application_2.ts — facet `shotCheck`
- entry fn: 동일 `runShotCheck(...): Promise<{ shotSequence: ShotSequence; report: ShotCheckReport }>` (`c_application_2.ts:32`; report 부분) · WriterRunState field: `shotCheck` (`steps.ts:83`) · step key: `shotCheck`(공유) · log file: `12_shotCheck.json` (saveStage, `c_application_2.ts:350`) + raw LLM call `shotCheck_validate` (`c_application_2.ts:273`; 실패 시 `shotCheck_validate_FAILED` `287`)
- 프롬프트 자기-라벨: "당신은 샷 시퀀스의 액션 스코프와 의미적 정합성을 검증한다." (`c_application_2.ts:225`, valSystem)
- 프롬프트 상호참조(레거시 S/L/C 코드): 없음(이 검증 프롬프트엔 L4*/S3 잔존 없음). 검증 대상 필드 참조: `motion_prompt`/`duration_seconds`/`composition_prompt` (`228`,`230`,`232`), `continuity.consistent_elements` (`233`), `asset_version` (`234`), `scene_id`/`V.camera.type` (`235`).

#### 프롬프트 JSON 출력 키 ↔ TS 타입 필드
valSystem→valUser 출력 형식(`c_application_2.ts:246-264`): `{ shots_to_split: [...], semantic_issues: [...] }`. 이 출력의 직접 TS 매핑은 **코드 인터페이스** `ClaudeC2ValidationResponse` (`c_application_2.ts:27-30`) — pipeline.ts의 `ShotCheckReport`가 **아님**. `semantic_issues[]` 원소만 `ValidationIssue` (`pipeline.ts:275-281`)와 직접 대응. 최종 facet 타입 `ShotCheckReport` (`pipeline.ts:293-298`)는 프롬프트가 직접 생성하지 않고 코드가 집계(별도 표).

| 프롬프트 JSON key | 프롬프트 값타입/enum | 대응 TS/코드 필드 | 일치 | 비고 |
|---|---|---|---|---|
| `shots_to_split[]` | array obj | 코드: `ClaudeC2ValidationResponse.shots_to_split: Array<{shot_id;reason;new_shots}>` (`28`) | ✅ | pipeline.ts엔 대응 타입 **없음**(코드 로컬 인터페이스). 최종 facet엔 미보존 — split 적용 후 카운트만 남김. |
| `shots_to_split[].shot_id` | string ("shot_X") | `.shot_id: string` | ✅ | |
| `shots_to_split[].reason` | string | `.reason: string` | ✅ | |
| `shots_to_split[].new_shots` | array (분할된 ShotSequenceItem) | `.new_shots: ShotSequenceItem[]` (`28`) | ⚠️ | 프롬프트는 "분할된 ShotSequenceItem 배열" 주석만; 내부 키 스키마 미제시(genSystem의 47키 구조를 LLM이 재현해야 함). 코드는 `ShotSequenceItem[]`로 타입 단언만(검증 없음, `303`). |
| `semantic_issues[]` | array obj | `ValidationIssue[]` (`pipeline.ts:275`) | ✅ | 최종 `ShotCheckReport.issues`에 병합(`340`) |
| `semantic_issues[].category` | enum "action_budget"\|"continuity"\|"verisimilitude" (3값, `257`) | `ValidationIssue.category` (7값: causality\|cdq\|verisimilitude\|cliche\|action_budget\|continuity\|theme) | ⚠️ | 프롬프트 enum이 TS union의 **부분집합**(3/7). TS가 더 넓음 — 프롬프트는 4값(causality/cdq/cliche/theme) 미사용. 형 호환(불일치 아님이나 커버리지 갭). |
| `semantic_issues[].severity` | enum "CRITICAL"\|"WARNING"\|"INFO" | `ValidationIssue.severity: ValidationSeverity` ('CRITICAL'\|'WARNING'\|'INFO', `pipeline.ts:273,277`) | ✅ | enum 정확히 일치(대문자) |
| `semantic_issues[].location` | string ("shot_id") | `ValidationIssue.location: string` | ✅ | |
| `semantic_issues[].message` | string | `ValidationIssue.message: string` | ✅ | |
| `semantic_issues[].suggestion` | string (optional) | `ValidationIssue.suggestion?: string` | ✅ | 둘 다 optional |

ShotCheckReport(facet 최종 타입 — 프롬프트 미생성, 코드 집계, `c_application_2.ts:343-348`):
| TS 필드 (`pipeline.ts:293-298`) | 출처 | 일치 |
|---|---|---|
| `passed: boolean` (294) | `!hasCritical` (allIssues 중 CRITICAL 유무, `341`) | ✅ 코드계산 |
| `issues: ValidationIssue[]` (295) | `[...sceneBudgetIssues, ...valResult.semantic_issues, ...assetNorm.issues]` (`340`) | ✅ 코드병합(프롬프트 semantic_issues + 사전 budget + asset 정규화 이슈) |
| `shots_split_count: number` (296) | `splitCount` (new_shots 추가 누계, `304`) | ✅ 코드계산 |
| `total_action_violations_fixed: number` (297) | `valResult.shots_to_split.length` (`347`) | ✅ 코드계산 |

#### 코드 변수명
- 함수/파라미터: 동일 `runShotCheck(...)`; 검증축은 `cAxisConfig`(C축=Claude, `46`).
- 프롬프트 지역변수: `valSystem` (`225`, systemInstruction), `valUser` (`243`, user prompt), `valRaw` (`268`, LLM 원응답).
- 결과 지역변수: 코드 인터페이스 `ClaudeC2ValidationResponse {shots_to_split, semantic_issues}` (`27-30`); shape 보정 임시 `v` (`280`) → `valResult` (`266`,`281`,`294`); split 루프 `split`/`idx` (`300-301`), `splitCount` (`299`); 집계 `allIssues` (`340`), `hasCritical` (`341`); 최종 `report: ShotCheckReport` (`343`).
- 실패 경로: try/catch(`267-295`) — 검증 실패 시 `valResult = { shots_to_split: [], semantic_issues: [] }` fallback(`294`), 파이프라인 계속(분할 없이).
- 타입 (pipeline.ts): `ShotCheckReport` (293-298), `ValidationIssue` (275-281), `ValidationSeverity` (273).

#### 드리프트 메모
- **step key ↔ 출력 불일치(주의).** WRITER_STEPS key는 `shotCheck` 단일(`steps.ts:309`)이나 이 스테이지는 **두 facet**(shotSequence + shotCheck)을 동시 산출. `steps.ts:310` `has`가 `s.shotSequence !== undefined && s.shotCheck !== undefined` 둘 다 요구; `steps.ts:330`이 `{ shotSequence: result.shotSequence, shotCheck: result.report }` 둘 다 반환. 로그도 2파일(`12_shotCheck.json` + `13_shotSequence.json`, `c_application_2.ts:350-351`; pipeline/index.ts:351 주석 동일 확인). → 한 step key가 2 WriterRunState 필드/2 로그 산출(설계상 의도, 단일↔복수 비대칭).
- **category enum 커버리지 갭(⚠️).** 프롬프트 `semantic_issues[].category`는 3값만(action_budget/continuity/verisimilitude, `257`), TS `ValidationIssue.category`는 7값. 프롬프트가 causality/cdq/cliche/theme를 절대 생성 안 함 → 형은 호환되나 LLM이 좁은 라벨만 사용.
- **snake↔camel: 정합(전부 snake_case).** `shots_to_split`/`semantic_issues`/`shots_split_count`/`total_action_violations_fixed` 등 프롬프트·코드·TS 모두 snake_case. remap 없음(키 그대로).
- **프롬프트 출력 ≠ facet 타입(간접 매핑).** valSystem 프롬프트 출력은 `ClaudeC2ValidationResponse`(코드 로컬) 형태이며 `shots_to_split`는 facet 최종 타입 `ShotCheckReport`에 **필드로 보존되지 않음**(splitCount/length로 환원, `304`,`347`). 즉 프롬프트 키 2개(shots_to_split/semantic_issues) → 최종 4-필드 report로 **변환·집계**되는 비대칭. `semantic_issues`만 `issues`로 직접 흐름(타 소스와 병합).
- **new_shots 키 스키마 미명시(⚠️).** `shots_to_split[].new_shots`는 프롬프트에서 ShotSequenceItem 전체 구조(genSystem의 S/C/V/assets/... 47키)를 요구하나 valUser 프롬프트엔 키 스키마 재제시 없음(주석 `/* 분할된 ShotSequenceItem 배열 */`만). 코드는 타입 단언만 하고 구조 검증 없이 `splice`(`303`) → 이후 `assetNorm`/causal_link 재계산이 일부 보정.
- **severity enum: 정합.** 프롬프트 CRITICAL/WARNING/INFO ↔ TS `ValidationSeverity` 정확 일치(대문자, ShotSequenceItem.action_budget의 소문자 enum과 혼동 주의 — 그건 별개 필드).


### l5_prompts.ts — facet `renderPrompts`
- entry fn: `runRenderPrompts(shotSequence: ShotSequence, renderFormat: RenderFormat, characters: Characters, productionDesign: ProductionDesign, logger: PipelineLogger, axisConfig: LlmAxisConfig): Promise<RenderPromptsOutput>` (`l5_prompts.ts:31`) · WriterRunState field: `renderPrompts` (steps.ts:84 accumulator + PipelineResult pipeline.ts:694) · log file: `14_renderPrompts.json` (`l5_prompts.ts:101`)
- 프롬프트 자기-라벨: T2I "당신은 T2I (Text-to-Image) 프롬프트 디자이너이다." (`:208`) / TI2V "당신은 TI2V (이미지+텍스트→비디오) 프롬프트 디자이너이다." (`:245`)
- 프롬프트 상호참조(레거시 S/L/C 코드): 시스템/유저 프롬프트 본문엔 S/L/C 코드 없음. 코드 주석에만 등장 — `C2` 출력 (`:2`, `:3`, `:117` first_frame_generation.composition_prompt / `:136` video_generation.motion_prompt), `L4b` 출력 (`:120` static_spec.first_frame_prompt), `L4c` 출력 (`:139` dynamic_spec.motion_prompt), `L4 3분할` (`:5`), `L2 global_palette` (`:215` — 이건 T2I system 프롬프트 본문에 실재), `L0.aspect_ratio` (pipeline.ts:35 주석). rich-A / declared-B 스키마 명칭 (`:5`, `:113`, `:116`).

#### renderPrompts 컨테이너 (RenderPromptsOutput) 필드
| TS 필드 | 설명 | 비고(프롬프트 출력 아님/메타) |
|---|---|---|
| `total_shots: number` | 샷 개수 (`shots.length`, `:85`) | 메타 (코드 집계) |
| `shots: ShotGenerationPrompts[]` | 샷별 t2i/ti2v 묶음 (`:64-81`) | 컨테이너 (요소 = ShotGenerationPrompts) |
| `l0_meta.aspect_ratio: string` | renderFormat.aspect_ratio (`:88`) | 메타 (renderFormat 복사, 프롬프트 출력 아님) |
| `l0_meta.fps: number` | renderFormat.fps (`:89`) | 메타 (renderFormat 복사) |
| `l0_meta.resolution: {width,height}` | renderFormat.resolution (`:90`) | 메타 (renderFormat 복사) |
| `extraction_summary.t2i_extracted: number` | 추출 성공 샷 수 = `shots.length - t2iFallbacks` (`:93`) | 메타 (추출 vs LLM 집계) |
| `extraction_summary.t2i_llm_generated: number` | LLM fallback 샷 수 = `t2iFallbacks` (`:94`) | 메타 |
| `extraction_summary.ti2v_extracted: number` | = `shots.length - ti2vFallbacks` (`:95`) | 메타 |
| `extraction_summary.ti2v_llm_generated: number` | = `ti2vFallbacks` (`:96`) | 메타 |
| `extraction_summary.llm_axis: string` | `describeAxisConfig(axisConfig)` 모델 라벨 (`:97`) | 메타 |

ShotGenerationPrompts (요소, pipeline.ts:49-55): `shot_id`(`:65`), `scene_id`(`:66`), `duration_seconds`(`:67`), `t2i`(`:68`), `ti2v`(`:75`). — 모두 코드/추출 값, 프롬프트 JSON 출력 아님.

#### t2i (T2IPrompt) — 프롬프트 JSON 키 ↔ TS 필드
LLM fallback(`llmGenerateT2I`, `:202-238`) 출력 JSON 스키마 = `{ "prompt": "정적 첫 프레임 묘사 (한글, 200~400자)" }` (`:225`). 추출 경로(`extractT2IPrompt`)는 JSON 아닌 문자열만 반환.

| 프롬프트 JSON key | 프롬프트 값타입/enum | 대응 TS 필드 | 일치 | 비고 |
|---|---|---|---|---|
| `prompt` | string (한글 200~400자) | `T2IPrompt.prompt: string` | ✅ | LLM 출력 키 `prompt` → `r.prompt`(`:237`) → `t2iText` → `.trim()` 후 `t2i.prompt`에 배치(`:69`). 추출 경로도 같은 필드. snake/camel 무관(단일 단어). |
| (없음) | — | `T2IPrompt.negative_prompt?: string` | ❌ | 프롬프트가 생성 안 함. 코드도 채우지 않음(`:68-74`에 미할당) → 항상 undefined. |
| (없음) | — | `T2IPrompt.aspect_ratio: string` | ❌ | 프롬프트 출력 아님. `renderFormat.aspect_ratio` 복사(`:70`). |
| (없음) | — | `T2IPrompt.width?: number` | ❌ | 프롬프트 출력 아님. `renderFormat.resolution?.width`(`:71`). |
| (없음) | — | `T2IPrompt.height?: number` | ❌ | 프롬프트 출력 아님. `renderFormat.resolution?.height`(`:72`). |
| (없음) | — | `T2IPrompt.reference_assets: string[]` | ❌ | 프롬프트 출력 아님. `extractReferences(rawShot)`(`:73`, `:145-182`)로 assets/locations/base_assets ID 수집. |

#### ti2v (TI2VPrompt) — 프롬프트 JSON 키 ↔ TS 필드
LLM fallback(`llmGenerateTI2V`, `:240-273`) 출력 JSON 스키마 = `{ "motion_prompt": "동적 영상 묘사 (한글, 50~100자)" }` (`:260`). 추출 경로(`extractTI2VPrompt`)는 문자열만 반환.

| 프롬프트 JSON key | 프롬프트 값타입/enum | 대응 TS 필드 | 일치 | 비고 |
|---|---|---|---|---|
| `motion_prompt` | string (한글 50~100자, 동사 1~2개) | `TI2VPrompt.motion_prompt: string` | ✅ | LLM 출력 키 `motion_prompt` → `r.motion_prompt`(`:272`) → `ti2vText` → `.trim()` 후 `ti2v.motion_prompt`에 배치(`:76`). 추출 경로도 같은 필드. snake_case 양쪽 일치. |
| (없음) | — | `TI2VPrompt.negative_prompt?: string` | ❌ | 프롬프트가 생성 안 함. 코드 미할당(`:75-80`) → 항상 undefined. |
| (없음) | — | `TI2VPrompt.duration_seconds: number` | ❌ | 프롬프트 출력 아님. `rawShot.duration_seconds`(없으면 5) 복사(`:48`, `:77`). |
| (없음) | — | `TI2VPrompt.fps?: number` | ❌ | 프롬프트 출력 아님. `renderFormat.fps`(`:78`). |
| (없음) | — | `TI2VPrompt.camera_movement?: string` | ❌ | 프롬프트 출력 아님. `extractCameraMovement(rawShot)`(`:79`, `:184-198`)로 V.camera.movement / dynamic_spec.camera_motion(type_direction_speed join) / top-level camera_movement에서 추출. |

#### 코드 변수명
- 함수/파라미터: `runRenderPrompts(shotSequence, renderFormat, characters, productionDesign, logger, axisConfig)` (`:31-38`). 헬퍼: `extractT2IPrompt(shot)` (`:112`), `extractTI2VPrompt(shot)` (`:132`), `extractReferences(shot)` (`:145`), `extractCameraMovement(shot)` (`:184`), `llmGenerateT2I(shot, axisConfig, productionDesign, logger)` (`:202`), `llmGenerateTI2V(shot, axisConfig, logger)` (`:240`).
- 결과·프롬프트 지역변수(실제 식별자): `shots` (ShotGenerationPrompts[], `:41`), `t2iFallbacks` / `ti2vFallbacks` (count, `:42-43`), `rawShot` (AnyShot, `:45`), `sid` / `sceneId` / `duration` (`:46-48`), `t2iText` / `ti2vText` (프롬프트 문자열, `:51`/`:58`), `output` (RenderPromptsOutput, `:84`). LLM 내부: `system` / `user` (프롬프트 문자열, `:208`/`:218`, `:245`/`:256`), `r` (제네릭 `{prompt}` 또는 `{motion_prompt}`, `:227`/`:262`). 로컬 타입 `AnyShot` (`:17-29`).
- 타입 (pipeline.ts): `T2IPrompt` (32-39), `TI2VPrompt` (41-47), `ShotGenerationPrompts` (49-55), `RenderPromptsOutput` (57-72). 주석 670-672.

#### 드리프트 메모
- **출력 키 비대칭 (T2I=`prompt` vs TI2V=`motion_prompt`)**: 두 프롬프트가 서로 다른 키를 씀. T2I는 단일어 `prompt`, TI2V는 snake_case `motion_prompt`. 둘 다 각각의 TS 필드(`T2IPrompt.prompt`, `TI2VPrompt.motion_prompt`)와 정확히 일치 ✅. snake↔camel 불일치 없음(키가 단일어이거나 양쪽 snake).
- **extracted vs LLM-generated 이중 경로**: 각 샷마다 먼저 추출 시도(`extractT2IPrompt`/`extractTI2VPrompt`) → 실패 시(`null`)에만 LLM fallback(`:52-55`, `:59-62`). 추출은 raw shot의 다양한 스키마 경로에서 **문자열만** 끌어옴(T2I: `first_frame_generation.composition_prompt` ① → `static_spec.first_frame_prompt` ② → `S.subject(+background)` ③; TI2V: `video_generation.motion_prompt` ① → `dynamic_spec.motion_prompt` ②). 임계길이: T2I trim>20자, S.subject>10자 / TI2V trim>5자. LLM 경로는 JSON `{prompt}`/`{motion_prompt}` 반환 후 코드가 키를 벗겨 문자열로 통일. 두 경로 결과는 동일하게 `t2iText`/`ti2vText`로 합류 → `.trim()` → 최종 필드. `extraction_summary`가 경로별 카운트 기록(`:92-98`).
- **키 remap (벗겨내기)**: LLM이 돌려준 객체 `{prompt}` / `{motion_prompt}`에서 `r.prompt`(`:237`) / `r.motion_prompt`(`:272`)로 **값만 꺼내** 평문 문자열로 만든 뒤, 다시 동명 TS 필드(`t2i.prompt` `:69` / `ti2v.motion_prompt` `:76`)에 재삽입. 실질적 키 이름 변경은 없음(같은 이름으로 unwrap→rewrap). null-coalesce 기본값 `''`(`:237`, `:272`).
- **프롬프트가 안 채우는 TS 필드 다수**: `negative_prompt`(T2I/TI2V 둘 다 코드에서 미할당 → 항상 undefined), `aspect_ratio`/`width`/`height`/`reference_assets`(T2I), `duration_seconds`/`fps`/`camera_movement`(TI2V)는 모두 프롬프트 JSON 출력이 아니라 `renderFormat` 복사 또는 추출 헬퍼 산물. 즉 프롬프트 facet(`prompt`/`motion_prompt`)과 TS 필드 집합은 1:1이 아니며, 프롬프트는 각 타입에서 단 한 개 필드만 생성.
- **결론**: 프롬프트가 실제 생성하는 키(`prompt`, `motion_prompt`)와 대응 TS 필드는 **정합** ✅. 드리프트는 "필드 이름" 차원이 아니라 "프롬프트 출력 ⊊ TS 필드"(나머지는 메타/렌더포맷/추출)라는 범위 차이.


### assets_generate.ts — facet `assets_generate` (generation)
- entry fn: `runAssetsGenerate(characters: Characters, renderFormat: RenderFormat, artDirection: ArtDirection, productionDesign: ProductionDesign, logger: PipelineLogger, opts: AssetsOptions = {}): Promise<AssetsManifest>` · WriterRunState field: `— (API-only; WriterRunState stops at renderPrompts, no assets field)` · log file: `14b_assets.json`
- 자체 LLM 프롬프트 유무: 없음 (LLM JSON-output 프롬프트 아님) — 다만 코드 내부에서 **이미지 생성용 텍스트 프롬프트를 직접 빌드**: `buildCharacterPrompt()` (line 30-54) + `buildLocationPrompt()` (line 56-78), 순수 T2I (`openai/gpt-image-2`)로 fal에 제출. 소비하는 upstream = 자기축 outputs: `Characters.characters[]` (S2 characters), `ProductionDesign.locations[]`/`.costumes`/`.global_palette` (L2), `ArtDirection.art_style`/`.shape_language` (L1), `RenderFormat.aspect_ratio` (L0). 별도 facet 프롬프트 파일 소비 안 함.
- 프롬프트 상호참조(레거시 S/L/C 코드): 주석에 `S2.characters` (line 2), `L2.locations` (line 3), `L2` (line 75 comment in pipeline.ts), `S2 character.id 또는 L2 location.id` (pipeline.ts line 83 comment). 코드 식별자 prefix는 폐기됨(`S/L`은 주석에만 잔존).

#### 출력 TS 타입 필드 (result object)
타입: `AssetsManifest` (pipeline.ts:97-106), 항목 타입 `AssetItem` (pipeline.ts:82-95)

| TS 필드 (중첩 a.b) | 타입/enum | 비고 |
|---|---|---|
| `total` | number | allTasks.length (캐릭터+로케이션 총) |
| `success_count` | number | |
| `failed_count` | number | |
| `pending_count?` | number | optional (`?`) |
| `model` | string | modelLabel (기본 `openai/gpt-image-2`) |
| `aspect_ratio` | string | L0.aspect_ratio (snake_case) |
| `characters` | AssetItem[] | kind==='character' 필터 |
| `locations` | AssetItem[] | kind==='location' 필터 |
| `characters[].id` (AssetItem.id) | string | S2 character.id 또는 L2 location.id |
| `characters[].kind` | AssetKind = `'character' \| 'location'` | |
| `characters[].name` | string | |
| `characters[].prompt_used` | string | buildCharacter/LocationPrompt 결과 (snake_case) |
| `characters[].image_url` | string | fal 결과 URL (성공 전 `''`) |
| `characters[].width?` | number | poll COMPLETED 시 채움 |
| `characters[].height?` | number | poll COMPLETED 시 채움 |
| `characters[].model` | string | |
| `characters[].status` | `'success' \| 'failed' \| 'pending'` | (skipped 없음 — L7과 차이) |
| `characters[].error?` | string | |
| `characters[].request_id?` | string | fal queue id |
| `characters[].submitted_at?` | string | ISO |
| `locations[]…` | AssetItem | (locations[] 항목도 위 AssetItem 필드 전부 동일) |

(주: `AssetItem`은 `characters[]`와 `locations[]` 양쪽 배열에 동일 구조로 들어감)

#### 코드 변수명
- 함수: `runAssetsGenerate` · 파라미터: `characters`, `renderFormat`, `artDirection`, `productionDesign`, `logger`, `opts` · 헬퍼: `buildCharacterPrompt(char, costumes, artDirection, productionDesign)`, `buildLocationPrompt(loc, artDirection, productionDesign)`
- 주요 지역변수: `modelLabel`, `aspectRatio`, `cachedFile`, `cachedSuccessById` (Map<string,AssetItem>), `allTasks` (Task[]; Task = {id, kind, name, prompt}), `resultById` (Map<string,AssetItem>), `buildManifest()`, `saveProgress()`, `writeLock`, `submitQueue`, `pendingItems` (Array<{id, request_id}>), `submitWorker()`, `pollDeadline`, `stillPending` (Map<string,string>), `manifest`. fal 헬퍼: `falImageSubmit({model, prompt, aspect_ratio})`, `falImageFetch(modelLabel, request_id)` → `{status:'COMPLETED'|'FAILED', url, width, height, error}`
- 타입: `AssetsManifest` (pipeline.ts:97), `AssetItem` (pipeline.ts:82), `AssetKind` (pipeline.ts:80), `AssetsOptions` (assets_generate.ts:21, 로컬 — pipeline.ts 아님)
- markStage 라벨: `'assets_generate'` (line 97, 250)

#### 드리프트 메모
- status enum = `'success' | 'failed' | 'pending'` (3값). **L7 `ShotVideoResult`는 `'skipped'` 추가(4값), L6 `ShotImageResult`는 3값** — assets/L6 정합, L7만 skipped 보유. 따라서 AssetsManifest엔 `skipped_count` 없음(L7 ShotVideosOutput만 보유).
- 모든 필드 snake_case 일관 (`image_url`, `prompt_used`, `request_id`, `submitted_at`, `aspect_ratio`, `success_count`). camelCase 식별자는 코드 지역변수(`modelLabel`, `cachedSuccessById`)에만, 출력 JSON 필드엔 없음 → 정합.
- `AssetItem.id`는 캐릭터일 땐 `character.id`, 로케이션일 땐 `location.id`로 의미가 kind 의존(union 키). `shot_id`/`scene_id` 키는 이 타입에 없음(샷 단위 아님) — L6/L7과 키 네이밍 축이 다름(asset id vs shot_id).
- fal 응답 키 `status: 'COMPLETED'|'FAILED'` (대문자, fal API) ↔ 내부 저장 `status: 'success'|'failed'|'pending'` (소문자) — 대소문자 매핑 변환 존재(코드가 명시 변환). 드리프트 아님(의도적 변환).

---

### l6_images.ts — facet `shotImages` (generation)
- entry fn: `runShotImages(finalPrompts: RenderPromptsOutput, logger: PipelineLogger, opts: L6Options = {}): Promise<ShotImagesOutput>` · WriterRunState field: `— (API-only; route /api/writer/generate/images/route.ts. WriterRunState엔 shotImages 필드 없음)` · log file: `15_shotImages.json` (입력으로 `14b_assets.json` 로드)
- 자체 LLM 프롬프트 유무: 없음 — LLM 호출 자체가 전혀 없음(fal 이미지 큐만). **upstream facet `renderPrompts`(L5)의 `shots[].t2i` 블록을 소비**: `shot.t2i.prompt`, `shot.t2i.aspect_ratio`, `shot.t2i.negative_prompt`, `shot.t2i.reference_assets`(asset ID 목록 → `14b_assets.json`의 image_url로 룩업). 즉 L5가 author한 t2i 프롬프트를 그대로 fal에 전달(자기 라벨 프롬프트 없음).
- 프롬프트 상호참조(레거시 S/L/C 코드): 주석 `L5 final_prompts.shots[].t2i.prompt` (line 2), `L6` 헤더/로그 prefix (line 1, 99, 147, 183), reference asset → I2I 라우팅 주석 (line 46-48). 코드 식별자 prefix 아님(주석/로그 라벨에만).

#### 출력 TS 타입 필드 (result object)
타입: `ShotImagesOutput` (pipeline.ts:127-134), 항목 타입 `ShotImageResult` (pipeline.ts:112-125)

| TS 필드 (중첩 a.b) | 타입/enum | 비고 |
|---|---|---|
| `total_shots` | number | finalPrompts.shots.length |
| `success_count` | number | |
| `failed_count` | number | |
| `pending_count?` | number | optional |
| `model` | string | modelLabel (asset 있으면 `openai/gpt-image-2/edit` I2I, 없으면 `openai/gpt-image-2` T2I) |
| `shots` | ShotImageResult[] | naturalCompareShotId 정렬 |
| `shots[].shot_id` | string | (snake_case) |
| `shots[].scene_id` | string | shot.scene_id에서 복사 |
| `shots[].image_url` | string | 성공 전 `''` |
| `shots[].width?` | number | poll COMPLETED 시 |
| `shots[].height?` | number | poll COMPLETED 시 |
| `shots[].prompt_used` | string | shot.t2i.prompt 복사 |
| `shots[].model` | string | |
| `shots[].status` | `'success' \| 'failed' \| 'pending'` | (skipped 없음) |
| `shots[].error?` | string | |
| `shots[].request_id?` | string | fal queue id (pending 회수용) |
| `shots[].submitted_at?` | string | ISO; resume timeout 판단용 |

#### 코드 변수명
- 함수: `runShotImages` · 파라미터: `finalPrompts` (RenderPromptsOutput), `logger`, `opts` (L6Options) · 헬퍼: `naturalCompareShotId(a, b)`
- 주요 지역변수: `assets` (AssetsManifest), `assetUrlById` (Map<string,string>; asset id → image_url), `hasAnyAssets`, `modelLabel`, `cachedFile`, `cachedSuccess` (Map<string,ShotImageResult>), `totalShots`, `resultByShot` (Map<string,ShotImageResult>), `buildOutput()`, `saveProgress()`, `writeLock`, `submitQueue`, `pendingShots` (Array<{shot_id, request_id}>), `submitWorker()`, `refUrls`, `pending` (ShotImageResult), `pollDeadline`, `stillPending` (Map<string,string>), `output`. fal: `falImageSubmit({model, prompt, aspect_ratio, negative_prompt, reference_image_urls})`, `falImageFetch(modelLabel, request_id)`
- 타입: `ShotImagesOutput` (pipeline.ts:127), `ShotImageResult` (pipeline.ts:112), `L6Options` (l6_images.ts:30, 로컬). 입력: `RenderPromptsOutput` (pipeline.ts:57), `AssetsManifest` (pipeline.ts:97)
- markStage 라벨: `'shotImages'` (line 64, 192)

#### 드리프트 메모
- status enum = `'success' | 'failed' | 'pending'` (3값) — assets와 동일, **L7과 다름(L7만 skipped)**. L6는 "first frame 없음" 케이스 자체가 없어 skipped 불필요(t2i.prompt가 항상 존재).
- 키 네이밍: `shot_id`/`scene_id` snake_case로 L5(RenderPromptsOutput.shots[].shot_id/scene_id)·L7과 **완전 일관**. asset 룩업 키는 `reference_assets`(t2i 내, string[] of asset id) ↔ AssetItem.id로 매칭 → 정합.
- 모든 출력 JSON 필드 snake_case 일관. camelCase는 지역변수(`assetUrlById`, `cachedSuccess`, `resultByShot`, `modelLabel`)에만 → 정합.
- fal 응답 `status:'COMPLETED'|'FAILED'`(대문자) ↔ 내부 `status`(소문자) 매핑 — assets와 동일 패턴, 의도적 변환.
- `width`/`height`는 submit 시점엔 미설정, poll COMPLETED에서만 채워짐(optional 적절). 같은 패턴이 assets에도 존재 → 정합.

---

### l7_videos.ts — facet `shotVideos` (generation)
- entry fn: `runShotVideos(finalPrompts: RenderPromptsOutput, images: ShotImagesOutput, logger: PipelineLogger, opts: L7Options = {}): Promise<ShotVideosOutput>` · WriterRunState field: `— (API-only; route /api/writer/generate/videos/route.ts. WriterRunState엔 shotVideos 필드 없음)` · log file: `16_shotVideos.json` (입력으로 L6 `images: ShotImagesOutput` 사용)
- 자체 LLM 프롬프트 유무: 없음 — LLM 호출 없음(fal 비디오 큐만). **upstream facet `renderPrompts`(L5)의 `shots[].ti2v` 블록 + L6 `image_url` 소비**: `shot.ti2v.motion_prompt`, `shot.ti2v.duration_seconds`, `shot.ti2v.negative_prompt`, 그리고 `shot.t2i.aspect_ratio`(t2i에서 가져옴 — ti2v엔 aspect_ratio 없음), first frame은 `images.shots[].image_url`(L6 결과). L5가 author한 ti2v.motion_prompt를 그대로 fal에 전달(자기 프롬프트 없음).
- 프롬프트 상호참조(레거시 S/L/C 코드): 주석 `L6 image_url + L5 ti2v.motion_prompt` (line 2), `L7` 헤더/로그 prefix (line 1, 92, 156, 191). 코드 식별자 prefix 아님.

#### 출력 TS 타입 필드 (result object)
타입: `ShotVideosOutput` (pipeline.ts:154-162), 항목 타입 `ShotVideoResult` (pipeline.ts:140-152)

| TS 필드 (중첩 a.b) | 타입/enum | 비고 |
|---|---|---|
| `total_shots` | number | finalPrompts.shots.length |
| `success_count` | number | |
| `failed_count` | number | |
| `skipped_count` | number | **L7 고유** (assets/L6엔 없음); optional 아님(필수) |
| `pending_count?` | number | optional |
| `model` | string | modelLabel (기본 `alibaba/happy-horse/reference-to-video`) |
| `shots` | ShotVideoResult[] | naturalCompareShotId 정렬 |
| `shots[].shot_id` | string | (snake_case) |
| `shots[].scene_id` | string | |
| `shots[].video_url` | string | 성공 전 `''` |
| `shots[].duration_seconds` | number | **필수**(optional 아님); shot.ti2v.duration_seconds, poll 시 r.duration로 덮어씀 |
| `shots[].prompt_used` | string | shot.ti2v.motion_prompt 복사 |
| `shots[].first_frame_url` | string | **L7 고유** — L6 image.image_url (없으면 `''`) |
| `shots[].model` | string | |
| `shots[].status` | `'success' \| 'failed' \| 'skipped' \| 'pending'` | **'skipped' 추가(4값)** — first frame 없을 때 |
| `shots[].error?` | string | skipped 시 `'no first frame image'` |
| `shots[].request_id?` | string | |
| `shots[].submitted_at?` | string | ISO |

#### 코드 변수명
- 함수: `runShotVideos` · 파라미터: `finalPrompts` (RenderPromptsOutput), `images` (ShotImagesOutput), `logger`, `opts` (L7Options) · 헬퍼: `naturalCompareShotId(a, b)`
- 주요 지역변수: `modelLabel`, `cachedFile`, `cachedSuccess` (Map<string,ShotVideoResult>), `imageByShot` (Map<string, ShotImageResult>; shot_id → L6 결과), `totalShots`, `resultByShot` (Map<string,ShotVideoResult>), `buildOutput()`, `saveProgress()`, `writeLock`, `submitQueue`, `pendingShots` (Array<{shot_id, request_id}>), `submitWorker()`, `img` (L6 image lookup), `pollDeadline`, `stillPending` (Map<string,string>), `output`. fal: `falVideoSubmit({model, prompt, image_url, duration, aspect_ratio, negative_prompt})`, `falVideoFetch(modelLabel, request_id)` → `{status, url, duration, error}`
- 타입: `ShotVideosOutput` (pipeline.ts:154), `ShotVideoResult` (pipeline.ts:140), `L7Options` (l7_videos.ts:30, 로컬). 입력: `RenderPromptsOutput` (pipeline.ts:57), `ShotImagesOutput` (pipeline.ts:127)
- markStage 라벨: `'shotVideos'` (line 56, 200)

#### 드리프트 메모
- **status enum 비대칭**: L7 = `'success' \| 'failed' \| 'skipped' \| 'pending'` (4값) vs assets/L6 = 3값(skipped 없음). 따라서 ShotVideosOutput만 `skipped_count` 카운터 보유. 'skipped'는 L6 first frame(image_url) 부재 시 부여(line 107-117, error='no first frame image').
- `skipped_count`는 ShotVideosOutput에서 **필수 필드**인데 `pending_count?`는 optional — 같은 카운터군 내 optionality 불일치(미세 비정합, 단 의도 가능: skipped는 항상 계산됨).
- fal submit 시 video는 aspect_ratio를 `shot.t2i.aspect_ratio`에서 가져옴(ti2v 블록엔 aspect_ratio 필드 없음 — TI2VPrompt에 없음). t2i/ti2v 간 cross-read → 의도적이나 결합도 주의 지점.
- `duration_seconds`: ShotVideoResult에선 **필수**, 반면 다른 곳 width/height 등은 optional. poll COMPLETED 시 `r.duration ?? cur.duration_seconds`로 fal 실제 길이 우선 덮어씀(L5 추정값 → fal 실측값).
- 키 `shot_id`/`scene_id` snake_case로 L5/L6와 일관 → 정합. `first_frame_url`은 L6 `image_url`을 받는데 **필드명이 다름**(L6=`image_url` → L7=`first_frame_url`); 같은 값의 의미적 리네임(첫 프레임으로 역할 변경), 키 자체는 snake_case 일관.
- 모든 출력 JSON 필드 snake_case 일관. camelCase는 지역변수(`imageByShot`, `resultByShot`, `modelLabel`, `cachedSuccess`)에만 → 정합.
- fal 응답 `status:'COMPLETED'|'FAILED'`(대문자) ↔ 내부 소문자 status 매핑 — L6/assets와 동일 패턴.


