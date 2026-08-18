# Direction–END 계보 감사

- 조사명: `audit-direction-end-lineage`
- 조사일: 2026-08-18
- 범위: `src/lib/writer/rough-grid-crop.ts`, `src/app/api/director/generate-storyboard/route.ts`, `src/lib/fal/finalize.ts`, `src/stores/director-store.ts` 및 이 경로가 직접 사용하는 writer/director 프롬프트·타입·표시 파일
- 변경: 코드 수정 없음. Supabase `shots`는 REST SELECT만 수행했으며 쓰기는 하지 않음.
- 테스트/린트/포맷터: 실행하지 않음(요청 조건).

## 1. 결론 요약

1. **러프 생성의 입력**은 샷 액션(필수), 씬의 장소·시간대·분위기, 장소 설명, 인물 수/이름, 카메라·조명·렌즈·조리개·길이, `static_spec`/`dynamic_spec` 또는 writer-v2의 `composition/camera/blocking`이다. rich shotDesign가 있으면 `design_ref`로 조인하고, 없거나 모양이 맞지 않으면 샷 컬럼 폴백을 쓴다.
2. **START**는 정적 구도·인물 배치·환경·액션의 시작 순간이다. **DIRECTION**은 START의 동일한 그림 위에 모션 화살표·라벨·조명/카메라/초점 기술 라벨만 얹는다. **END**는 같은 설정에서 모션을 전부 끝낸 도착 상태다. 정지 모션이면 END는 START와 거의 같게 지시된다.
3. 러프 프롬프트는 이 관계를 문장으로 강제하지만, 산출물은 한 장의 모델 시트이고 `cropRoughGridFrames`가 세 행(또는 세 열)을 바이트로 분리한다. 저장 시 `url`은 START 하위 호환 대표 URL, `frames.start/direction/end`가 실제 세트다.
4. Director 실사 스트립은 러프 세 프레임을 모두 레퍼런스로 합성한다. 반면 목각 previz 영상과 실사 영상(I2V)은 **START+END만** 참조하고 DIRECTION은 참조하지 않는다. DIRECTION은 주로 사람 확인/편집과 최종 리페인트의 화살표 오버레이 지시로 소비된다.
5. 현재 DB(2026-08-18 측정, `shots` 1,893행)는 `rough_storyboard` 완전한 3프레임 865, null 852, non-null이지만 `frames` 부재 176, 부분 프레임 0이다. `storyboard_image`는 완전한 3프레임 432, null 1,285, `frames` 부재 176, 부분 프레임 0이다. `frames` 부재 176건은 레거시 단일 이미지인지 다른 JSON인지 이 집계만으로는 확인 불가다.

## 2. 계보도(입력 → 가이드 → 산출 → 소비)

```text
writer DB / writer_runs state
  ├─ action_description (필수 게이트), scenes.location/time_of_day/mood,
  │  locations.visual_description, characters.name
  ├─ shot_type, camera_config.pan, focal_length, aperture,
  │  lighting_config.position, duration_seconds, check_notes
  ├─ rich static_spec + dynamic_spec (+ intent) [design_ref 조인]
  └─ writer-v2 static_spec {composition,camera,blocking} [non-rich 폴백]
          │ EN 정규화(액션·장소·시간대·이름·rich 자유서술)
          ▼
  buildRoughGridCell()
    ├─ START: 구도/크기/각도/렌즈/인물/레이어/액션/초점/조명·초점
    ├─ DIRECTION 재료: camera_motion + character_motion + gaze_arc
    │                 + duration + KEY/FOCUS/카메라/색온도 라벨
    └─ END: 위 모션이 duration 동안 완전히 끝난 도착 상태 + 같은 조명/초점
          ▼
  buildRoughGridPrompt()
    └─ START = DIRECTION 원본 동일(화살표·라벨만 추가), END만 모션 진행
          ▼ fal 이미지 시트(1×3 또는 4×3)
          ▼ cropRoughGridFrames()
  Buffer {start,direction,end}
          ▼ finalizeRoughGridJob()
  media/*_rough_{start,direction,end}.png
  shots.rough_storyboard {url:start, frames:{start,direction,end}, gridUrl,...}
          ├─ Writer UI / Director Previz UI: 3장 순환 표시
          ├─ rough-adherence: START만 액션·인원·초점 정합 검사
          ├─ directing-edit: DIRECTION 클린 플레이트/편집, 편집 DIRECTION으로 END 재생성
          ├─ generate-previz-video: START + END
          ├─ director/generate-storyboard: 세 프레임 완비 때 strip 합성 → 실사 리페인트
          └─ director/generate-storyboard-batch: 세 프레임 완비 샷만 grid 리페인트
```

## 3. 입력과 프롬프트 재료

### 3.1 생성 자격과 입력 조회

`src/app/api/writer/rough-storyboard/route.ts:187-188`의 원문:

> `'.select(\n            'shot_id, scene_id, shot_type, action_description, characters, camera_config, lighting_config, focal_length, aperture, duration_seconds, rough_storyboard, design_ref, check_notes, prompt, static_spec, dynamic_spec',\n          )'`

`src/app/api/writer/rough-storyboard/route.ts:274-291`:

> `if (!((s.action_description as string) ?? '').trim()) {`
>
> `skipped.push({ shotId, reason: 'no_info' })`
>
> `if (inFlight.has(shotId)) {`
>
> `if (!force && s.rough_storyboard) {`
>
> `if (!force && (failCountByShot.get(shotId) ?? 0) >= AUTO_GENERATION_GIVE_UP_THRESHOLD) {`
>
> `const gridVariant: RoughGridVariant =`  
> `  shotIds?.length === 1 && eligible.length === 1 ? 'strip1' : 'grid4'`

즉 액션이 비면 force여도 제출하지 않는다. 이미 `rough_storyboard`가 있으면 force 없는 재진입은 건너뛰고, 최근 queued/in-flight와 반복 실패 give-up도 제출을 막는다. 단일 샷 명시 재생성은 `strip1`, 그 외는 `grid4`이며 호출당 grid job은 최대 2개다(`route.ts:279-302`).

### 3.2 rich / fallback 조인

`src/app/api/writer/rough-storyboard/route.ts:321-358` 원문 요지와 인용:

> `resolveShotDesign(specByShotId, { shotId: sid, designRef: ... }, projectUsesDesignRefs)`
>
> `const colStatic = s.static_spec as RoughStoryboardSpec['staticSpec'] | null`
>
> `if (colStatic && isRichStaticSpec(colStatic)) {`
>
> `resolvedSpecByShotId.set(sid, { staticSpec: colStatic, dynamicSpec: ... })`

`src/app/api/writer/rough-storyboard/route.ts:359-407`에서는 액션·씬 분위기·rich 자유서술·시간대·장소·인물 이름·writer-v2 연출을 각각 `deriveEnBatch`로 영어화한다. rich가 없으면 `static_spec.engine === 'writer-v2'`일 때 `composition/camera/blocking`을 별도 EN 맵으로 만든다.

`src/lib/writer/types/pipeline.ts:597-610`의 의도 타입 원문:

> `dramatic_purpose: string;`
>
> `duration_seconds: number;`
>
> `audience_focus: string;`

`src/lib/writer/types/pipeline.ts:615-664`의 정적 입력 원문:

> `lens_mm: number;`
>
> `shot_type: string;`
>
> `camera_angle: string;`
>
> `depth_of_field: 'shallow' | 'medium' | 'deep';`
>
> `framing: { rule; layers; focal_point }`
>
> `character_blocking: Array<{ character_id; position_in_frame; pose; gaze; asset_version }>`
>
> `lighting: { key_fill_ratio; color_temp_kelvin; quality; key_direction }`

`src/lib/writer/types/pipeline.ts:665-703`의 동적 입력 원문:

> `camera_motion: { type; direction?; speed; magnitude }`
>
> `character_motion: Array<{ character_id; verb; magnitude }>`
>
> `gaze_arc?: Array<{ character_id; from; to }>`
>
> `motion_prompt: string;`

`src/lib/writer/rough-storyboard.ts:150-183`은 `RoughStoryboardPromptInput`에 액션, 캐릭터, 장소/장소 설명, 시간대, mood, 카메라 pitch, focal length, aperture, 조명 위치, 길이, `spec`, `previzDirection`, `styleHints`를 선언한다. 그러나 현재 grid 경로에서 `RoughStoryboardPromptInput.aspectRatio`와 `safeMode`는 전달되지 않는다(타입에는 있으나 이 경로의 실질 입력으로 확인되지 않음).

### 3.3 셀별 START / DIRECTION / END 문장

`src/app/api/writer/rough-storyboard/route.ts:440-493`는 각 셀에 다음을 전달한다.

> `shotType`, `actionDescription`, `characterNames`, `location`, `locationDescription`, `timeOfDay`, `mood`, `cameraPitch`, `focalLength`, `aperture`, `lightPosition`, `durationSeconds`, `spec`, `previzDirection`, `styleHints`

그리고 `src/app/api/writer/rough-storyboard/route.ts:498-503`에서:

> `const contLine = ci === 0 ? buildCellContinuityLine(prevTextByShotId.get(shotId)) : null`
>
> `return extra.length ? { ...cell, start: \`${cell.start}. ${extra.join('. ')}\` } : cell`

이전 같은 씬 샷의 `prompt` 우선, 없으면 `action_description`을 최대 110자로 잘라 **첫 번째 셀의 START에만** 연속성 재료로 붙인다. `check_notes` 제약도 START에 붙는다.

`src/lib/writer/rough-storyboard-grid.ts:248-328`에서 START 재료를 실제 조합한다.

> `figure ... blank head facing ...`
>
> `fg: ... / mg: ... / bg: ...`
>
> `moment: ${stripColor(input.actionDescription)}`
>
> `focal point: ${focal}`
>
> `lighting and focus (draw these into the sketch): ...`

writer-v2 non-rich의 경우 `src/lib/writer/rough-storyboard-grid.ts:302-311`:

> `composition for THIS shot: ...`
>
> `staging: ...`

`src/lib/writer/rough-storyboard-grid.ts:314-351`은 DIRECTION 재료를 만든다.

> `camera ${words(cam.type)} ...`
>
> `figure ${i + 1}: ${stripColor(words(m.verb))}`
>
> `blank head turns ${words(g.from)} → ${words(g.to)}`
>
> `static hold — no camera or figure movement`

길이는 `src/lib/writer/rough-storyboard-grid.ts:342-347`에서 rich `intent.duration_seconds` 우선, DB `durationSeconds` 폴백으로 `over this shot's full N-second duration:`에 들어간다. DIRECTION 라벨은 `src/lib/writer/rough-storyboard-grid.ts:349-375`에서 `KEY`, 샷 크기/렌즈/각도/초점, `FOCUS`, `WARM|NEUTRAL|COOL N K`를 만든다. 라벨은 DIRECTION 패널 내부 하단에만 쓰도록 지시한다.

END의 핵심 원문(`src/lib/writer/rough-storyboard-grid.ts:377-384`):

> `the same shot after ... the movement completes — ... has fully finished. END must be clearly and visibly different from START: show how far ... this movement actually carries the figures and camera (changed poses, positions and framing), not a subtle variation`
>
> (모션이 없을 때) `nearly identical to START (static shot) — only a subtle natural settling`

### 3.4 시트 가이드의 START/DIRECTION/END 관계

`src/lib/writer/rough-storyboard-grid.ts:436-495`의 원문 계약:

> `Row 1 (top) = START: the composition at the beginning of the shot.`
>
> `Row 2 (middle) = DIRECTION: an EXACT identical copy of Row 1 ... The ONLY difference between Row 1 and Row 2 is the arrows and labels drawn on top.`
>
> `Row 3 (bottom) = END: the composition at the end of the shot ... END must differ clearly and unmistakably from its START ... never a barely-changed copy.`
>
> `Within each column, the three frames depict the SAME camera setup, location, figures and props ... START and DIRECTION are the same frozen instant ... motion progresses ONLY in END.`

`strip1`은 같은 문장을 세로 위→아래로 쓰거나, `frameAxis === 'cols'`인 세로 포맷은 좌→중→우로 바꾼다(`rough-storyboard-grid.ts:437-474`). 방향 행은 유일하게 텍스트가 허용된 곳이며, `geometryContract`는 패널 경계를 움직이지 말고 그림과 캡션을 함께 줄이라고 지시한다(`rough-storyboard-grid.ts:481-495`).

## 4. 산출·크롭·저장 계보

### 4.1 시트 생성 job

`src/app/api/writer/rough-storyboard/route.ts:507-545`에서 `buildRoughGridPrompt` 결과를 템플릿 레퍼런스와 함께 fal에 제출한다.

> `model: DEFAULT_EDIT_IMAGE_MODEL`
>
> `prompt, reference_image_urls: [templateUrl]`
>
> `image_size: sheetGeom.roughImageSize`

그 뒤 `src/app/api/writer/rough-storyboard/route.ts:515-531`에서 `kind: 'shot_rough_storyboard'`, `writerShotIds`, `gridVariant`, `prompt`, `templateUrl`, `sheet_format`을 job snapshot에 남긴다. `writerShotIds` 배열 순서가 셀/샷 배분 순서의 기준이다(`src/lib/generation-jobs.ts:33-36`).

### 4.2 크롭

`src/lib/writer/rough-grid-crop.ts:29-32` 타입 원문:

> `export interface RoughGridFrames { start: Buffer; direction: Buffer; end: Buffer }`

`src/lib/writer/rough-grid-crop.ts:237-254`:

> `반환 배열 길이 = shotCount (샷 순서 = 제출 시 writerShotIds 순서).`
>
> `if (shotCount < 1 || shotCount > shotAxisLen) { throw new Error(...) }`

포맷 시트 경로(`rough-grid-crop.ts:255-386`)는 프레임 축을 읽고, DIRECTION만 `overflowBelow`로 캡션 하단을 추가한 뒤 표준 크기로 `fill` 또는 `contain` 정규화한다. `rough-grid-crop.ts:390-447` 레거시 경로는 거터 전역 검출 → 앵커 폴백 후 `frameBounds`를 순회하여:

> `out.push({ start: frames[0], direction: frames[1], end: frames[2] })`

따라서 정상적인 3행/3열 지오메트리에서는 세 버퍼가 항상 생성된다. 다만 입력 이미지가 모델의 시트 계약을 어겼는지(내용이 올바른 칸에 있는지)는 이 함수가 의미적으로 판정하지 않고 픽셀 경계만 검출한다.

### 4.3 러프 finalize 저장

`src/lib/fal/finalize.ts:1033-1035`의 원문:

> `그리드 원본 업로드 → 셀 크롭(cropRoughGridFrames) → 샷별 3프레임 업로드 →`
>
> `shots.rough_storyboard 를 3프레임 shape(frames+gridUrl, url=start 하위호환)로 갱신.`

`src/lib/fal/finalize.ts:1066-1091`:

> `const perShot = await cropRoughGridFrames(...)`
>
> `upload(..._rough_start.png, frames.start)`
>
> `upload(..._rough_direction.png, frames.direction)`
>
> `upload(..._rough_end.png, frames.end)`
>
> `rough_storyboard: { url: startUrl, frames: { start: startUrl, direction: directionUrl, end: endUrl }, gridUrl, status: 'completed', ... }`

`src/lib/fal/finalize.ts:1120-1133`의 단일 패널(레거시) 경로는 `..._rough_storyboard.png` 하나만 저장하고 `frames`를 만들지 않는다. 따라서 현재의 176건 `no_frames`와 호환되는 생성 경로가 코드에 명시돼 있다.

### 4.4 실사 strip/grid finalize 저장

실사 strip(`src/lib/fal/finalize.ts:859-889`)은 반환 방향이 계약과 반대면:

> `frames = { start: inset, direction: inset, end: inset }`

으로 단일컷을 세 프레임에 복제한다. 방향이 맞으면:

> `;[frames] = await cropRoughGridFrames(stripBuf, 'strip1', 1, sheetFmt)`

후 `src/lib/fal/finalize.ts:882-903`에서 실사 `storyboard_image.frames`에 세 URL을 저장한다. 이 폴백은 저장 형식상 완전하지만 Direction/END의 의미가 단일 입력으로 소실되는 조건이다.

실사 grid(`src/lib/fal/finalize.ts:994-1020`)도 `cropRoughGridFrames` 후 각 샷에 `storyboard_image.frames`를 저장한다. 출력 방향이 요청과 다르면 `finalizeRealGridJob`이 `throw`하여 샷별 저장 전 단계에서 중단한다(`finalize.ts:970-981`).

## 5. 소비 경로

### 5.1 Writer/Director 표시

`src/types/shot.ts:48-68`의 계약:

> `DB shots.rough_storyboard JSONB — Director의 storyboard_image와 동일 shape, 다른 용도.`
>
> `대표 프레임(3프레임 세트에선 start)`
>
> `start → direction(화살표/지시문) → end. UI 는 순환 재생.`

`src/stores/writer-store.ts:993-997`는 DB `s.rough_storyboard`를 Writer store의 `roughStoryboard`로 그대로 옮긴다. `src/features/director/hooks/use-rough-storyboard.ts:15-31`은 Director가 Writer store를 `writerShotId`로 구독하는 경계다.

`src/components/rough-frame-cycle.tsx:27-76`은 `frames`가 있으면:

> `const urls = f ? [f.start, f.direction, f.end] ... : [panel.url]`

로 읽고, `src/components/rough-frame-cycle.tsx:27` 주석은 라벨을 `START→DIRECTING→END`로 명시한다. `frames`가 없는 레거시 패널은 `panel.url` 정적 폴백이다.

Director Shot node(`src/features/director/canvas-nodes/ShotNode.tsx:38-48`)는 chain shot에서 `rough.frames?.start ?? rough.url`을 대표 이미지로 쓴다. 완료 + frames일 때만 `RoughFrameCycle`을 렌더한다(`ShotNode.tsx:130-137`). Director grid(`src/features/director/canvas-views/StoryboardGridView.tsx:178-182,224-240,373-397`)도 `rough.frames`를 previz 모드의 순환 패널로 쓰고, 실사 모드에서는 `storyboardImage.frames`가 있으면 같은 컴포넌트로 순환한다. `frames`가 없는 러프는 `roughStartUrl` 단일 이미지로 표시된다(`StoryboardGridView.tsx:383-389`).

### 5.2 Director 실사 이미지 생성

`src/stores/director-store.ts:2116-2144`:

> `const prompt = effectivePrompt(data) || data.label`
>
> `const referenceImageUrls = resolveShotAssetImages(data)`

DB-backed shot은 `src/stores/director-store.ts:2146-2162`에서 `/api/director/generate-storyboard`로 이 prompt와 asset reference만 보낸다. rough 프레임 URL을 클라이언트가 직접 보내지는 않는다.

서버는 `src/app/api/director/generate-storyboard/route.ts:63-87`에서 DB `rough_storyboard`를 읽어 세 필드가 모두 있을 때만 strip 모드로 승격한다.

> `const stripFrames = roughFrames?.start && roughFrames.direction && roughFrames.end ? ... : null`

세 필드 중 하나라도 없으면 `src/app/api/director/generate-storyboard/route.ts:80-87,170-182`의 분기대로 기존 단일 이미지 경로다. strip 경로에서는 `composeRoughReferenceStrip`가 세 프레임을 모두 fetch한다(`src/lib/director/storyboard-strip.ts:95-106`).

그 후 `src/app/api/director/generate-storyboard/route.ts:145-183`에서 `buildRealStripPrompt(guardedPrompt, ...)`를 호출하고 레퍼런스 배열을:

> `[stripRefUrl, ...(callerRefs ?? []), ...(anchor ? [anchor.imageUrl] : []), ...]`

로 만든다. `guardedPrompt`에는 클라이언트 prompt, DB `check_notes`, 같은 씬 직전 샷의 prompt/action 연속성 문장이 들어간다(`generate-storyboard/route.ts:91-119`). `sceneLighting`은 씬의 `time_of_day`를 직접 조회한다(`route.ts:120-141`).

`buildRealStripPrompt`의 START/DIRECTION/END 원문(`src/lib/director/storyboard-strip.ts:308-335`):

> `Top/Left panel = START frame.`
>
> `Middle panel = DIRECTION frame — the same drawing as START plus hand-drawn direction arrows and text labels ...`
>
> `Bottom/Right panel = END frame, after that movement completes.`
>
> `Middle panel: the exact same image as the ... panel ... Never invent arrows or labels ... if the rough sheet has no arrows (a static hold), the middle panel stays clean`
>
> `END frame ... every element the motion changed ... must be shown in its completed end state ... never repeat the START panel's state.`

실사 단일 strip 완료는 `finalizeStoryboardStripJob`가 `storyboard_image.frames`를 저장하고(`finalize.ts:882-903`), 클라는 job result의 대표 URL을 받은 뒤 DB 재수화로 세 프레임을 회수한다(`src/stores/director-store.ts:2177-2180`). 다만 `hydrateFromDb`는 `shots.storyboard_image`만 select한다(`src/stores/director-store.ts:1135-1152`); 러프는 Writer store 경계에서 따로 읽는다.

### 5.3 실사 일괄 grid

`src/app/api/director/generate-storyboard-batch/route.ts:59-75`는 `storyboard_image`가 비어 있고 `rough_storyboard.frames.start/direction/end`가 모두 있는 샷만 eligible로 삼는다. `route.ts:131-143`에서 `composeRoughReferenceGrid(group.map(s => s.frames), projectFormat)`로 세 프레임을 합성하고, `route.ts:174-190`에서 `buildRealGridPrompt`와 레퍼런스 목록을 만든다. `buildRealGridPrompt`는 `src/lib/director/storyboard-strip.ts:234-245`에서 각 컬럼의 START/DIRECTION/END 역할과 같은 행 보존을 다시 지시한다.

즉 러프 프레임 하나라도 없으면 일괄 실사 생성의 eligible에서 조용히 제외된다. 이미 `storyboard_image`가 있으면 빈칸 채우기 배치에서 제외되어 개별 strip 재생성 소관이다(`generate-storyboard-batch/route.ts:69-71`).

### 5.4 목각 previz 영상

`src/app/api/director/generate-previz-video/route.ts:72-94`:

> `V2 refs: 러프 3프레임의 START+END.`
>
> `if (!frames?.start || !frames?.end) { ... status: 422 }`
>
> `image_url: frames.start,`
>
> `image_urls: [frames.start, frames.end],`

프롬프트는 `src/app/api/director/generate-previz-video/route.ts:24-39`에서 START 이미지를 첫 이미지, END를 완료 상태로 정의한다. DIRECTION은 이 영상 API에 전송되지 않는다.

### 5.5 실사 영상(I2V)

`src/stores/director-store.ts:2344-2384`는 완료된 실사 `storyboardImage`가 있으면 대표 URL을 I2V 기본 레퍼런스로 쓰고, 프레임 세트가 있으면:

> `const referenceImageUrls = sbFrames ? [sbFrames.start, sbFrames.end] : undefined`

로 START+END만 `/api/director/generate-video`에 보낸다. Direction은 소비되지 않는다. 프롬프트는 `getEffectiveShotConfig`가 만든 영상용 effective prompt이고, 러프 셀의 motion 문장을 직접 재사용한다는 근거는 이 경로에서 확인되지 않는다.

### 5.6 START 정합 검사, Direction 편집, export/목록

- `src/app/api/writer/rough-adherence/route.ts:50-70`은 완료 러프에서 `frames.start ?? url`만 VLM에 보낸다. 액션·`static_spec.framing.focal_point`·인원 수로 claim을 만들고, 결과는 `rough_storyboard.adherence`에 병합한다(`route.ts:100-124`). Direction/END 정합은 검사하지 않는다.
- `src/lib/writer/directing-edit.ts:67-86`은 `frames.direction`이 없으면 클린 플레이트를 거부한다. `regenerateEndFrame`은 `frames.direction`을 레퍼런스로 받아 END를 다시 그리고 `frames.end`만 교체한다(`directing-edit.ts:128-164`). 생성 중 `generatedAt`이 바뀌면 저장을 거부한다(`directing-edit.ts:148-153`). `saveDirectingFrame`은 같은 방식으로 Direction URL만 교체한다(`directing-edit.ts:174-204`).
- `src/app/api/project/list/route.ts:37-68`은 실사 `storyboard_image.frames.start`를 먼저, 그 다음 러프 `rough_storyboard.frames.start`를 프로젝트 썸네일로 선택한다.
- `src/lib/export/writer-board.ts:86-91,175,279-282`는 러프 `rough_storyboard.url`만 export한다. Direction/END는 export 산출물에 포함되지 않는다.

## 6. 끊기는 조건과 실제 영향

### 확정된 코드 조건

| 조건 | 끊기는 지점/영향 | 근거 |
|---|---|---|
| `action_description` 공백 | 러프 제출 자체가 `no_info`로 skip | `writer/rough-storyboard/route.ts:274-282` |
| queued 잡이 TTL 내 존재 | in-flight skip | `route.ts:207-218,226-238` |
| 기존 러프 존재 + force 없음 | 재생성 skip | `route.ts:274-277` |
| 반복 failed + force 없음 | give-up skip | `route.ts:278-283` |
| `writerShotId` 없음 | Director는 DB job이 아니라 동기 `/api/generate/image`; DB 러프/frames와 연결되지 않음 | `director-store.ts:2146-2162,2184-2238` |
| rough `frames` 중 start/direction/end 하나라도 없음 | Director strip 승격 실패, 단일 이미지 경로 | `generate-storyboard/route.ts:80-87` |
| rough START 또는 END 없음 | 목각 previz video 422 | `generate-previz-video/route.ts:72-78` |
| rough 세 프레임 중 하나라도 없음 | 실사 batch eligible 제외 | `generate-storyboard-batch/route.ts:69-75` |
| 모델 결과가 실사 strip 방향 계약 위반 | Direction/END 의미를 보존하지 못하고 한 inset을 세 프레임에 복제 | `finalize.ts:859-880` |
| 실사 grid 출력 방향 위반 | `throw`, 해당 finalize 저장 중단 | `finalize.ts:970-981` |
| grid/strip 결과 <50,000 bytes | finalize throw, DB completed 저장 전에 중단 | `finalize.ts:833-844,1049-1055` |
| 크롭 metadata 누락 | `cropRoughGridFrames` throw | `rough-grid-crop.ts:259-262,404-406` |
| `shotCount`가 시트 축 범위를 벗어남 | 크롭 throw | `rough-grid-crop.ts:248-252` |
| 각 샷 storage upload 또는 DB update 실패 | 루프가 throw; 앞선 샷은 이미 저장됐을 수 있어 한 job 내 샷 세트가 부분 착지할 수 있음 | `finalize.ts:1073-1100`의 순차 loop와 각 `if (error) throw error` |
| 레거시 단일 패널 job | `rough_storyboard.url`만 저장, `frames` 없음 | `finalize.ts:1116-1133` |
| Director store hydrate | `storyboard_image`만 DB에서 읽고 `rough_storyboard`는 읽지 않음. 러프가 필요한 Director UI는 별도 Writer store/hook 경계에 의존 | `director-store.ts:1135-1152`, `use-rough-storyboard.ts:1-31` |
| export | `url`만 내보내므로 Direction/END 누락 | `export/writer-board.ts:86-91,279-282` |

### 코드만으로 판정할 수 없는 부분

- fal 모델이 시트의 START/DIRECTION/END 내용을 실제로 올바른 칸에 그렸는지, 특히 빈 칸·캡션 오버플로·모션 도착 상태가 의미적으로 맞는지는 코드 정적 추적만으로 판정할 수 없다.
- `rough_storyboard` non-null + `frames` 부재 176건이 정확히 어느 레거시 버전/JSON shape인지, URL이 살아 있는지는 이번 집계에서 row-level URL 검증을 하지 않아 확인 불가다.
- `frames` URL이 storage에 실제로 존재하는지, CDN 캐시가 최신인지, 외부 fal URL 만료 여부는 코드 계보만으로 확인 불가다.
- START/END가 Director 영상 생성에서 실제로 모델에 어느 정도 반영됐는지는 provider 응답 이미지/영상의 시각 검증 없이는 확인 불가다.

## 7. 라이브 DB 실측(읽기 전용)

상세 원자료는 `db-measurement.json`에 보존했다. 2026-08-18에 Supabase REST `public.shots`를 `project_id,shot_id,rough_storyboard,storyboard_image`로 두 페이지(0–999, 1000–1892) SELECT했다.

분류 규칙:

- `complete`: `frames.start`, `frames.direction`, `frames.end`가 모두 비어 있지 않은 문자열.
- `partial`: `frames` 객체는 있으나 세 키가 모두 채워지지 않음.
- `no_frames`: JSON은 null이 아니지만 `frames` 키가 없거나 object가 아님(legacy 단일 이미지 여부는 별도 확인 필요).
- `null`: 컬럼 자체가 null.

| 컬럼 | 전체 | 완전 3프레임 | 부분 세트 | non-null frames 부재 | null | completed 상태 |
|---|---:|---:|---:|---:|---:|---:|
| `rough_storyboard` | 1,893 | 865 | 0 | 176 | 852 | 1,041 |
| `storyboard_image` | 1,893 | 432 | 0 | 176 | 1,285 | 608 |

`rough_storyboard` non-null 1,041건 중 완전 세트 865건(83.1%), frames 부재 176건(16.9%)이다. 부분 키 조합은 0건이었다. `storyboard_image` non-null 608건 중 완전 세트 432건(71.1%), frames 부재 176건(28.9%)이다. 이 수치는 현재 snapshot의 규모이지 프로젝트별/샷별 원인 분해가 아니다.

## 8. 검색 대조표

실행한 검색은 대소문자 구분 없이 `src` 전체를 대상으로 했다. 아래는 요청한 키의 모든 결과 경로를 기능별로 묶은 것이다(검색 결과 자체의 주석/선언도 포함).

### `cropRoughGridFrames`

- `src/lib/writer/rough-grid-crop.ts:238` 선언.
- `src/lib/fal/finalize.ts:18` import; `:880` 실사 strip 호출; `:994-1000` 실사 grid 호출; `:1034` 주석 계보; `:1067-1073` 러프 grid 호출.
- `src/lib/director/storyboard-strip.ts:5-6` 기존 crop 재사용 주석.

### `frames.start` (점 표기 그대로 검색)

- `src/app/api/director/generate-previz-video/route.ts:92-93,106-107` provider `image_url`와 `image_urls`.
- `src/lib/director/storyboard-strip.ts:104` strip 합성 fetch.
- `src/lib/fal/finalize.ts:883,887,1005,1009,1078,1082` 실사/러프 frame upload 및 thumbnail.

필드 접근을 포함한 `frames.*start` 대조 결과(점 앞에 별칭이 붙은 경우 포함):

- 타입/복사: `src/app/api/director/generate-storyboard-batch/route.ts:30-31,75-76`, `src/app/api/director/generate-storyboard/route.ts:81-84`, `src/lib/director/storyboard-strip.ts:99-104`, `src/lib/writer/directing-edit.ts:24-25`.
- 대표 URL 선택/검사: `src/app/api/project/list/route.ts:40,54`, `src/app/api/writer/rough-adherence/route.ts:52-59,68-69`, `src/features/director/canvas-nodes/ShotNode.tsx:47-48`, `src/features/director/canvas-views/StoryboardGridView.tsx:235-236`.
- 크롭/저장/재수화: `src/lib/writer/rough-grid-crop.ts:402,447`, `src/lib/fal/finalize.ts:869,878,883-894,1005-1016,1078-1089`, `src/stores/director-store.ts:2204-2206`.

### `frames.end` (점 표기 그대로 검색)

- `src/app/api/director/generate-previz-video/route.ts:93,106` START+END provider references.
- `src/lib/director/storyboard-strip.ts:106` strip 합성 fetch.
- `src/lib/fal/finalize.ts:885,1007,1080` 실사/러프 END upload.
- `src/lib/writer/directing-edit.ts:145` END storage path, `:160` END URL 갱신.

필드 접근을 포함한 `frames.*end` 대조 결과:

- 타입/복사: `src/app/api/director/generate-storyboard-batch/route.ts:30-31,75-76`, `src/app/api/director/generate-storyboard/route.ts:81-84`, `src/lib/director/storyboard-strip.ts:99-106`, `src/lib/writer/directing-edit.ts:24-25`.
- END 가드/소비: `src/app/api/director/generate-previz-video/route.ts:73-75,92-93,105-106`, `src/lib/writer/directing-edit.ts:127-130,145,160`, `src/lib/writer/rough-grid-crop.ts:402,447`.
- 저장/완료: `src/lib/fal/finalize.ts:869,878,884-894,1006-1016,1079-1089`.

### `rough_storyboard`

- 생성/입력: `src/app/api/writer/rough-storyboard/route.ts:4,50,188,274`; `src/app/api/director/generate-storyboard/route.ts:64,80-87`; `src/app/api/director/generate-storyboard-batch/route.ts:63,69-75`.
- 저장: `src/lib/fal/finalize.ts:1034-1035,1087-1093,1129-1134`.
- 읽기/소비: `src/stores/writer-store.ts:994-997`; `src/features/writer/rough-storyboard-view.tsx:85,286,292-298,468-469`; `src/features/director/hooks/use-rough-storyboard.ts:15-31`; `src/features/director/canvas-nodes/ShotNode.tsx:38-48,130-137`; `src/features/director/canvas-views/StoryboardGridView.tsx:178-182,228-240,377-389`; `src/app/api/director/generate-previz-video/route.ts:54,73-78,116`; `src/app/api/writer/rough-adherence/route.ts:3,43,51-70,101-124`; `src/lib/writer/directing-edit.ts:32,37,98,158-163,196-200`; `src/app/api/project/list/route.ts:44,64`; `src/lib/export/writer-board.ts:37,57,88`; `src/lib/generation-jobs.ts:33-36`.

## 9. 판정

- **확인됨:** START→DIRECTION(동일 정지 그림+주석)→END(모션 완료) 계약은 셀 빌더와 시트 프롬프트 양쪽에 명시되어 있다. 러프 저장·실사 스트립/grid 배치·Writer/Director 순환 표시·START+END 영상 참조까지 파일:줄로 연결된다.
- **끊김이 명시됨:** 액션 공백, frames 불완전, 레거시 단일 패널, 실사 strip 방향 위반 단일컷 복제, grid 방향 위반 throw, provider/storage/DB 오류, 수동 Director 노드, export의 URL-only 소비.
- **확인 불가:** 모델이 실제 그림에서 계약을 지켰는지, DB 176건의 정확한 legacy 원인과 URL 유효성, 외부 media 객체의 생존/최신성, 최종 영상의 시각적 START→END 수렴.
