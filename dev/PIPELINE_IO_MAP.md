# Pipeline I/O Map — writer 파이프라인 데이터 흐름 (entity 단위)

> 목적: 각 스테이지의 **입력(entity) → (LLM) → 출력(entity)**, **DB persist 경계**, **하류 소비**, 그리고 **무엇이 전달되고 무엇이 버려지는지(손실 지점)** 추적.
> "스토리는 좋은데 영상 연출이 약하다"의 원인 = *연출 의도가 어느 단계에서 프롬프트/DB에 도달 못 하고 끊기는지*.
> 진실 소스: `src/lib/writer/pipeline/steps.ts`(WRITER_STEPS) + `stages/*.ts` + `types/pipeline.ts` + `pipeline/util/persist_manifest.ts`.
> **2026-06-13 갱신 (producer-story-gate 반영)**: 옛 S0(genre)·S2(characters) 스테이지 **삭제**(producer seed로 승격) · storyCheck·midPreview **항상 skip** · Assets step **제거**(이미지=artist 전담). 옛 문서의 `S/L+숫자` prefix·로그번호는 stale.
> 모델 축: **S축·V축 = Gemini `gemini-3-flash-preview`** / **C축 = Claude `claude-sonnet-4-6`** (`dispatch.ts`).

---

## §0. 한눈에 보는 전체 흐름

```
[PRODUCER 게이트]  genre(Genre) + cast(characters, origin='producer')  ── seed ──┐
   스토리 정체성 확정 → /api/writer/start 핸드오프가 state.genre / state.characters 주입
                                                                                  │
══════════════ WRITER 파이프라인 (백엔드, serverless 체이닝 steps.ts) ════════════ ▼
  seed(genre+cast) ─► [s1] narrativeStructure  (구조/POV/주제/CDQ)          Story축
                  ─► [s3] scenes  (씬/감정비트/scene_actions, 오픈캐스트 new_characters[]→mergeOpenCast)
                  ─► [storyCheck = c_validation_1]   ▒▒ 항상 SKIP ▒▒          검증(Claude)
                  ─► [midPreview]                    ▒▒ 항상 SKIP ▒▒          V축
                  ─► [visualFormat = l0_l1]  RenderFormat + ArtDirection (1 step 2산출)
                  ─► [productionDesign = l2]  팔레트/로케이션/의상  ★canonical loc
                        │
                        ▼ ◀━━━ ★persist ① : persistAssetsToDb(characters / locations / scenes)
                        │       → artist 를 파이프라인 ~절반에 언블록 (레퍼런스 이미지 조기 생성)
                  ─► [sceneCinematography = l3]  ▒ Compact 시 생략→l4 역추론(현재 항상 실행) ▒
                  ─► [decoupage]  beat→shot 분해(4연산), ★샷수/리듬/카메라의도 저작
                  ─► [shotDesign = l4]  샷 3분할 intent/static_spec/dynamic_spec
                  ─► [shotCheck = c_application_2]  ShotSequenceItem 조립 + 검증
                  ─► [renderPrompts = l5]  t2i.prompt + ti2v.motion_prompt  ★★최종텍스트
                        │
                        ▼ ◀━━━ ★persist ② : persistShotsToDb(shots)  → director 콘티 노드
                        │
                  ─► (l6 images / l7 videos — 핸드오프 경로에선 dead-end. 이미지=artist 전담)
═══════════════════════════════════════════════════════════════════════════════
                        │
        ┌───────────────┼─────────────────────────┐
        ▼               ▼                         ▼
   [ARTIST 카드]   [WRITER 탭 러프보드]        [DIRECTOR 캔버스]
   characters/     scenes·characters·          shots → Scene/Shot 노드
   locations 이미지 locations·shots +          + asset-storage → 에셋 바인딩
                   writer_runs.state→shotDesign(우회)
```

- producer가 **genre+cast를 게이트로 seed** → writer가 s1(구조)→s3(씬, 오픈캐스트 머지)로 Story를, l0~l2로 비주얼 토대를 만든 직후 **persist①(characters/locations/scenes)** 로 artist 조기 언블록.
- 이어 decoupage(연출 저작)→l4(샷 스펙/조립)→l5(최종 프롬프트) 직후 **persist②(shots)** 로 director를 채운다. **풍부한 연출 스펙(V축 facet·shotDesign)은 평탄화로 탈락**하되 러프보드만 `writer_runs.state`에서 우회 회수 (§4 [L1][L2][L5]).

---

## §1. 스테이지별 입력/출력 상세 (entity 단위)

> 로그 prefix(현재): `03_narrativeStructure` · `05_scenes` · `06_storyCheck` · `07_midPreview` · `08_renderFormat_artDirection` · `09_productionDesign` · `10_sceneCinematography` · `10b_decoupage` · `11_shotDesign` · `12_shotCheck`+`13_shotSequence` · `14_renderPrompts`. (02 genre·04 characters는 s0/s2 삭제로 결번)

### Producer seed (genre/cast) — `createRun(projectId, input, …)` → state.genre / state.characters (로그 없음)
| | |
|---|---|
| **in** | `PipelineInput.genre`(Genre, producer 확정 완성형), `PipelineInput.cast`(CastContract) — `/api/writer/start`가 핸드오프 payload로 조립 |
| **LLM** | ❌ (게이트는 producer 단계에서 끝남 — seed는 순수 매핑/대입) |
| **out** | `Genre{genre, subGenre?, tone[], targetEmotion[], runtime_seconds, depth_level(D1~D7), format}`(그대로) + `Characters{characters: StoryCharacter[], relationships[], subtext_notes[]}`(변환) |
| **변환** | Genre 매핑없음. **Cast→Characters**: `castContractToCharacters` — `character_id`→`id`, `appearance`→`appearance_description`, role/voice/arc/motivation 통과(빈값 기본채움). seed 조건부 `if(input.genre)`/`if(input.cast)` — 없으면 하류 `s.genre!`에서 실패 |
| **drops/손실** | `CastContractCharacter.entity_type`(person/object) **버림**. `age`/`personality` 원천 없어 빈값. ※seed(state)와 별개로 `upsertProducerCast`가 characters 테이블에 `origin='producer'` 즉시 upsert(DB 경로) — 두 경로 분리 |

### narrativeStructure (s1) — `runNarrativeStructure(input, genre, …, S)` → state.narrativeStructure
| | |
|---|---|
| **in** | `PipelineInput.story`(본문), `Genre` 전체(특히 `depth_level`로 구조 깊이) |
| **LLM** | ✅ S축 · Gemini (temp 0.6) |
| **out** | `NarrativeStructure{structure_type, acts[]{act_id,purpose,proportion(합1.0)}, pov, theme, central_dramatic_question, turning_point_position}` — 구조만(characters/scenes 미포함) |
| **변환** | story+genre → 구조. depth_level이 act 수·CDQ 유무 가이드 |
| **drops/손실** | 입력 `characters` **안 읽음**(인물 정보가 구조에 미반영). 출력 소비처는 **scenes·storyCheck·midPreview·shotCheck 4곳만**(visual/shot 대부분 미사용) |

### scenes (s3) — `runScenes(input, genre, narrativeStructure, characters, …, S)` → state.scenes (+조건부 characters)
| | |
|---|---|
| **in** | `story`, `Genre`(.runtime_seconds·.depth_level→씬수), `NarrativeStructure`(.acts→act_ref), `Characters`(.characters[].id/name/role/appearance — **[기존 캐스트] slug 목록** 주입, 오픈캐스트 계약) |
| **LLM** | ✅ S축 · Gemini (temp 0.7) |
| **out** | `Scenes{scenes: StoryScene[], total_estimated_seconds, new_characters?: NewCharacter[]}` · `StoryScene{scene_id, act_ref, location, time_of_day, weather?, characters_in_scene[], purpose, emotion_beat{start,end}, dialogue_summary, key_dialogue?[], info_asymmetry, estimated_seconds, scene_actions[]}` · `NewCharacter{id(새 slug), name, role?, appearance_description?}`(분리 반환) |
| **변환** | `scene_actions[]` = ≈5초/1액션 **비트** — 하류 `source_beats` 인덱스 **원천**. `location` 문자열 = canonical location id 발원. **mergeOpenCast**: new_characters 중 기존 미중복분만 StoryCharacter 기본값으로 append→새 Characters(새 게 없으면 scenes만 반환) |
| **drops/손실** | 입력 characters의 personality/voice/arc/motivation **미주입**(id/name/role/appearance만). 비소비: **visualFormat·renderPrompts**. `key_dialogue`/`info_asymmetry`/`weather`는 영상 프롬프트에 약하게만 |

### storyCheck (c_validation_1) — `runStoryCheck(genre, narrativeStructure, characters, scenes, …, C)` → state.storyCheck
| | |
|---|---|
| **in** | `genre`·`narrativeStructure`·`characters`·`scenes` 넷 통째 JSON |
| **LLM** | ✅ C축 · Claude · **skip 기본 true** (`input.skip?.validation1 ?? true`) → `emptyC1Report()`. + 룰 `analyzeCausalityChain` 하이브리드(non-skip시) |
| **out** | `StoryCheckReport{passed, issues[], causality_chain[]{from,to,connector}, cdq_present, cdq_clarity_score, cliche_count, retry_count}` |
| **변환** | LLM은 cdq/cliche/llm_issues만 → 룰 causality와 합본, `passed=!CRITICAL` |
| **drops/손실** | **검증만, S 미수정**. skip(기본)이면 무신호로 진입. 소비처 **midPreview 1곳뿐**(그것도 기본 skip → 통상 경로에선 산출이 아무 데도 안 닿음) |

### midPreview — `runMidPreview(genre, narrativeStructure, characters, scenes, storyCheck, …, V)` → state.midPreview
| | |
|---|---|
| **in** | `genre`·`narrativeStructure`·`characters`·`scenes` + `storyCheck`("[C 검증 결과]"로 주입) |
| **LLM** | ✅ V축 · Gemini · **skip 기본 true** → `emptyMidPreview()`. S↔V 양방향 협상 유일 지점 |
| **out** | `MidPreview{v_recommendations{L0:Partial<RenderFormat>, L1:Partial<ArtDirection>, L2_summary, L3_scene_strategy, L4_shot_recipe}, color_script[], emotional_arc_visualization, production_difficulty, warnings[]}` |
| **변환** | v_recommendations 5키는 **옛 코드명**: L0→renderFormat, L1→artDirection, L2_summary→productionDesign, L3_scene_strategy→sceneCinematography, L4_shot_recipe→shotDesign 힌트 (**이름만 보면 혼동**) |
| **drops/손실** | skip(기본)이면 전부 빈값 → visualFormat/l2/l3 자체결정. 직접 소비처 = **visualFormat·productionDesign·sceneCinematography 3곳**(decoupage 이후 미소비) |

### visualFormat (l0_l1) — `runRenderFormatArtDirection(genre, midPreview, …, V)` → state.renderFormat + artDirection
| | |
|---|---|
| **in** | `genre` + `midPreview.v_recommendations`만(color_script 등 미사용) |
| **LLM** | ✅ V축 · Gemini · **skip 불가**. has 게이트 = renderFormat≠∅ && artDirection≠∅ |
| **out** | **1 step·1 호출 2산출**: `RenderFormat{medium, resolution{w,h}, fps, aspect_ratio, rendering_method}` · `ArtDirection{art_style, shape_language, line_quality, character_proportion, texture_philosophy}` |
| **변환** | v_rec.L0→RenderFormat 완성, v_rec.L1→ArtDirection 완성. midPreview 빈값이면 genre만 보고 새로 결정 |
| **drops/손실** | 소비처: `renderFormat`→shotCheck·renderPrompts(+persistDesignTokens DB); `artDirection`→l2·l3·decoupage·l4·c2 (**artDirection이 V축 최광역 허브**) |

### productionDesign (l2) — `runProductionDesign(characters, scenes, artDirection, midPreview, …, V)` → state.productionDesign  ★persist① 부수효과
| | |
|---|---|
| **in** | `characters.characters[]` · `scenes.scenes[].location`(unique만) · `artDirection` · `midPreview.color_script`만 |
| **LLM** | ✅ V축 · Gemini |
| **out** | `ProductionDesign{global_palette{primary,secondary,accent,forbidden[]}, color_meaning, locations[]{id,style_description,lighting_sources[],props[]}, costumes{charId:[]}, vfx_approach}` |
| **변환** | unique location → `locations[].id`(**canonical location id 발원** — 하류가 이 목록을 봐야 id를 안 지어냄). color_script→palette. **부수효과**: 산출 직후 `persistDesignTokens` + `persistAssetsToDb(characters/locations/scenes)`(await+catch, fire-and-forget 아님). 이미지 생성 안 함(artist) |
| **drops/손실** | scenes는 location만, midPreview는 color_script만 사용. 소비처: sceneCine·decoupage·l4·c2·l5 (**ProductionDesign이 V축 최광역 허브 2**) |

### sceneCinematography (l3) — `runSceneCinematography(genre, characters, scenes, artDirection, productionDesign, midPreview, …, V)` → state.sceneCinematography + sceneBudgetIssues + compact
| | |
|---|---|
| **in** | `genre`(+depth_level로 compact 판정) · `characters`(요약) · `scenes`(요약 + `analyzeSceneActionBudget`) · `artDirection` · `productionDesign.global_palette`+locations id · `midPreview.v_rec.L3_scene_strategy`(문자열 힌트) |
| **LLM** | ✅ V축 · Gemini(temp 0.5). **compact시 stage 자체 SKIP**(→[]) — 단 현재 `COMPACT_DEPTH_LEVELS=[]`라 **항상 실행** |
| **out** | `SceneCinematography[]{scene_id, coverage_pattern, shot_count_target, lens_vocabulary[], camera_mounting, camera_energy, lighting_arc{start_K,end_K,dominant_ratio,quality}, palette_emphasis[], dominant_pov, spatial_axis_180?, rhythm_profile, cut_pace, avg_shot_seconds, silence_intentional, sound_motif_hints[], visual_intent}` |
| **변환** | compact 경로: shotDesign 사후 `inferSceneCinematographyFromShots`로 역추론. **하류 분기**: decoupage·shotDesign엔 `compact?null:값`, shotCheck엔 **항상 채워진 값** |
| **drops/손실** | `shot_count_total` state 미반영. **★DB 미보존 — state만**(lighting_arc·rhythm·sound_motif 증발, §4 [L2]) |

### decoupage — `runDecoupage(genre, characters, scenes, _artDirection, productionDesign, sceneCinematography|null, …, V)` → state.decoupage
| | |
|---|---|
| **in** | `genre`(요약) · `characters`(씬 등장인물만) · `scenes.scene_actions[]`(비트, 인덱스 부여) + 씬 메타 · `productionDesign.locations`(매칭분) · `sceneCinematography`(compact면 null, "참고 힌트") |
| **LLM** | ✅ V축 · Gemini(temp 0.7, 감독 페르소나) · **씬별 1회 호출** |
| **out** | `DecoupagePlan{scenes[]{scene_id,beat_count,shot_count,coverage_ratio,rhythm_profile,uncovered_beats[],shots[]}, total_*, director_notes}` · `DecoupageShot{shot_id, scene_id, operation(derived\|added\|merged\|split), shot_function, source_beats[], added_rationale?, beat_summary, shot_size, intended_duration_seconds(5~15), rhythm_role, camera_intent, camera_move_motivation?, dramatic_purpose}` |
| **변환** | 씬내 `shot_<scene>_NNN` 표준화 → 전 씬 모아 **전역 재인덱싱** `shot_<globalIdx>`. beat≠shot(N:M=감독 craft) |
| **drops/손실** | `_artDirection` **미사용**(언더스코어). **★⑤ Découpage→shotDesign**: `rhythm_role`/`shot_function`/`operation`/`added_rationale`/`camera_move_motivation`을 **shotDesign 출력 스키마가 받을 필드 없음** → 프롬프트 입력으로만, 구조적 소실. 소비처 **shotDesign 단독** |

### shotDesign (l4) — `runShotDesign(genre, characters, scenes, artDirection, productionDesign, sceneCinematography|null, decoupage|null, …, V)` → state.shotDesign
| | |
|---|---|
| **in** | `genre`·`characters`·`scenes`·`artDirection`·`productionDesign` · `sceneCinematography`(compact면 null, 비compact면 "준수") · **`decoupage`(전체 — 씬별 sceneDec 추출)** |
| **LLM** | ✅ V축 · Gemini(temp 0.6) · 씬별 호출. `decoupage≠null`→**데쿠파주 확정 모드**(샷수/경계 고정, spec만 부착) |
| **out** | `ShotDesign[]` 3분할: **intent**(beat 1:1){shot_id, story_beat_ref, dramatic_purpose, duration_*, audience_focus, shot_position_in_scene} · **static_spec**(Image 입력—풍부){lens_mm, shot_type, camera_angle, depth_of_field, framing{rule,layers{fg/mg/bg},focal_point}, lighting{ratio,color_temp_K,quality,key_direction}, character_blocking[]{pos,pose,gaze,asset_version}, prop_placement[], palette_emphasis[], texture_notes, color_grading_intent, **first_frame_prompt(200~400자)**} · **dynamic_spec**(Video 입력—압축){camera_motion{type,direction,speed,magnitude}, character_motion[]{verb,magnitude}, gaze_arc?, environmental_change?, transition_*, **motion_prompt(50~80자)**} |
| **변환** | shot_id: 데쿠파주 구동시 sceneDec id 보존. compact 사후 `sceneCinematography=infer…` patch |
| **drops/손실** | 데쿠파주 rhythm_role/shot_function 대응 필드 없음(⑤ 연속). **★⑥ shotDesign→shotCheck**: static_spec의 framing.layers/blocking/prop_placement/color_grading + dynamic_spec gaze_arc/env_change 등이 V 요약본으로 압축 소실. **★DB 미보존 — state만**(§4 [L2]). 소비처 **shotCheck 단독** |

### shotCheck (c_application_2) — `runShotCheck(projectId, genre, narrativeStructure, characters, scenes, renderFormat, artDirection, productionDesign, sceneCinematography, shotDesigns, sceneBudgetIssues, …, V, C)` → state.shotSequence + shotCheck
| | |
|---|---|
| **in** | **다수**: genre·narrativeStructure(.theme)·characters·scenes·renderFormat·artDirection·productionDesign·sceneCinematography(항상 채워진 값) · **`shotDesigns`(핵심)** · sceneBudgetIssues |
| **LLM** | ✅ V축(Gemini 조립 temp0.4) **+** ✅ C축(Claude 검증 temp0.3). 3단계: ①V로 ShotSequenceItem 조립 ②C로 액션/의미 검증→split ③split 적용 |
| **out** | **둘 동시**: `ShotSequence{project_id,total_*,depth_level,shots[]}` · `ShotSequenceItem{shot_id, duration_seconds, S{scene_id,scene_purpose,emotion_beat,character_action,dialogue?}, C{hook_type?,causal_link,motif_active?,info_disclosure}, V{camera{type,angle,movement},lighting{ratio,color_temp},composition,mood}, assets{characters[],locations[],props[]?}, first_frame_generation{base_assets[],composition_prompt}←L4b, video_generation{motion_prompt}←L4c, action_budget{...}, continuity{...}}` · `ShotCheckReport{passed, issues[], shots_split_count, total_action_violations_fixed}` |
| **변환** | split후 **shot_id 전역 재정렬** `shot_<i+1>` → causal_link 재연결 → `normalizeShotSequenceAssetRefs`(canonical asset ID 강제, 미해결 drop). V는 L4 "요약본" |
| **drops/손실** | **★⑥/⑦**: L4 static_spec 풍부필드가 V 요약으로 압축되는데 l5는 L4 아닌 13번을 읽음 → 디테일 단절. `shotCheck`(report)는 state 적재만(하류 미사용). 소비처: `shotSequence`→renderPrompts + **persistShotsToDb(DB shots)** |

### renderPrompts (l5) — `runRenderPrompts(shotSequence, renderFormat, characters, productionDesign, …, V)` → state.renderPrompts  ★최종텍스트 / dead-end
| | |
|---|---|
| **in** | **`shotSequence` — 유일한 샷 데이터** · renderFormat · characters · productionDesign. ★**`shotDesign`은 인자에 없음**(shotCheck 경유분만 도달) |
| **LLM** | ⚠ **fallback만**: `composition_prompt`(C2) → `static_spec.first_frame_prompt`(L4, 미적중) → `S.subject` 순 추출; 실패시만 `llmGenerateT2I/TI2V` |
| **out** | `RenderPromptsOutput{total_shots, shots[]{shot_id, t2i:T2IPrompt{prompt, negative?, aspect_ratio, reference_assets[]}, ti2v:TI2VPrompt{motion_prompt, duration_seconds, fps?, camera_movement?}}, l0_meta, extraction_summary}` |
| **변환** | composition_prompt→t2i / motion_prompt→ti2v. `extractReferences`→reference_assets, `extractCameraMovement`→camera_movement |
| **drops/손실** | **★⑧ 최종 병목**: 생성기로 가는 건 **두 문자열 t2i.prompt + ti2v.motion_prompt**(+ref id) — 안 녹은 모든 연출 소실. **★dead-end**: production step이 renderPrompts 미소비. l6/l7 미배선(§4 [L3][L7]) |

---

## §2. DB persist 매핑 (entity → 테이블/컬럼)

> 표기: `→` 직결 / `⤳` 변환·평탄화 / **탈락** = 입력에 있으나 컬럼에 안 감.
> 공통 가드: projectId가 UUID 아니면 즉시 return. insert 순서 = **locations → scenes → characters** (artist 폴링이 `dbChars.length`만 보므로 characters 마지막).

### persist ① — `persistAssetsToDb` (productionDesign/l2 직후)

**scenes** (`Scenes.scenes`, delete-then-insert): `scene_id`⤳writerSceneIdToMain · `dialogue_summary??purpose`→narrative_summary · `scene_actions[]`⤳join→original_text_quote(**배열→문자열**) · location/time_of_day→ · `emotion_beat{start,end}`⤳`"a → b"`→mood(**구조 손실**) · characters_in_scene→characters_present · estimated_seconds→
- **탈락**: act_ref, weather, key_dialogue[], info_asymmetry, **emotion_beat 구조**(비트 감정곡선 회수 불가)

**locations** (`ProductionDesign.locations`, delete-then-insert): `loc.id`→location_id **+** name(**name 미보유→id 재사용**) · `style_description`→style_description **+** visual_description(**이중**) · `lighting_sources[]`→lighting_sources **+** lighting_direction(join, **이중**) · props→ · `time_of_day=''`(하드코딩)
- **탈락**: loc.name, scene별 time_of_day. wide_shot/establishing_shot은 안 건드림(artist 영역)

**characters** (`Characters.characters` = seed+머지, **additive**): 신규 slug만 insert — id→character_id · name→ · role⤳normRole · `entity_type='person'`(고정) · `appearance_description`→appearance **+** description(**이중**) · costumes[id]→costume · `origin='writer'`(고정). 기존 행은 **빈 보강 필드만**(producer 정체성 덮어쓰기 금지)
- **탈락**: age, personality[], arc{}, voice, motivation{} (producer가 컬럼 seed) · relationships[]/subtext_notes[](미기록, 관계는 별도 테이블)

### persist ② — `persistShotsToDb` (renderPrompts/l5 직후)

**shots** (`ShotSequence.shots`, delete-then-insert): `S.scene_id`⤳→scene_id · `shot_id`⤳writerShotIdToMain · `V.camera.type`⤳normShotType(12종 **축소**)→shot_type · `S.character_action`→action_description · `assets.characters[].id`⤳dedupe→characters · duration_seconds→ · `generation_method='I2V'`(고정) · `S.dialogue`⤳1줄객체(메타 빈값)→dialogue_lines · **`camera_config={...DEFAULT}`(0, 하드코딩)** · **`lighting_config={...DEFAULT}`(front, 하드코딩)** · 인덱스→sort_order
- **대규모 탈락 (연출 손실 진앙)**: **V축 facet 전체**(camera.angle/movement, lighting.ratio/color_temp, composition, mood — DEFAULT로 덮임) · action_budget{} · continuity{} · C{} · first_frame_generation/motion_prompt(**최종 프롬프트 DB 미보존**) · assets.locations/props · **ShotDesign(l4 원본)은 애초 입력 아님 → state만**
- 안 채우는 컬럼: focal_length/aperture(러프보드 입력엔 쓰나 NULL), rough_storyboard(webhook 갱신)

---

## §3. 하류 소비 (DB / state → 클라이언트)

- **Artist 카드** (`artist-store.loadData`) ← `characters.appearance`→fixedPrompt, `view_*`→4뷰, `locations.{wide_shot,establishing_shot}`→World 대표샷, scenes→sceneManifest. (`dbChars.length` 있을 때만 DB 경로)
- **Artist 직행** (`asset-storage-store.hydrateFromDb`) ← characters/locations → **RegisteredCharacter/World**(`id===characterId/locationId`). `view_main`→front, 첫 non-null→referenceImages[0]. **Director 에셋 바인딩의 진실 소스**(Pass 0). 어댑터 탈락: alias/background/statusVariants/fiveView/sixteenAngle
- **Writer 탭 러프보드 표시** (`writer-store.loadProject`) ← scenes/characters/locations/`shots.rough_storyboard`→Shot.roughStoryboard. `camera_config/lighting_config`는 DEFAULT 위 spread(persist가 0으로 채웠으므로 사실상 DEFAULT)
- **Writer 탭 러프보드 생성** (`/api/writer/rough-storyboard`) ★우회 — `loadShotDesignByMainId`가 **`writer_runs.state->shotDesign`**(persist가 버린 lens/framing/blocking/camera_motion)을 직접 SELECT → main shot_id 색인 → `buildRoughStoryboardPrompt` spec. `promptSource = spec ? 'shotDesign' : 'db_fallback'`. 멱등(rough_storyboard/queued 잡 skip), failed→safeMode 재시도
- **Director 캔버스** (`use-writer-director-sync`) ← (간접) writer-store shots/manifest + asset-storage. Pass0 asset hydrate→Pass1 Scene노드→Pass2 Shot노드(prompt=action_description, 바인딩 `resolveAssetIds`: shot.characters/scene.location 중 등록분)→Pass2.5 canvas hydrate→Pass2.6 에셋노드→Pass3 콘티 자동생성
  > **비대칭**: 같은 `shots` 행을 **director는 빈약하게(action_description+DEFAULT), 러프보드는 우회로 풍부하게(state→shotDesign)** 읽는다.

---

## §4. 손실지점 종합 (오버홀 결정 포인트)

> **(A) 파이프라인 내부 stage→stage 손실**(연출 의도가 최종 두 문자열에 못 옴, 위 §1 ⑤⑥⑦⑧) + **(B) persist/소비 경계 손실**(DB 평탄화·state 우회). 현재 구조 기준 재번호.

| # | 지점 | 무엇이 끊기나 | 오버홀 결정 필요 |
|---|---|---|---|
| **[L1]** ★★ | persist② V축 증발 | camera_config/lighting_config를 DEFAULT(0/front)로 하드코딩 → V.camera/lighting/composition/mood 통째 소실. director가 무동기 콘티 | V축 facet을 `shots`에 보존(컬럼/JSONB 신설)할지, director가 state 직접 읽게 할지 — **shots 스키마 확장 vs state 우회 일원화** |
| **[L2]** ★ | sceneCine/decoupage/shotDesign DB 미보존 | 연출 밀도 최고 산출 3종이 `writer_runs.state`에만. 러프보드만 우회 접근 | 이 3종을 **DB 1급 엔티티로 승격**할지, state 우회를 표준화할지 — "state=휘발성 캐리어" 전제 유지 가부 |
| **[L3]** | renderPrompts dead-end | 최종 t2i/ti2v 프롬프트가 persist 미기록 + l6/l7 미실행 → 재현·재사용 불가 | 최종 프롬프트를 shots에 저장할지, "빌드는 독립"(architecture §5) 유지할지 — **재현성 vs 파생물 비저장 원칙** |
| **[L4]** | storyCheck/midPreview 항상 skip | 인과/CDQ 검증 + V축 전체추천(color_script/arc) 부재 → l0~l2 힌트 없이 진행, generic 회귀 | 품질 모드 옵트인 재활성 vs 영구 제거 — **비용 vs 품질 게이트 정책** |
| **[L5]** | 러프보드 state 우회 취약 | state 보존/구버전에 따라 러프보드 품질 비결정적, fallback 무고지 | shotDesign DB 승격([L2] 동반)으로 우회 제거 vs fallback에 stale 배지 노출 |
| **[L6]** | 중복 컬럼 | locations.{style↔visual_description}·{lighting_sources↔direction}, characters.{appearance↔description} 이중 기록 | 레거시 컬럼 deprecate+소비측 일원화 vs 호환 유지 |
| **[L7]** | l6/l7 미호출 + shotDesign 미전달 | director sync가 shots만 읽어 shotDesign 노드 전달 못 함 → 러프보드와 비대칭 품질. l6/l7 dead-end 꼬리 | director도 state→shotDesign 우회 공유 vs l6/l7 명시 제거 — **두 소비자 프롬프트 소스 통일** |
| **[L8]** | (캐리오버) subtext/motivation→V 미전달 | personality/arc/voice/motivation/subtext_notes/relationships가 어떤 V 단계·러프보드·director도 안 읽음 | 연출 입력으로 끌어올릴지(프롬프트 빌더가 읽게) vs 현 보류 |

> 옛 ①(Compact L3 skip)→[L2] 흡수, ③(MidPreview 힌트)→[L4] 흡수, ④(Assets 비동기 레이스)→**현재 해소**(Assets step 제거, 이미지=artist `autoGenerateBaseImages` 일원화).

### 한 줄 결론
연출 손실의 진앙은 **persist②가 V축 facet을 DEFAULT로 덮고([L1]), 풍부한 연출 산출물(decoupage/shotDesign/최종프롬프트)을 DB에 안 남겨([L2][L3]) state 우회에만 의존([L5])** 하는 구조다. 오버홀의 중심 결정은 **"연출 스펙을 DB 1급 엔티티로 승격해 모든 소비자가 동등하게 읽게 할 것인가, state 우회를 표준화할 것인가"** — 이 한 갈래가 [L1][L2][L3][L5][L7]을 동시에 가른다.
