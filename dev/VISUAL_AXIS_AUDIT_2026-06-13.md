# Visual(V)축 점검 리포트 — Writer 파이프라인

**일자:** 2026-06-13
**범위:** writer 파이프라인의 Visual 축 — `midPreview` → `renderFormat`/`artDirection`(l0_l1_visual) → `productionDesign`(l2_design) → `sceneCinematography`(l3_scene_plan) → (하류 C축 decoupage/shotDesign/shotCheck/renderPrompts) → persist → 소비자.
**방법:** 4개 opus 서브 에이전트 병렬 조사. ①설계 의도 충실도(설계문서↔코드) ②계층 타당성 ③V축 내부 연결 ④하류·persist 연결. 모든 주장은 코드 file:line으로 교차검증. `dev/PIPELINE_IO_MAP.md`를 가설로 두고 재확인(= 정확함 확인). 원자료: `/tmp/vaudit_{intent,layers,flow_intra,flow_down}.md`.
**대상 질문(사용자):** ⑴ 예전 설계가 잘 반영됐나 ⑵ 설계 계층이 타당한가 ⑶ 산출물 연결("거미줄")이 타당한가.

> 네이밍 경고(혼동 주의 — 한 V 스테이지에 **4~5개 이름**): 앱 라벨 `L0~L3` / film-craft 스테이지명 `renderFormat·artDirection·productionDesign·sceneCinematography` / 파일명 `l0_l1_visual·l2_design·l3_scene_plan` / step key `visualFormat` / midPreview의 `v_recommendations` 키 `L0·L1·L2_summary·L3_scene_strategy·L4_shot_recipe`. 본 리포트는 film-craft 스테이지명을 척추로 쓴다.

---

## 후속 조치 (2026-06-13, 사용자 지시 반영)

감사 직후 사용자 확정/착수 사항:
- **E-1 (규율 미강제) → 착수**: V3(sceneCinematography)에 **rule-base 자기검증 + CRITICAL 시 1회 교정 재생성** 추가 (`pipeline/validators/scene_cinematography.ts`). enum 유효성·수치 범위·상류(V2 팔레트·S3 씬 등장인물) 정합 확인. *(완전한 V3→V4 교차 강제는 후속.)*
- **E-2 (midPreview/storyCheck skip) → 의도됨, 작업 안 함**: 현재 skip은 **디버깅용 의도적** 설정. 제거·기본값 변경 보류(§2.2 권고 철회).
- **E-3 (camera/lighting 증발) → 부분 착수 (Option B)**: Director 진입 시 `writer_runs.state->shotDesign`에서 6축 camera/lighting을 근사 복원해 **DB가 DEFAULT일 때만 자동 채움** (`shot-config-from-design.ts` + `/api/writer/shot-configs` + `use-writer-director-sync`, §5 "빈칸만 자율 채움" 정합·편집 보존). persist 하드코딩 자체는 유지(진실 소스 = state).
- **E-4 (first-frame 레버) → 의도됨, 작업 안 함**: **reference-image 방식** 채택이라 start_frame 미사용은 설계 의도. 배선 안 함.
- **명칭**: writer 파이프라인 `l0~l7` → `v0~v7` 리네임 완료(파일·import·주석·프롬프트 라벨·`infer_v3`·CLAUDE.md). 단 `MidPreview.v_recommendations`의 `L0~L4_*` 키는 코드 식별자(midPreview 소속)라 보존.

---

## §0. 핵심 결론 (Executive)

**V축은 *타입·스테이지 레벨에선 원 설계에 충실*하다** — 재설계 문서(`dev/writer_advencement/v_axis_redesign.md`)가 정의한 모든 facet이 `types/pipeline.ts`에 존재하고 각각 생성 스테이지가 있다. 문제는 facet의 *존재*가 아니라 그것이 **강제·연결·영속되는 방식**이다. 의도는 심각도 오름차순 4지점에서 침식된다:

| | 침식 지점 | 한 줄 진단 | 심각도 |
|---|---|---|---|
| **E-1** | **규율이 강제가 아닌 제안** | L3→L4 "자유도 80%→20%" 전파가 프롬프트 텍스트뿐. lens∈vocabulary, mounting→motion 등을 확인하는 validator 부재. 재설계의 *존재 이유*(씬 내부 일관성)에 구조적 보장이 없음 | ⚠️ |
| **E-2** | **협상 키스톤이 무력** | 유일한 S↔V 양방향 점 `midPreview`가 **기본 skip** → 전 필드 빈값. 4개 피드백 기제(Forward Hint·Mid Preview·Back Adjust·Genre Preset) 중 3개 부재. dual-axis가 사실상 단방향 LLM 체인으로 축소 | ⚠️⚠️ |
| **E-3** | **persist 경계에서 V 증발** | `persistShotsToDb`가 camera/lighting을 **DEFAULT(전부 0 / front·5000K)로 하드코딩**. sceneCinematography·decoupage·shotDesign·최종 프롬프트는 **DB 미보존**(state-only) | ★★★ |
| **E-4** | **1차 생성 레버가 미배선** | static/dynamic 분할의 전제인 "first-frame conditioning"이 **어떤 등록 모델에서도 작동 안 함**(image_urls[0]을 첫 프레임으로 고정하는 모델 없음, kling-o3 start_image 미사용). 최근 `Visual_Improvement` 재검토가 이미 발견 | ★★★ |

**바닥선:** "스토리는 좋은데 연출이 약하다"는 체감은 구조로 설명된다. **V축 의도는 `writer_runs.state`에 풍부하게 살아있지만, 렌더러/디렉터가 실제로 읽는 영속 산출물은 손실 투영(lossy projection)이다.** 거미줄처럼 *보이는* 연결의 상당수는 (a) 배선됐지만 죽은 엣지(midPreview), (b) 스키마가 광고하지만 코드가 안 만든 팬텀 엣지, (c) whole-object 전달로 과대선언된 의존이다. 진짜 꼬임은 하류 — hop 압축 → persist 평탄화 → state 우회 비대칭 — 에 있다.

---

## §1. Q1 — 예전 설계가 잘 반영됐나? (의도 충실도)

원자료: `/tmp/vaudit_intent.md`

### 1.1 두 세대의 설계가 있고, **재설계가 캐넌**
- 구 모델(`dual_axis_model.md` 2026-04-15): L0 매체 / L1 스타일 / L2 디자인 / **L3 = 샷별 평면 실행**(영화 문법 레이어 없음).
- **재설계**(`v_axis_redesign.md` 2026-04-20): L0~L2 글로벌 + **L3 = 씬별 비주얼 플랜(신규)** + **L4 = 샷 3분할(의도/정적/동적), 구 L3 대체**. → **코드가 구현하는 건 재설계 모델.** 재설계의 동기는 "354샷 분석에서 카메라 46종/앵글 41종 — 씬 내부 일관성 붕괴" → 씬 단위 영상 문법(L3)을 끼워 L4의 자유도를 규율로 좁힌다.

### 1.2 충실도 판정 (✅충실 / ⚠️부분 / ❌이탈 / 🧟유명무실)

| 설계 의도 | 상태 | 근거 |
|---|---|---|
| renderFormat = 매체/해상도/fps/비율/렌더 | ✅ | `pipeline.ts:357-363` 정확히 5필드 |
| artDirection = 스타일/형태/선/비율/질감 | ✅ | `pipeline.ts:365-371`. taxonomy 미구현은 *예고된 future gap* |
| productionDesign = 팔레트/색의미/로케이션/의상/vfx | ✅(5/5) | `pipeline.ts:373-389` |
| **L2가 8요소(+SOUND +TYPOGRAPHY) 소유** | ❌ | 코드엔 sound·typography 필드 없음. sound는 sceneCine의 힌트로만 잔존. `pipeline_content_gaps.md`도 "사운드 통합 0/10" 자인 |
| sceneCinematography = 씬별 영상 문법 키스톤 | ✅(데이터) | `pipeline.ts:396-438` 설계 전 필드 존재 |
| **L3→L4 규율 전파(자유 80%→20%)** | ⚠️ | **프롬프트 전용, validator 부재**(`l4_shots.ts:82-91`). 규율 *전달*을 약속했으나 코드는 규율 *제안*. → **E-1** |
| L4 3분할(의도/정적/동적) | ✅ | `pipeline.ts:520-626`. 재설계 중 가장 충실 |
| Compact Mode(D1~D3 L3 skip + 역추론) | 🧟 | 기제 완비(`infer_l3.ts`)했으나 `COMPACT_DEPTH_LEVELS=[]`(`pipeline.ts:10`)로 **영구 비활성**(데드코드 보존) |
| **midPreview = 유일 S↔V 협상점** | 🧟 | 기본 skip → `emptyMidPreview()`. 키스톤이 무력. → **E-2** |
| dual-axis 4개 피드백 기제 | ⚠️ | 선형 S→V 순서만 구현. Forward Hint·Back Adjust·Genre Preset 모두 부재(`presetId`는 타입만, 미사용) |
| **first-frame conditioning = 1차 V→생성 레버** | ❌ | 어떤 모델도 image_urls[0] 첫프레임 고정 안 함; kling-o3 start_image 미사용. → **E-4** |
| **V facet이 영속돼 모든 소비자가 동등 pull** | ❌ | persist가 camera/lighting DEFAULT 하드코딩, sceneCine/decoupage/shotDesign DB 미보존. → **E-3** |
| VLM = cinematography 추출기 아님(스타일 참고만) | ✅ | `research_vlm_limitations.md`의 처방대로 — VLM 추출 경로 없음(의도된 후퇴) |
| closed-world(IP-Adapter/ControlNet/LoRA/3축분할) | ❌(의도된 보류) | 전부 미구현이나 *기록된 deferral* — 조용한 누락 아님 |

### 1.3 요약
- **충실(type/stage):** 재설계의 글로벌→씬→샷 골격은 그대로 코드에 있다.
- **유명무실(honest):** Compact·closed-world·VLM추출은 *완성 후 의도적 비활성* 또는 *기록된 보류* — 설계 실패가 아니라 우선순위 결정.
- **진짜 이탈:** L2의 sound/typography 드롭(C4) + 위 4개 침식 지점(E-1~E-4).

---

## §2. Q2 — 설계 계층이 타당한가? (계층 분해 건전성)

원자료: `/tmp/vaudit_layers.md`

**판정: 고도(altitude) 층위는 타당, 경계(boundary)와 라벨은 불건전.** "브리프 → 글로벌 룩 → 씬 플랜 → 샷"의 film-craft 층위는 잘 동기화돼 있고 순서도 옳다. 문제는 **경계 3곳 + 네이밍**이다.

### 2.1 `l0_l1_visual` 병합 = **conflation(개념 혼화), 건전한 merge 아님**
- renderFormat(기술 출력 스펙)과 artDirection(미학 바이블)은 **다른 결정 영역·다른 변경 주기**. 이미 별 타입·별 state 필드·별 소비처(artDirection→5개 하류 허브, renderFormat→2개)인데 **공유하는 건 LLM 호출 1회뿐.**
- 병합이 사주는 건 없음: 출력을 `r.renderFormat`/`r.artDirection`로 무검증 분리(`steps.ts:177`)할 뿐, cross-consistency 검증에 쓰지 않음. 대신 step key `visualFormat`(실재 타입/필드/로그 없는 유령 이름)을 낳아 **최악의 네이밍 핫스팟**.
- `rendering_method`(renderFormat)와 `texture_philosophy`/`art_style`(artDirection)이 enum 강제 없이 한 JSON 호출에서 나와 **모순 가능**(둘 다 "photorealistic" 독립 설정 가능).
- **권고: 분할**(또는 최소한 정직한 합성명 + renderFormat→artDirection 순차 주입). 비용은 Gemini 호출 1회 추가뿐.

### 2.2 `midPreview` = **유명무실(vestigial)인데 load-bearing 의존으로 배선됨**
- 기본 skip(`index.ts:51` `midPreview ?? true`) → `emptyMidPreview()` 전 필드 빈값. 소비 스테이지 3곳이 *이미* 빈값을 견디게 돼 있어 **제거해도 거의 안 깨짐**.
- "S↔V 양방향 협상"은 미실현: (a) 기본 off, (b) 켜도 *순방향*(S→V 제안)뿐 — S를 되돌려 수정하는 경로 없음.
- **권고: 스테이지에서 제거, 옵션 pre-pass로 강등.** 특히 `MidPreview.v_recommendations`의 `L0/L1/L2_summary/L3_scene_strategy/L4_shot_recipe` 키(코드에 박힌 4번째 네이밍 체계)를 삭제. 필요시 `Partial<RenderFormat>`/`Partial<ArtDirection>`을 실재 이름으로 내보내는 typed `visualBrief`로 재도입.

### 2.3 facet 다중 소유(경계 누수)
| facet | 소유자 | 문제 |
|---|---|---|
| **종횡비(aspect ratio)** | `Genre.format`(Story축!) **+** `RenderFormat.aspect_ratio` | **교차축 누수.** Visual 속성이 Story facet에 샌 것 + 중복. 조정 코드 없음 → `Genre.format`은 disagree 가능한 죽은 무게. 권고: 제거 또는 `aspectHint`로 강등, renderFormat 단독 소유 |
| **조명(lighting)** | `productionDesign.locations[].lighting_sources`(정성 소스명) **+** `sceneCine.lighting_arc`(켈빈/비율) **+** `shotDesign.lighting`(정확 켈빈/방향) | **3 소유자, 호환 안 되는 2개 어휘.** l3→l4는 연결되나 **l2("tungsten lamp")↔l3/l4("3200K")는 무연결.** "이 빛은 3200K 텅스텐"의 소유자가 없음 |
| **팔레트 강조** | productionDesign(저작) → sceneCine.palette_emphasis(선택) → shotDesign(재선택) | 저작은 단일(OK), 강조가 2번 재결정(경미) |

### 2.4 네이밍 위험 = **구체적 정확성 위험(cosmetic 아님)**
- `v_recommendations` 키 `L0/L1/L2_summary/...`는 프로젝트 글로서리 규칙("L0~L4는 앱 라벨, 코드 식별자엔 없음")을 **정면 위반하는 실재 TS 식별자**.
- **버그 클래스 1:** `L2_summary`(문자열 힌트) ↔ `productionDesign`(구조체) 이름만 한 끗 — "이름 정렬" 리팩토링이 힌트 문자열과 전체 객체를 조용히 맞바꿀 위험.
- **버그 클래스 2:** step key `visualFormat` ↔ 필드 `renderFormat`+`artDirection` ↔ `has` 가드(`steps.ts:172`) desync 시 serverless-resume에서 **무한 재실행 또는 스테이지 스킵**.
- **버그 클래스 3:** 프롬프트 *본문*은 아직 `S0~S3`/`L0~L2`/`V축 L2` 표기(`l2_design.ts:25`, `l3_scene_plan.ts:52`, `mid_preview.ts:25`). 글로서리는 이 prefix를 2026-06-05 폐기 선언 → 모델이 폐기된 레이어맵으로 추론(조용한 품질 저하).

---

## §3. Q3 — 산출물 연결("거미줄")이 타당한가?

원자료: `/tmp/vaudit_flow_intra.md`(내부), `/tmp/vaudit_flow_down.md`(하류)

### 3.1 V축 *내부*는 사실 거미줄이 아니라 — **default path에선 단순 선형 체인으로 퇴화**
midPreview를 무력화하면 실제 load-bearing 엣지는:
```
genre ──► l0_l1(renderFormat+artDirection) ──(artDirection)──► l2(productionDesign) ──(palette,loc-ids)──► l3(sceneCine)
characters, scenes(부분) ──측면 주입──► l2, l3
```
- **artDirection = 진짜 내부 허브**(l2·l3·decoupage·l4·c2). **renderFormat은 내부 leaf** — l2/l3가 안 읽음, shotCheck/l5에서야 재등장(geometry만).
- diamond 없음, 협상 없음, back-edge 없음.

**그럼 왜 거미줄처럼 보이나 — 3가지 허상:**
1. **죽은 협상 노드.** midPreview 서브그래프 전체가 default-dead. 출력 키 중 `L2_summary`·`L4_shot_recipe`·`emotional_arc_visualization`·`production_difficulty`·`warnings`는 **켜도 아무도 안 읽음(DEAD OUTPUT)**.
2. **팬텀 엣지(스키마가 거짓말).** 코드네임은 L0→format, L1→artDir, **L2_summary→productionDesign, L4_shot_recipe→shotDesign** 팬아웃을 암시하지만 — **코드엔 5개 중 2개만 착지**(`L3_scene_strategy`→l3 live, L0/L1→l0_l1 *블롭으로만*). `L2_summary→l2`(l2는 color_script만 읽음)와 `L4_shot_recipe→shotDesign`(shotDesign엔 midPreview 인자 자체가 없음)은 **배선이 존재하지 않음.**
3. **whole-object 전달(과대선언).** 4개 엔티티가 통째로 넘어가나 얇게만 사용 — l2는 scenes를 `.location`만, l3는 characters를 `{id,name,role}`만/productionDesign을 palette+loc-id만. 시그니처가 의존을 부풀림.

### 3.2 하류는 — **진짜 꼬임/손실 구간** (facet 생존표 발췌)
hop마다 구조화 V 필드가 산문 또는 더 얇은 `V` 요약으로 압축된다.

- **renderFormat:** l3/decoupage/l4에 인자 자체가 아님. l5에서 geometry(해상도/fps/비율)만 생존.
- **artDirection:** l3/l4/c2에 *통 JSON*으로 들어가나 **decoupage에선 명시적 드롭**(`_artDirection` 미사용, `decoupage.ts:209`), l5엔 인자 아님. 구조화 필드로 읽히는 곳 없음 — 프롬프트 컨텍스트 허브일 뿐.
- **sceneCinematography(가장 풍부, DB 미보존):** lighting_arc/palette_emphasis/pov/180°/rhythm은 **l4까지만** 간접 생존, c2엔 요약 한 줄. `sound_motif_hints`·`silence_intentional`·`visual_intent`는 **아무도 안 읽음**(오디오 스테이지 부재).
- **decoupage(연출 분해):** `operation`·`shot_function`·`rhythm_role`·`added_rationale`·`camera_move_motivation`이 **ShotDesign 출력 스키마에 받을 필드가 없음**(`pipeline.ts:520-626`) → l4 프롬프트로만 흘러 LLM이 산문에 접으면 생존, 아니면 소멸. "뇌 아픈 영상의 해독제"가 구조적으로 증발.
- **shotDesign(가장 조밀, DB 미보존):** c2가 "요약본"으로 압축(`c_application_2.ts:60`). lens_mm·depth_of_field·framing.layers·blocking pose/gaze·prop position·palette/texture/color_grading·lighting quality/direction → 대부분 자유텍스트화 또는 소멸. **딱 2개 문자열**(`first_frame_generation.composition_prompt`, `video_generation.motion_prompt`)만 구조화 신호로 생성기까지 도달 — 그리고 그마저 영속 안 됨(아래).

### 3.3 persist 증발 진앙 (`persistShotsToDb`, `persist_manifest.ts:185-200`)
```ts
shot_type:       normShotType(it.V?.camera?.type),  // ← 유일하게 생존하는 V 스칼라
generation_method: 'I2V',                            // 하드코딩
camera_config:   { ...DEFAULT_CAMERA },              // {horizontal:0,vertical:0,pan:0,tilt:0,roll:0,zoom:0}
lighting_config: { ...DEFAULT_LIGHTING },            // {position:'front',brightness:50,colorTemp:5000}
```
- **라이브 DB로 실증 확인**(`.claude/cache/db/shots.md`, prod 168행): camera_config 전부 0, lighting front/5000/50, `prompt: null`.
- `ShotSequenceItem.V` 블록(camera type/angle/movement + lighting ratio/temp + composition + mood) 중 **정확히 1개 스칼라(camera type→shot_type)만 생존**, 나머지는 두 DEFAULT 상수로 평탄화. **최종 t2i/motion 프롬프트는 아예 영속 안 됨**(`shots.prompt=null`).

### 3.4 dead-end & 우회 = **아키텍처 규칙 위반**
- **renderPrompts(l5) = 프로덕션 핸드오프의 hard dead-end.** WRITER_STEPS의 마지막 step, l6/l7 미연결, DB 기록 없음(state + 로컬 로그뿐). Vercel에선 `fsDisabled`로 로그 로드 자체가 no-op(`logger/index.ts:18`). → 생성기가 실제로 쓸 두 문자열이 **영속 저장소에서 복구 불가.**
- **rough-storyboard 우회(확인됨).** `/api/writer/rough-storyboard/route.ts`는 `shots` 테이블이 아니라 **`writer_runs.state->shotDesign` JSONB를 직접 SELECT.** 라우트 docstring이 이유를 자인: *"persist가 V축 facet을 평탄화하며 버리므로(증발), 러프보드는 state 원본 스펙을 직접 쓴다."*
- **비대칭(규칙 §0 위반):** 같은 shot을 **두 소비자가 다른 충실도로** 읽음 — **Director 캔버스**는 영속 `shots` 행(=DEFAULT 0)을, **러프 스토리보드**는 state 원본(=풍부)을. 진실(풍부한 V 스펙)이 1급 저장소(`shots`)가 아니라 **휘발성 운반체(`writer_runs.state`)**에 산다. `.claude/rules/architecture.md §0`("두 소비자가 같은 사실을 알아야 하면 둘 다 진실을 pull")의 교과서적 역전.

### 3.5 증발 지점 종합 (D=hop 드롭, F=persist 평탄화, X=dead-end, B=state 우회로만 복구)
E1 artDirection@decoupage 드롭(D) · E2 renderFormat l3/l4 부재(D) · E3 sceneCine→c2 요약만(D) · E4 sceneCine 오디오/intent 미소비(X) · E5 decoupage 연출필드 출력슬롯 없음(D) · E6 shotDesign static 풍부함 요약 압축(D) · E7 dynamic 압축(D) · **E8 camera_config DEFAULT 하드코딩(F)** · **E9 lighting_config DEFAULT 하드코딩(F)** · E10 composition/mood 미영속(F) · **E11 최종 t2i/motion 프롬프트 미영속(F+X)** · E12 로케이션 디자인 l4 이후 드롭(D) · E13 vfx_approach 무소비(X) · E14 color_meaning 준-사망(X) · **E15 renderPrompts dead-end(X)** · **E16 shotDesign/sceneCine/decoupage DB 미보존(B)** · **E17 director↔storyboard 충실도 비대칭(B)**.

### 3.6 **증발하지 *않는* 것**(— "전부 DEFAULT" 과장 교정, 객관성)
- **renderFormat + artDirection(완전체)는 `projects.design_tokens`에 무손실 영속**(`persist_design_tokens.ts:39-45`)되고, **artist 캐릭터시트 생성기가 실제로 읽음**(`generate-sheet/route.ts:85-97`: art_style/shape_language/palette). 즉 V *스타일/포맷*은 **캐릭터 레퍼런스 이미지까지 생존** — 샷 렌더엔 미도달.
- productionDesign.locations 디자인(style/lighting/props)은 `locations` 행에 영속(초기 캐릭터/월드 레퍼런스 이미지 구동).
- 손실은 **샷-레벨 연출**에 집중 — `shots` 테이블은 shot_type 외 사실상 샷별 시각 연출이 없음.

---

## §4. 최근 `Visual_Improvement` 재검토와의 수렴 (가장 깊은 발견)

원자료: `dev/Visual_Improvement/{verdict,r0-position,r1-counter,action-unit-camera-alignment}.md` + `b-test/out/report.md`

- **문제 정의:** 생성 영상이 "뇌가 아픈 shot들의 연속". 진단된 핵심 = **"거짓 강조 부채(false-emphasis debt)"** — 시청자는 화면 시간을 중요도로 읽는데(체호프의 총), **샷 길이가 극적 무게가 아니라 생성 제약(5~8s 바닥/천장, Veo 고정 8s)으로 정해져** 모든 샷이 "중요해 보임".
- **중심적·불편한 발견(verdict §1):** *"'시작 프레임 조건화' 레버는 현 구현에 존재하지 않는다."* I2I→I2V 재설계 전체가 "first_frame_prompt 이미지가 영상의 첫 프레임이 된다"는 암묵 전제에 기대는데, **등록된 5개 모델 중 image_urls[0]을 첫 프레임으로 보장하는 모델이 없음**(전부 reference-to-video). 유일하게 start/end frame을 지원하는 kling-o3조차 코드가 `start_image_url`을 안 씀. → **본 감사의 E-4와 동일 결론.** "어떤 프롬프트 개선보다 입력 매핑 수정이 선행."
- **권고(우선순위):** ①capability registry + 입력 매핑 수정(kling-o3 start/end, fal.ts duration 절단 제거) ②first-frame QA 게이트(비싼 I2V 전 VLM 판정; 8s 영상 = $0.9~2.4) ③Question ID 원장 + salience/convention validator(자유텍스트 → 구조화; 기존 `hook_type` 10종 재사용).
- **b-test 실증:** "B안"(motion_units 1급화) 2씬/12샷/2런 테스트 — 분절 일관성 group-count 10/12(83%), verb Jaccard 0.80. 단 이는 **스키마 실현가능성** 검증이지 **아이디어 효능**(E1 이해도 실험)은 미실행. R1 위반 = 타입상 표현 불가라 구조적 0.

> **수렴점:** 재검토는 V축의 *씬/샷 구조가 틀렸다*고 결론내지 않았다. (a) 재설계의 load-bearing 가정(first-frame 고정)이 **미배선**이라 프롬프트 레버가 부분적으로 "가짜"이고, (b) 다음 레이어는 **question/salience/alignment validator + capability registry + first-frame QA**이며, (c) 기존 facet들(hook_type·camera_intent·audience_focus·sound_motif_hints·silence_intentional)이 재사용 가능한 비계라는 것. **이 권고들은 아직 미구현 — 전향적 제안.**

---

## §5. 오버홀 결정 지점 (우선순위)

본 감사가 가리키는 결정들. 위에서 아래로 갈수록 "여러 누수를 동시에 막는" 레버.

1. **[★ 단일 최대 레버] 풍부한 V/샷 스펙을 1급 DB 엔티티로 승격할 것인가, vs `state` 우회를 표준화할 것인가.** 이 한 결정이 **E8·E10·E11·E16·E17**(persist 평탄화 + dead-end + 우회 비대칭)을 동시에 붕괴시킨다. 승격하면 Director·러프보드·렌더러가 *같은 진실을 pull*(규칙 §0 충족). 우회 표준화면 최소한 비대칭은 해소하나 휘발성 운반체 의존은 남음. **→ 승격 권장.**
2. **[★ E-4, 재검토와 수렴] capability registry + 입력 매핑 수정.** first-frame 고정이 진짜 작동하게(kling-o3 start/end, duration 절단 제거). 이게 없으면 static/dynamic 분할의 정당성이 가짜 레버 위에 섬. **프롬프트 개선보다 선행.**
3. **[E-1] L3→L4 규율 validator 도입.** lens_mm∈lens_vocabulary, camera_motion↔mounting, color_temp∈lighting_arc, shot_count≈target 을 *구조적으로* 확인. 재설계의 존재 이유에 보장을 부여. (`action-unit-camera-alignment.md` R1~R4가 설계도.)
4. **[E-2 / §2.2] midPreview 제거(또는 typed visualBrief로 강등) + `v_recommendations` 코드 키 삭제.** 4번째 네이밍 체계와 유일한 유명무실 레이어를 한 번에 제거. 소비자 3곳은 이미 빈값 내성.
5. **[§2.1] l0_l1_visual 분할** 또는 정직한 명명 + 순차 주입. 최악의 네이밍 핫스팟 제거(비용: Gemini 호출 1회).
6. **[§2.3] 경계 누수 정리:** aspect_ratio 단일 소유(`Genre.format` 강등) + l2↔l3 조명 계약(소스명↔켈빈 연결 또는 l3 단독 소유).
7. **[저위험] 프롬프트 본문의 `S0~S3`/`L0~L4` 잔재 표기 정리** — 스키마 변경 없음, 버그 클래스 3 완화.
8. **[설계 복원 검토] L2 sound/typography 재도입 여부** — 의도엔 있었으나 드롭(C4). 오디오 스테이지 부재와 연동.

---

## 부록 — 원자료 & 검증 메모
- 상세 4종: `/tmp/vaudit_intent.md`(의도) · `/tmp/vaudit_layers.md`(계층) · `/tmp/vaudit_flow_intra.md`(내부) · `/tmp/vaudit_flow_down.md`(하류).
- `dev/PIPELINE_IO_MAP.md`의 V축 주장은 검사한 모든 지점에서 코드와 일치(사실 오류 없음). 단 로그 prefix 번호는 local-resume 경로 한정 — over-index 주의.
- l6/l7은 *steps.ts 체인에선* dead이나 별도 `/api/writer/generate/*` 라우트로 도달 가능(전역 dead 아님). 프로덕션 핸드오프에선 미연결 + Vercel FS no-op로 사실상 사망.
- 본 리포트는 dev/ WIP 문서(캐넌 아님). 코드 변경 없음.
