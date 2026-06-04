# Pipeline I/O Map — 디버깅용 데이터 흐름 도식

> 목적: 각 스테이지의 **입력 → (LLM) → 출력**과 **무엇이 다음으로 전달되고 무엇이 버려지는지(정보 손실 지점)** 를 추적.
> "스토리는 좋은데 영상 연출이 약하다"의 원인을 찾으려면, *연출 의도가 어느 단계에서 프롬프트에 도달하지 못하고 끊기는지*를 봐야 함.
> 작성: 코드 기준 (`src/lib/svc/pipeline/`). 실제 실행 예시는 `logs/5ba68003-.../`.

---

## 0. 한눈에 보는 전체 흐름

```
입력 story(자유텍스트)
  │
  ▼  ───────────────── S축 (Story, model=S/Gemini) ─────────────────
[S0] 장르/톤/러닝타임 ──────────────► 02_S0.json  (depth_level 결정)
[S1] 구조/POV/주제/CDQ ────────────► 03_S1.json
[S2] 캐릭터/아크/관계/서브텍스트 ───► 04_S2.json   ★canonical character id 발원지
[S3] 씬/감정비트/scene_actions(비트)► 05_S3.json   ★canonical location(scene.location) 발원지
  │
  ▼  ───────────────── C축 ① (Validation, model=C/Claude) ─────────
[C1] 인과/CDQ/핍진성/클리셰 검증 ───► 06_C_validation_1.json  (검증만; S 수정 안 함)
  │
  ▼  ───────────────── Mid Preview (model=V/Gemini) ───────────────
[MID] V축 전체 추천(색/무드/난이도)─► 07_mid_preview.json
  │
  ▼  ───────────────── V축 (Visual, model=V/Gemini) ───────────────
[L0L1] 매체/해상도/fps/비율 + 스타일► 08_L0_L1.json   ★aspect_ratio/fps/resolution 발원지
[L2] 팔레트/색의미/로케이션/의상 ──► 09_L2.json      ★location 디자인(= scene.location id)
[Assets] 캐릭터/로케이션 ref 이미지► 14b_assets.json  (백그라운드; 비동기!)  ★asset URL
  │
  ▼  ── L3 (Compact Mode=D1~D3는 SKIP → L4에서 역추론) ──
[L3] 씬 비주얼 플랜(커버리지/리듬)─► 10_L3_scene_plans(.json|_inferred.json)
  │
  ▼  ───────────────── DIRECTOR (신규, model=V/Gemini) ─────────────
[Découpage] beat→shot 분해(4연산) ─► 10b_decoupage.json  ★샷 개수/리듬/카메라의도 저작
  │
  ▼
[L4] 샷 3분할(intent/static/dynamic)► 11_L4_shots.json   (데쿠파주 있으면 flesh-out)
  │
  ▼  ───────────────── C축 ② (Assemble+Validate, V+C) ─────────────
[C2] L4→ShotSequenceItem 조립 ─────► 12_C_application_2.json
     + 액션버짓 split + ★Layer1 asset-ref 정규화  13_shot_sequence.json
  │
  ▼  ───────────────── L5 (model=V/Gemini, fallback만) ─────────────
[L5] t2i.prompt + ti2v.motion_prompt► 14_final_prompts.json   ★★최종 프롬프트 (여기까지가 "텍스트")
  │
  ▼  ───────────────── 생성 (fal.ai) ──────────────────────────────
[L6] 첫 프레임 이미지 (T2I/I2I) ────► 15_L6_images.json   (asset 있으면 /edit = I2I)
[L7] 영상 클립 (ref→video) ─────────► 16_L7_videos.json   (L6 image + motion_prompt)
```

범례: `★` = canonical 데이터 발원지 / `★★` = 생성기로 가는 최종 텍스트 병목.

---

## 1. 스테이지별 입력/출력 상세

표기: **consumes** = 실제로 읽어 쓰는 입력 / **drops** = 받았지만(또는 상위에 존재하지만) 출력으로 안 넘기는 것.

### S0 — `runS0(input, logger, S)` → `02_S0.json`
| | |
|---|---|
| in | `input.story`, `input.runtimeSeconds?` |
| LLM | ✅ S축 |
| out | `genre, tone[], targetEmotion[], runtime_seconds, depth_level, format` |
| **핵심** | `depth_level`이 여기서 결정 → **D1~D3면 L3 전체 SKIP** (아래 손실지점 ①) |

### S1 — `runS1(input,S0,…)` → `03_S1.json`
| in | story, S0 | out | `structure_type, acts[], pov, theme, central_dramatic_question, turning_point_position` |
|---|---|---|---|

### S2 — `runS2(input,S0,S1,…)` → `04_S2.json` ★캐릭터 id 발원지
| in | story, S0, S1 |
|---|---|
| out | `characters[]{id,name,role,personality,arc,voice,appearance_description,motivation{want,need,wound}}`, `relationships[]`, **`subtext_notes[]`** |
| **drops 하류** | `subtext_notes`, `motivation.wound`, `relationships[].state_change` → **이후 어떤 V 단계도 안 읽음** (손실지점 ②) |

### S3 — `runS3(input,S0,S1,S2,…)` → `05_S3.json` ★location 발원지, ★비트 발원지
| in | story, S0, S1, S2 |
|---|---|
| out | `scenes[]{scene_id, location, time_of_day, weather, characters_in_scene, purpose, emotion_beat{start,end}, dialogue_summary, key_dialogue[], info_asymmetry, estimated_seconds, **scene_actions[]**}` |
| **핵심** | `scene_actions[]` = "비트"(내러티브 단위). 데쿠파주의 `source_beats`가 이 인덱스를 가리킴. `location` 문자열이 canonical location id (이 데이터셋에선 한글 풀네임) |

### C1 — `runCValidation1(S0,S1,S2,S3,…)` → `06_C_validation_1.json`
| 항목 | 내용 |
|---|---|
| in | S0,S1,S2,S3 |
| LLM | ✅ C축 |
| out | 검증 리포트(causality_chain, cdq, cliche…) |
| **주의** | **검증만 함. S를 수정하지 않음** → 발견된 이슈가 자동 반영 안 됨 (사람이 봐야 함) |

### Mid Preview — `runMidPreview(S0,S1,S2,S3,c1,…)` → `07_mid_preview.json`
| 항목 | 내용 |
|---|---|
| in | S0,S1,S2,S3,c1 |
| LLM | ✅ V축 |
| out | `v_recommendations{L0,L1,L2_summary,L3_scene_strategy,L4_shot_recipe}, color_script[], emotional_arc_visualization, production_difficulty` |
| **drops** | `L3_scene_strategy`, `L4_shot_recipe`는 *문자열 힌트* — L2까진 전달되나 L4/데쿠파주가 강하게 참조 안 함 (손실지점 ③) |

### L0L1 — `runL0L1(S0, midPreview,…)` → `08_L0_L1.json` ★aspect/fps/res
| 항목 | 내용 |
|---|---|
| in | S0, midPreview |
| LLM | ✅ V축 |
| out | `L0{medium,resolution,fps,aspect_ratio,rendering_method}`, `L1{art_style,shape_language,line_quality,character_proportion,texture_philosophy}` |

### L2 — `runL2(S2,S3,L1,midPreview,…)` → `09_L2.json` ★location 디자인/의상
| in | S2,S3,L1,midPreview |
|---|---|
| out | `global_palette{primary,secondary,accent,forbidden[]}`, `color_meaning{}`, `locations[]{id,style_description,lighting_sources[],props[]}`, `costumes{charId:[]}`, `vfx_approach` |
| **핵심** | `locations[].id` = canonical location id. **C2/L4가 이 목록을 안 보고 로케이션 id를 지어내던 게 버그** (Layer1/2로 수정함) |

### Assets — `runAssetsGenerate(S2,L0,L1,L2,…)` → `14b_assets.json` ★asset URL
| 항목 | 내용 |
|---|---|
| in | S2(캐릭터), L2(로케이션), L0, L1 |
| 생성 | fal.ai T2I |
| out | `characters[]{id,image_url,…}`, `locations[]{id,image_url,…}` |
| **⚠ 비동기 함정** | index.ts에서 **`.catch()`로 백그라운드 fire-and-forget** (`await` 안 함). L6가 이보다 먼저 끝나면 `hasAnyAssets=false` → **I2I 대신 순수 T2I로 실행됨** (손실지점 ④, 실측 로그에서 발생) |

### L3 — `runL3SceneVisualPlan(S0,S2,S3,L1,L2,midPreview,…)` → `10_L3_scene_plans.json`
| 항목 | 내용 |
|---|---|
| in | S0,S2,S3,L1,L2,midPreview |
| LLM | ✅ V축 |
| out | per-scene `coverage_pattern, shot_count_target, lens_vocabulary[], camera_mounting, camera_energy, lighting_arc, rhythm_profile, cut_pace, avg_shot_seconds, spatial_axis_180, visual_intent` |
| **⚠ Compact** | **D1~D3는 이 스테이지 자체를 건너뜀.** 이후 L4가 자체 판단하고, 사후에 `inferL3FromL4Shots`로 *역추론*해서 `_inferred.json` 저장 (손실지점 ①) |

### Découpage — `runDecoupage(S0,S2,S3,L1,L2,l3Plans|null,…)` → `10b_decoupage.json` ★샷수/리듬/카메라
| 항목 | 내용 |
|---|---|
| in | S0,S2,S3,L2 (+l3Plans는 힌트) |
| LLM | ✅ V축(감독 페르소나) |
| out | per-scene `shots[]{shot_id, operation(derived/added/merged/split), shot_function, source_beats[], added_rationale?, beat_summary, shot_size, intended_duration_seconds, rhythm_role, camera_intent, camera_move_motivation?, dramatic_purpose}` |
| **핵심** | 여기서 **샷 개수·리듬·카메라 의도·쇼트사이즈가 저작됨**. 연출 정보 밀도가 가장 높은 출력 |
| **⚠ 하류 손실** | `rhythm_role`, `shot_function`, `operation`, `added_rationale`, `camera_move_motivation`을 **L4 출력 스키마가 받을 필드가 없음** → L4 통과 시 대부분 소실 (손실지점 ⑤ — 가장 의심되는 지점) |

### L4 — `runL4Shots(S0,S2,S3,L1,L2,scenePlans|null,decoupage|null,…)` → `11_L4_shots.json`
| 항목 | 내용 |
|---|---|
| in | S0,S2,S3,L1,L2, L3plans, **decoupage** |
| LLM | ✅ V축 |
| out | `shots[]{ intent{shot_id,scene_id,story_beat_ref,dramatic_purpose,duration_seconds,audience_focus,shot_position_in_scene}, static{lens_mm,shot_type,camera_angle,dof,framing{rule,layers{fg,mg,bg},focal_point},lighting{ratio,kelvin,quality,direction},character_blocking[]{id,position,pose,gaze,asset_version},prop_placement[],palette_emphasis,texture_notes,color_grading_intent,first_frame_prompt}, dynamic{camera_motion{type,direction,speed,magnitude},character_motion[],gaze_arc[],environmental_change[],transition_in/out,motion_prompt} }` |
| **데쿠파주 모드** | decoupage≠null이면: 샷수/순서/shot_id/shot_size/duration/camera_intent를 데쿠파주에서 고정, spec만 채움 |
| **⚠ 손실** | 데쿠파주의 `rhythm_role`/`shot_function`/`added_rationale`은 **L4 출력에 대응 필드 없음** → 프롬프트 입력으로만 들어가고 구조적으론 소실. 또 `static.framing.layers`, `gaze_arc`, `prop_placement` 등 풍부한 필드는 L4엔 있으나 **C2/L5에서 first_frame_prompt 문자열에 녹아있지 않으면 생성기에 안 감** (손실지점 ⑥) |

### C2 — `runCApplication2(projectId,S0,S1,S2,S3,L0,L1,L2,L3,L4,l3BudgetIssues,…,V,C)` → `12,13`
| 항목 | 내용 |
|---|---|
| in | 거의 전부 + L4 |
| LLM | ✅ V축(조립) + ✅ C축(검증) |
| out(13) | `ShotSequenceItem[]{shot_id,duration_seconds, S{scene_id,scene_purpose,emotion_beat,character_action,dialogue}, C{hook_type,causal_link,motif_active,info_disclosure}, V{camera{type,angle,movement},lighting{ratio,color_temp},composition,mood}, assets{characters[],locations[],props[]}, first_frame_generation{base_assets[],composition_prompt}, video_generation{motion_prompt}, action_budget{}, continuity{} }` |
| **⚠ 손실 (대형)** | L4의 `static_spec`(framing.layers, blocking pose/gaze, prop_placement, color_grading_intent 등 풍부)이 **V는 "요약본"으로 압축**됨 (코드 주석: `V…요약본; 상세는 L4 사용`). 그러나 L5는 L4가 아니라 **이 13번을 읽음** → 압축 후 디테일이 사실상 단절 (손실지점 ⑦, 핵심 의심) |
| Layer1 | ★ asset-ref 정규화 (canonical 강제 + scene.location fallback). 미해결 drop+이슈 |
| split | action_budget 위반 시 Claude가 샷 분할 (데쿠파주 의도 변형 가능) |

### L5 — `runL5Prompts(shotSequence,L0,S2,L2,…)` → `14_final_prompts.json` ★★최종 텍스트
| 항목 | 내용 |
|---|---|
| in | **13_shot_sequence**(=C2 출력), L0, S2, L2 |
| LLM | ⚠ fallback만 (둘 다 있으면 추출만) |
| out | per-shot `t2i{prompt, aspect_ratio, width, height, reference_assets[]}`, `ti2v{motion_prompt, duration_seconds, fps, camera_movement}` |
| **핵심** | 생성기로 가는 건 **딱 두 텍스트: `t2i.prompt`(=composition_prompt) + `ti2v.motion_prompt`** + reference id들. **이 두 문자열에 안 담긴 모든 연출 정보는 영상에 도달 못 함** (손실지점 ⑧ — 최종 병목) |
| 추출원 | t2i ← `first_frame_generation.composition_prompt` ← (C2가 L4b.first_frame_prompt 복사). ti2v ← `video_generation.motion_prompt` ← L4c.motion_prompt |

### L6 — `runL6Images(finalPrompts,…)` → `15_L6_images.json`
| 항목 | 내용 |
|---|---|
| in | 14_final_prompts, **14b_assets**(룩업) |
| 생성 | fal T2I/I2I |
| out | `shots[]{shot_id,image_url,status,…}` |
| 라우팅 | asset 있으면 `openai/gpt-image-2/edit` + `reference_image_urls`(= reference_assets→asset URL). 없으면 순수 T2I |
| **⚠** | `reference_assets` id가 `assetUrlById`에 없으면 **조용히 drop** (Layer1으로 canonical 강제했지만, asset 생성이 안 됐으면 여전히 빈 reference) |

### L7 — `runL7Videos(finalPrompts,images,…)` → `16_L7_videos.json`
| 항목 | 내용 |
|---|---|
| in | 14_final_prompts(ti2v), 15_L6_images(첫프레임 url) |
| 생성 | fal ref→video |
| out | `shots[]{video_url,first_frame_url,status,…}` |
| **⚠** | L6 이미지가 success 아니면 해당 샷 `skipped`. 영상 모션은 `ti2v.motion_prompt`만 따름 (이게 빈약하면 모션도 빈약) |

---

## 2. 정보 손실 지점 요약 (디버깅 우선순위)

연출 품질이 약한 원인은 대부분 "연출 의도가 생성되긴 했는데 최종 두 문자열(`t2i.prompt`/`motion_prompt`)까지 못 왔다"임. 의심 순위:

| # | 손실 지점 | 무엇이 끊기나 | 영향 | 확인 방법 |
|---|---|---|---|---|
| **⑤⑥** | **Découpage → L4** | `rhythm_role`, `shot_function`, `camera_move_motivation`, `added_rationale`이 L4 출력 스키마에 필드가 없음 | 감독이 저작한 *리듬/기능/카메라 동기*가 구조적으로 소실 → 영상이 "균일·무동기" | `10b_decoupage.json`의 rhythm_role ↔ `11_L4_shots.json`/`14`의 motion_prompt가 그 리듬을 반영하나 비교 |
| **⑦** | **L4 → C2 (V 요약)** | `static_spec`의 framing.layers, blocking pose/gaze, prop_placement, color_grading_intent | 풍부한 구도/블로킹 디테일이 V "요약본"으로 압축 | `11_L4_shots.json`의 static_spec ↔ `13_shot_sequence.json`의 V/composition 길이·디테일 비교 |
| **⑧** | **C2 → L5 → 생성기** | 최종은 `composition_prompt` + `motion_prompt` 두 문자열뿐 | 이 두 문자열에 안 녹은 모든 것 소실 | `14_final_prompts.json`의 prompt 안에 blocking/조명/렌즈가 실제 문장으로 있는지 육안 확인 |
| **②** | **S2 subtext → V** | `subtext_notes`, `motivation.wound` | 서브텍스트가 비주얼로 전혀 변환 안 됨 (수작-tier, 대작에선 의도적 보류 가능) | `04_S2.json`의 subtext_notes가 어떤 하류 파일에도 안 나타남 확인 |
| **①** | **Compact Mode L3 SKIP** | D1~D3에서 씬 비주얼 디시플린(렌즈/리듬/180°) | 씬 단위 일관 규율이 L4 즉흥 판단으로 대체 | `02_S0.json`의 depth_level 확인. D1~D3면 `10_L3..._inferred.json`(역추론)인지 보기 |
| **③** | **MidPreview 힌트 미사용** | `L3_scene_strategy`, `L4_shot_recipe` 문자열 힌트 | 초반 연출 전략이 후단에서 약하게만 반영 | `07_mid_preview.json` 힌트 ↔ 실제 L4 결과 일치도 |
| **④** | **Assets 비동기 레이스** | asset 이미지가 L6보다 늦게 생성 | I2I가 순수 T2I로 강등 → 캐릭터/공간 일관성 상실 | `14b_assets.json` mtime vs `15_L6_images.json` mtime, L6의 `model`이 `/edit`인지 |

---

## 3. 빠른 진단 체크리스트 (실측 로그에서)

```
# depth/compact 여부
02_S0.json: depth_level (D1~D3 = L3 skip)

# 연출 의도가 살아있나 (스테이지별로 같은 샷을 따라가며)
10b_decoupage.json  : shot의 rhythm_role / camera_intent / shot_function
11_L4_shots.json    : 같은 shot의 dynamic_spec.camera_motion / motion_prompt — 위 의도 반영?
13_shot_sequence.json: 같은 shot의 V.camera.movement / composition — 디테일 유지?
14_final_prompts.json: 같은 shot의 t2i.prompt / ti2v.motion_prompt — 최종 문장에 다 있나?

# asset 일관성
14b_assets.json 존재 + success? / 15_L6_images.json의 model이 /edit인가? / reference_assets가 asset id와 매칭되나?
```

핵심 질문 한 줄: **"한 샷을 골라 10b → 11 → 13 → 14를 따라가며, 데쿠파주에서 저작한 연출 의도(리듬·카메라·기능)가 14번 두 문자열에 문장으로 남아있는가?"** — 끊기는 지점이 그 샷의 품질 저하 원인.

---

## 4. 부록 — 모델 축 배정 (`DEFAULT_MODELS`)
```
S축 = gemini/gemini-3-flash-preview   (S0~S3)
V축 = gemini/gemini-3-flash-preview   (MidPreview, L0L1, L2, L3, Decoupage, L4, C2-조립, L5-fallback)
C축 = claude/claude-sonnet-4-6        (C1 검증, C2-검증)
```
> ⚠ 연출 저작(Decoupage)·spec(L4)·조립(C2)이 전부 **flash**. 손실지점 ⑤⑥⑦이 약한 모델에서 더 악화될 수 있음 — 프롬프트 준수도 낮으면 리듬/디테일이 generic으로 회귀. (강한 모델 테스트와 프로덕션의 차이를 의심할 것.)
