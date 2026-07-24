# ORIGIN 팔 설계도 — 정본 i2i 배선 복원판, 현행 제품 실력 재측정

> 제품이 원래 의도한 배선(정본 이미지 + writer 샷 프롬프트 → i2i → 샷 프레임 → 영상)을 복원한 상태에서, 어제 무효가 된 BASE 팔을 다시 측정하는 팔이다.
>
> - 상태: **오너 확인 대기** (이 문서 승인 전 유료 호출 없음)
> - 작성일: 2026-07-24
> - 상위 설계: [design.md](design.md)
> - 팔 이름: ORIGIN ("origin product pipeline")

---

## 1. 개요 — 의도 / 가설 / 왜 이걸 하는가

### 지난 실험이 어떻게 박살났는가

어제 실험([2026-07-23_full-copy-bundle](../2026-07-23_full-copy-bundle/design.md))의 BASE 팔은 **무효 판정**됐다. 제품 writer의 샷 이미지 스테이지(`v6_images.ts`)는 정본 에셋 매니페스트(`14b_assets.json`)가 있으면 i2i(`openai/gpt-image-2/edit` + 참조 이미지)로 라우팅하게 되어 있는데, 그 매니페스트를 만들던 스테이지가 리팩토링 때 삭제되어 있었다. 그 결과 실험은 매니페스트 없는 경로 — **순수 T2I** — 로 흘렀고, 샷마다 스타일·의상·공간이 제각각인 쓰레기 프레임이 그대로 영상 입력으로 들어갔다. 우리가 측정한 것은 "현행 제품의 실력"이 아니라 "배선이 끊긴 제품의 사고 현장"이었다.

제품이 원래 의도한 배선은 이렇다:

> artist 탭의 정본 이미지(캐릭터 시트 + 배경) + writer 샷 프롬프트 → i2i → 샷 시작 프레임 → 영상

### 이 팔의 의도

ORIGIN 팔은 그 배선을 손으로 복원한 상태에서 **현행 제품 실력을 재측정**한다. writer가 만든 프롬프트는 한 글자도 고치지 않고(제품이 쓴 프롬프트가 측정 대상), 끊겨 있던 참조 이미지 연결만 되살린다. 즉 "매니페스트 스테이지가 삭제되지 않았다면 제품이 냈을 결과"의 근사치다.

### 가설 (사전 고정)

> 정본 i2i 배선을 복원하면 BASE의 신원·스타일 드리프트는 사라지지만, 연출(카메라·컷 연결) 품질은 여전히 사람판(BKM)에 못 미친다.

- 드리프트가 사라지는지 → 프레임 20장을 정본과 대조해 판정.
- 연출이 못 미치는지 → 최종 이어붙인 영상을 BKM 팔과 나란히 놓고 연속성·부드러움·리듬으로 판정(연출 품질이 최우선 지표).

---

## 2. 공통 재료

모든 경로는 이 문서 기준 상대경로.

| 재료 | 경로 | 비고 |
|---|---|---|
| writer 산출 20샷 | [../2026-07-23_full-copy-bundle/assets/arm-base/shots.json](../2026-07-23_full-copy-bundle/assets/arm-base/shots.json) | **재사용, 재실행 없음** — FRAMEFIX 팔과 동일 재료를 써야 비교가 성립. 20샷 · 총 74초 |
| 정본 캐릭터 | [../2026-07-23_character-canon/assets/identity_ref.jpg](../2026-07-23_character-canon/assets/identity_ref.jpg) | 이하 "identity_ref" |
| 배경 플레이트 | [../2026-07-23_input-format/assets/plates/src_empty_wide.jpg](../2026-07-23_input-format/assets/plates/src_empty_wide.jpg) | 빈 화장실 와이드. 이하 "plate" |
| jobs 스키마 전례 | [../2026-07-23_full-copy-bundle/jobs.base.json](../2026-07-23_full-copy-bundle/jobs.base.json) | task `i2v_se` · image · seconds · aspect `16:9` · out |
| i2i 스테이징 패턴 전례 | [../2026-07-23_full-copy-bundle/tools/stage_bkm.mjs](../2026-07-23_full-copy-bundle/tools/stage_bkm.mjs) | fal `openai/gpt-image-2/edit`, 참조 업로드·resume 방식 |

모델·레인:

- **이미지(i2i)**: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력 png. 프롬프트는 shots.json의 `image_prompt` **원문 그대로(한 글자도 수정 금지)** + 샷별 참조 이미지(아래 샷별 설계에 명시).
- **이미지(T2I, shot_10 한정)**: fal `openai/gpt-image-2` — 참조 없음. BASE 프레임 스테이징과 동일 모델·동일 조건.
- **영상**: Seedance 2.0, **힉스필드 레인**(`dispatch.mjs --mode higgsfield`, jobType `seedance_2_0`, 720p) · task `i2v_se`(끝 프레임 없음) · seconds = `duration_seconds` 그대로. 전례: jobs.base.json이 2~7초 값으로 19/19 완주.
- **편집 없음**: 제품 정의 그대로 생성 순서·길이로 이어붙임. 트리밍·재배열·속도 조정 일절 없음.

산출 경로(실험 루트 = 이 문서가 있는 폴더):

- 시작 프레임: `assets/arm-origin/frames/NN.png`
- 클립: `assets/clips/arm-origin/NN.mp4` (jobs의 `out`은 assets 기준 `clips/arm-origin/NN.mp4`)
- 잡 파일: `jobs.origin.json` (실험 루트)

참조 선정 규칙(샷별 판단은 아래 본체에 개별 명시):

1. 인물(신체 일부 포함: 손·발·양말 등)이 등장하는 샷 → identity_ref 포함
2. 공간(화장실)이 보이는 샷 → plate 포함
3. 완전 암전·추상 샷 → 참조 없음(T2I 유지), 근거 명시

shot_2 특례: 지난번 fal T2I에서 4회 연속 content_policy_violation(422)으로 차단돼 Ⓑ 확정·제외됐던 샷. 이번엔 **포함**한다 — edit 레인 + 참조라 재시도 가치가 있다. 재차단 시 처리는 지난 규칙 유지: 동일 입력 4회 재시도 후에도 차단이면 Ⓑ 분류·제외.

---

## 3. 샷별 설계 (본체)

### 샷 01 — shot_1 (5s)

- **행동**: Establish the clinical, eerie atmosphere of the retro-pastel restroom at dawn.
- **카메라(writer 산출)**: `{"type":"WS","angle":"eye_level","movement":"static"}` · 구도: The vanishing point at the center of the restroom corridor. · 무드: Desaturated pastels with a cold, clinical blue undertone.

**이미지 생성(i2i) 페이로드**

- 모델: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/01.png`
- 참조: **plate** — 인물 없는 빈 화장실 와이드 샷. 공간이 프레임 전체이므로 플레이트만.
- 프롬프트 원문 (`image_prompt`, 무수정):

```
A wide shot of an empty retro restroom with mint-green tiles and pink accents. Angular porcelain sinks line the wall under sharp-edged mirrors. Hard overhead fluorescent lighting creates sharp shadows. The art style is painterly retro-noir with clean lines and a palette of light steel blue and cherry blossom pink.
```

- 한국어 번역: 민트그린 타일과 핑크 포인트로 꾸며진 텅 빈 레트로 화장실의 와이드 샷. 날카로운 모서리의 거울들 아래로 각진 도기 세면대들이 벽을 따라 늘어서 있다. 머리 위의 강한 형광등 조명이 날카로운 그림자를 만든다. 아트 스타일은 깔끔한 선과 라이트 스틸블루·벚꽃 핑크 팔레트의 회화적 레트로 누아르.

**영상 생성 페이로드**

- task `i2v_se` · seconds `5` · aspect `16:9` · 입력 `arm-origin/frames/01.png` → 출력 `clips/arm-origin/01.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
The overhead fluorescent lights flicker subtly in the empty, silent restroom.
```

- 한국어 번역: 텅 비고 고요한 화장실에서 머리 위 형광등이 미세하게 깜빡인다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_01",
  "task": "i2v_se",
  "prompt": "The overhead fluorescent lights flicker subtly in the empty, silent restroom.",
  "image": "arm-origin/frames/01.png",
  "seconds": 5,
  "aspect": "16:9",
  "out": "clips/arm-origin/01.mp4"
}
```

### 샷 02 — shot_2 (4s)

- **행동**: Introduce the protagonist into the sterile environment, emphasizing her isolation.
- **카메라(writer 산출)**: `{"type":"MFS","angle":"eye_level","movement":"static"}` · 구도: The girl as she enters the frame. · 무드: Maintain the cold dawn light, highlighting the pale blue of the dress.
- **특례**: 지난번 fal T2I에서 4회 연속 차단(422 content_policy_violation)돼 제외됐던 샷. 이번엔 edit 레인 + 참조로 재시도. 재차단 시 동일 입력 4회 재시도 후 Ⓑ 분류·제외(지난 규칙 유지).

**이미지 생성(i2i) 페이로드**

- 모델: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/02.png`
- 참조: **identity_ref** — 주인공이 화면에 등장("a young woman with a black bob entering"). **plate** — 민트 타일 화장실 공간이 배경 전체.
- 프롬프트 원문 (`image_prompt`, 무수정):

```
A medium full shot of a young woman with a black bob entering a mint-tiled restroom. She wears a pale blue satin slip dress and white socks. The lighting is hard and top-down, casting sharp shadows on the angular floor tiles. Her expression is calm and indifferent.
```

- 한국어 번역: 검은 단발머리의 젊은 여자가 민트 타일 화장실로 들어서는 미디엄 풀 샷. 그녀는 연한 파란색 새틴 슬립 드레스와 흰 양말을 착용하고 있다. 조명은 강하고 위에서 수직으로 내리꽂혀 각진 바닥 타일 위에 날카로운 그림자를 드리운다. 표정은 차분하고 무심하다.

**영상 생성 페이로드**

- task `i2v_se` · seconds `4` · aspect `16:9` · 입력 `arm-origin/frames/02.png` → 출력 `clips/arm-origin/02.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
The girl walks steadily across the tile floor toward the sinks.
```

- 한국어 번역: 소녀가 타일 바닥을 가로질러 세면대 쪽으로 일정한 걸음으로 걸어간다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_02",
  "task": "i2v_se",
  "prompt": "The girl walks steadily across the tile floor toward the sinks.",
  "image": "arm-origin/frames/02.png",
  "seconds": 4,
  "aspect": "16:9",
  "out": "clips/arm-origin/02.mp4"
}
```

### 샷 03 — shot_3 (7s)

- **행동**: Create suspense by showing the girl's ignorance of the ghostly whisper coming from below.
- **카메라(writer 산출)**: `{"type":"MCU","angle":"eye_level","movement":"static"}` · 구도: The girl's eyes in the mirror reflection. · 무드: Focus on the pink of the lip gloss and the pale blue of her dress reflection.

**이미지 생성(i2i) 페이로드**

- 모델: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/03.png`
- 참조: **identity_ref** — 거울에 비친 주인공 얼굴이 프레임 중심("the girl's reflection", 단발·초커). **plate** — 배경 반영에 민트 타일 벽이 보임.
- 프롬프트 원문 (`image_prompt`, 무수정):

```
A medium close-up of the girl's reflection in a rectangular mirror. She is applying pink lip gloss. Her black bob is neat, and she wears a silver choker. The background reflection shows the mint-tiled wall. The lighting is harsh, highlighting her pale skin and the satin texture of her dress.
```

- 한국어 번역: 직사각형 거울에 비친 소녀의 반영을 담은 미디엄 클로즈업. 그녀는 핑크색 립글로스를 바르고 있다. 검은 단발은 단정하고, 은색 초커를 착용하고 있다. 배경 반영에는 민트 타일 벽이 보인다. 조명은 거칠어 그녀의 창백한 피부와 드레스의 새틴 질감을 도드라지게 한다.

**영상 생성 페이로드**

- task `i2v_se` · seconds `7` · aspect `16:9` · 입력 `arm-origin/frames/03.png` → 출력 `clips/arm-origin/03.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
The girl slowly applies lip gloss to her lips while staring blankly at her reflection.
```

- 한국어 번역: 소녀가 자신의 반영을 멍하니 응시하며 천천히 입술에 립글로스를 바른다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_03",
  "task": "i2v_se",
  "prompt": "The girl slowly applies lip gloss to her lips while staring blankly at her reflection.",
  "image": "arm-origin/frames/03.png",
  "seconds": 7,
  "aspect": "16:9",
  "out": "clips/arm-origin/03.mp4"
}
```

### 샷 04 — shot_4 (3s)

- **행동**: Identify the source of the whisper, grounding the horror in a physical object.
- **카메라(writer 산출)**: `{"type":"ECU","angle":"high_angle","movement":"static"}` · 구도: The center of the drain hole. · 무드: High contrast between the bright sink and the absolute black of the drain.

**이미지 생성(i2i) 페이로드**

- 모델: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/04.png`
- 참조: **plate** — 인물 없음, 화장실 설비(세면볼·배수구) 클로즈업이므로 공간의 재질·색만 정박. identity_ref는 넣을 근거 없음.
- 프롬프트 원문 (`image_prompt`, 무수정):

```
An extreme close-up of a circular chrome sink drain set in an orange-tinted porcelain basin. The dark hole of the drain is at the center, appearing as an abyss. Harsh light reflects off the metallic rim, creating a stark contrast with the shadow inside.
```

- 한국어 번역: 주황빛이 도는 도기 세면볼에 박힌 원형 크롬 배수구의 익스트림 클로즈업. 배수구의 어두운 구멍이 화면 중앙에 있어 심연처럼 보인다. 강한 빛이 금속 테두리에 반사되어 내부의 그림자와 극명한 대비를 이룬다.

**영상 생성 페이로드**

- task `i2v_se` · seconds `3` · aspect `16:9` · 입력 `arm-origin/frames/04.png` → 출력 `clips/arm-origin/04.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
The camera remains perfectly still on the dark, yawning hole of the drain.
```

- 한국어 번역: 카메라는 어둡게 입을 벌린 배수구 구멍 위에 완벽하게 정지해 있다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_04",
  "task": "i2v_se",
  "prompt": "The camera remains perfectly still on the dark, yawning hole of the drain.",
  "image": "arm-origin/frames/04.png",
  "seconds": 3,
  "aspect": "16:9",
  "out": "clips/arm-origin/04.mp4"
}
```

### 샷 05 — shot_5 (4s)

- **행동**: Conclude the scene with the girl's unsettling normalcy, leaving the audience in dread.
- **카메라(writer 산출)**: `{"type":"MS","angle":"eye_level","movement":"static"}` · 구도: The girl's face. · 무드: A slightly colder, more clinical blue tone to end the scene.

**이미지 생성(i2i) 페이로드**

- 모델: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/05.png`
- 참조: **identity_ref** — 주인공이 프레임 중심("the girl", 드레스·헤어). **plate** — 민트 타일 화장실 공간이 배경.
- 프롬프트 원문 (`image_prompt`, 무수정):

```
A medium shot of the girl in the mint-tiled restroom. She has finished applying her lip gloss and is now calmly adjusting her hair in the mirror. Her expression is vacant and serene. The hard overhead light casts a cold glow over her pale blue satin dress.
```

- 한국어 번역: 민트 타일 화장실 안 소녀의 미디엄 샷. 립글로스를 다 바른 그녀가 이제 거울 앞에서 차분히 머리를 매만지고 있다. 표정은 공허하고 평온하다. 머리 위의 강한 조명이 연한 파란색 새틴 드레스 위로 차가운 빛을 드리운다.

**영상 생성 페이로드**

- task `i2v_se` · seconds `4` · aspect `16:9` · 입력 `arm-origin/frames/05.png` → 출력 `clips/arm-origin/05.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
The girl adjusts her hair with a blank expression before the scene fades.
```

- 한국어 번역: 장면이 어두워지기 전까지 소녀가 무표정하게 머리를 매만진다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_05",
  "task": "i2v_se",
  "prompt": "The girl adjusts her hair with a blank expression before the scene fades.",
  "image": "arm-origin/frames/05.png",
  "seconds": 4,
  "aspect": "16:9",
  "out": "clips/arm-origin/05.mp4"
}
```

### 샷 06 — shot_6 (4s)

- **행동**: Visualize the girl's sudden isolation and the eerie realization of an uncanny presence in the empty space.
- **카메라(writer 산출)**: `{"type":"MCU","angle":"eye_level","movement":"static"}` · 구도: The girl's eyes in the mirror reflection. · 무드: Cool dawn tones with a hint of retro pastel blue to enhance the quiet dread.

**이미지 생성(i2i) 페이로드**

- 모델: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/06.png`
- 참조: **identity_ref** — 거울 앞 주인공("a young woman with a sharp black bob"). **plate** — 배경에 빈 칸막이·타일 공간이 보임.
- 프롬프트 원문 (`image_prompt`, 무수정):

```
A medium close-up of a young woman with a sharp black bob, frozen in front of a rectangular mirror in a retro-noir restroom. She wears a pale blue satin slip dress. Her reflection shows a startled, still expression. In the background, empty ceramic stalls are bathed in soft, cool dawn light. The texture is painterly with subtle grime on the tiles. Palette of pale blue and soft pink.
```

- 한국어 번역: 레트로 누아르 화장실의 직사각형 거울 앞에 얼어붙은, 날렵한 검은 단발의 젊은 여자를 담은 미디엄 클로즈업. 연한 파란색 새틴 슬립 드레스를 입고 있다. 거울 속 반영에는 흠칫 놀라 굳은 표정이 보인다. 배경에는 텅 빈 도기 칸막이들이 부드럽고 차가운 새벽빛에 잠겨 있다. 질감은 회화적이며 타일에는 은은한 얼룩이 있다. 연한 파랑과 부드러운 핑크의 팔레트.

**영상 생성 페이로드**

- task `i2v_se` · seconds `4` · aspect `16:9` · 입력 `arm-origin/frames/06.png` → 출력 `clips/arm-origin/06.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
The girl remains completely frozen, her eyes subtly shifting to scan the reflection of the empty stalls.
```

- 한국어 번역: 소녀는 완전히 얼어붙은 채, 텅 빈 칸막이들의 반영을 살피듯 눈동자만 미세하게 움직인다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_06",
  "task": "i2v_se",
  "prompt": "The girl remains completely frozen, her eyes subtly shifting to scan the reflection of the empty stalls.",
  "image": "arm-origin/frames/06.png",
  "seconds": 4,
  "aspect": "16:9",
  "out": "clips/arm-origin/06.mp4"
}
```

### 샷 07 — shot_7 (3s)

- **행동**: Clearly identify the source of the whisper, transforming a vague feeling into a specific, localized threat.
- **카메라(writer 산출)**: `{"type":"ECU","angle":"high_angle","movement":"static"}` · 구도: The center of the drain grating. · 무드: High contrast to emphasize the darkness within the drain.

**이미지 생성(i2i) 페이로드**

- 모델: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/07.png`
- 참조: **plate** — 인물 없음, 바닥 배수구 그레이팅과 주변 타일뿐이므로 공간 재질·색만 정박.
- 프롬프트 원문 (`image_prompt`, 무수정):

```
An extreme close-up of an angular, geometric floor drain grating. Dark shadows lurk within the holes of the metal. The surrounding ceramic tiles are a muted pale blue with sharp edges. Soft, cool lighting emphasizes the metallic texture and the dark void beneath the grate.
```

- 한국어 번역: 각지고 기하학적인 바닥 배수구 그레이팅의 익스트림 클로즈업. 금속의 구멍들 안에 어두운 그림자가 도사리고 있다. 주변의 도기 타일은 채도 낮은 연한 파란색이며 모서리가 날카롭다. 부드럽고 차가운 조명이 금속 질감과 그레이팅 아래의 어두운 공동을 강조한다.

**영상 생성 페이로드**

- task `i2v_se` · seconds `3` · aspect `16:9` · 입력 `arm-origin/frames/07.png` → 출력 `clips/arm-origin/07.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
A static shot focusing on the dark void of the drain as the shadows within seem to pulse.
```

- 한국어 번역: 배수구의 어두운 공동에 고정된 정적 샷. 그 안의 그림자들이 맥동하는 듯 보인다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_07",
  "task": "i2v_se",
  "prompt": "A static shot focusing on the dark void of the drain as the shadows within seem to pulse.",
  "image": "arm-origin/frames/07.png",
  "seconds": 3,
  "aspect": "16:9",
  "out": "clips/arm-origin/07.mp4"
}
```

### 샷 08 — shot_8 (5s)

- **행동**: Escalate suspense by showing the character's fatal curiosity as she draws closer to the source of the voice.
- **카메라(writer 산출)**: `{"type":"CU","angle":"low_angle","movement":"dolly_in"}` · 구도: The girl's ear and her wide, anxious eye. · 무드: Deepen the cool blues while introducing a faint magenta glow in the shadows.

**이미지 생성(i2i) 페이로드**

- 모델: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/08.png`
- 참조: **identity_ref** — 주인공 얼굴 클로즈업("the girl's face", 초커·단발). **plate** — 배경에 화장실의 각진 선들이 보임.
- 프롬프트 원문 (`image_prompt`, 무수정):

```
A close-up of the girl's face, her expression one of intense focus and dread. She is positioned in the right third of the frame, leaning toward a porcelain sink. The background shows the angular lines of the restroom. Soft light hits the side of her face, highlighting her silver choker and black bob.
```

- 한국어 번역: 강렬한 집중과 공포가 담긴 표정의 소녀 얼굴 클로즈업. 그녀는 화면 오른쪽 3분의 1 지점에서 도기 세면대 쪽으로 몸을 기울이고 있다. 배경에는 화장실의 각진 선들이 보인다. 부드러운 빛이 얼굴 옆면에 닿아 은색 초커와 검은 단발을 도드라지게 한다.

**영상 생성 페이로드**

- task `i2v_se` · seconds `5` · aspect `16:9` · 입력 `arm-origin/frames/08.png` → 출력 `clips/arm-origin/08.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
The camera slowly dollys in as the girl leans her head down toward the sink, bringing her ear closer to the drain.
```

- 한국어 번역: 소녀가 세면대 쪽으로 고개를 숙여 귀를 배수구에 가까이 가져가는 동안 카메라가 천천히 달리 인 한다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_08",
  "task": "i2v_se",
  "prompt": "The camera slowly dollys in as the girl leans her head down toward the sink, bringing her ear closer to the drain.",
  "image": "arm-origin/frames/08.png",
  "seconds": 5,
  "aspect": "16:9",
  "out": "clips/arm-origin/08.mp4"
}
```

### 샷 09 — shot_9 (3s)

- **행동**: Capture the peak of the girl's curiosity and tension as she investigates the source of the sound.
- **카메라(writer 산출)**: `{"type":"MS","angle":"low_angle","movement":"handheld_drift"}` · 구도: The girl's hands near the pipes · 무드: Cold dawn blue tones with high contrast shadows.

**이미지 생성(i2i) 페이로드**

- 모델: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/09.png`
- 참조: **identity_ref** — 주인공 전신이 등장("a young woman with a black bob, wearing a pale blue satin slip dress"). **plate** — 세면대 하부·타일 등 화장실 공간이 보임.
- 프롬프트 원문 (`image_prompt`, 무수정):

```
A medium shot of a young woman with a black bob, wearing a pale blue satin slip dress, leaning down toward the dark plumbing under a rectangular porcelain sink. Retro-noir public restroom with angular steel blue tiles. Hard lighting from above creates sharp shadows. Painterly texture philosophy with subtle grime on the walls.
```

- 한국어 번역: 검은 단발에 연한 파란색 새틴 슬립 드레스를 입은 젊은 여자가 직사각형 도기 세면대 아래의 어두운 배관 쪽으로 몸을 숙이는 미디엄 샷. 각진 스틸블루 타일의 레트로 누아르 공중화장실. 위에서 내리꽂는 강한 조명이 날카로운 그림자를 만든다. 벽에 은은한 얼룩이 있는 회화적 질감 철학.

**영상 생성 페이로드**

- task `i2v_se` · seconds `3` · aspect `16:9` · 입력 `arm-origin/frames/09.png` → 출력 `clips/arm-origin/09.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
The girl leans deeper into the shadows while the camera drifts slightly forward.
```

- 한국어 번역: 카메라가 살짝 앞으로 흘러가는 동안 소녀는 그림자 속으로 더 깊이 몸을 기울인다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_09",
  "task": "i2v_se",
  "prompt": "The girl leans deeper into the shadows while the camera drifts slightly forward.",
  "image": "arm-origin/frames/09.png",
  "seconds": 3,
  "aspect": "16:9",
  "out": "clips/arm-origin/09.mp4"
}
```

### 샷 10 — shot_10 (2s)

- **행동**: Shock the audience with a sensory blackout and a brief flash of violence.
- **카메라(writer 산출)**: `{"type":"POV","angle":"eye_level","movement":"static"}` · 구도: The center of the frame · 무드: Pitch black interrupted by an aggressive, saturated magenta burst.

**이미지 생성(T2I) 페이로드 — 참조 없음**

- 모델: fal `openai/gpt-image-2` (T2I, edit 아님) · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/10.png`
- 참조: **없음** — 완전 암전 POV 샷. 프레임에 인물도 공간 표면도 없으므로(칠흑 + 희미한 금속 질감뿐) 정본과 대조할 시각 정보가 없고, 참조를 넣으면 오히려 암전을 깨뜨릴 위험이 있다. T2I 유지.
- 열린 결정: BASE 팔의 `frames/10.png`가 동일 프롬프트·동일 무참조 T2I로 이미 존재한다. 재사용하면 콜 1회 절약 + 조건 동일. 신규 생성 vs 재사용은 오너 결정 대기.
- 프롬프트 원문 (`image_prompt`, 무수정):

```
A POV shot in total darkness. The frame is pitch black with faint metallic textures. The atmosphere is heavy and silent before the scream. Retro-noir aesthetic with sharp-edged shadow logic.
```

- 한국어 번역: 완전한 어둠 속의 POV 샷. 프레임은 희미한 금속 질감만 남긴 채 칠흑같이 어둡다. 비명 직전의 무겁고 고요한 공기. 날카로운 모서리의 그림자 논리를 지닌 레트로 누아르 미학.

**영상 생성 페이로드**

- task `i2v_se` · seconds `2` · aspect `16:9` · 입력 `arm-origin/frames/10.png` → 출력 `clips/arm-origin/10.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
A sharp magenta flash bursts across the screen then fades into darkness.
```

- 한국어 번역: 선명한 마젠타 섬광이 화면을 가로질러 터진 뒤 어둠 속으로 사라진다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_10",
  "task": "i2v_se",
  "prompt": "A sharp magenta flash bursts across the screen then fades into darkness.",
  "image": "arm-origin/frames/10.png",
  "seconds": 2,
  "aspect": "16:9",
  "out": "clips/arm-origin/10.mp4"
}
```

### 샷 11 — shot_11 (4s)

- **행동**: Establish the uncanny presence of the doppelganger and the girl's defeat.
- **카메라(writer 산출)**: `{"type":"WS","angle":"high_angle","movement":"handheld_drift"}` · 구도: The doppelganger's standing figure · 무드: Desaturated, clinical dawn light with deep blue shadows.

**이미지 생성(i2i) 페이로드**

- 모델: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/11.png`
- 참조: **identity_ref** — 인물 2명(쓰러진 소녀 + 도플갱어)이 모두 동일 인물이므로 정본 1장이 둘 다 커버(BKM 팔 2인 샷 전례와 동일 처리). **plate** — 하이앵글 와이드로 화장실 공간 전체가 보임.
- 프롬프트 원문 (`image_prompt`, 무수정):

```
A high-angle wide shot of a public restroom with angular ceramic tiles. A girl in a pale blue satin slip dress lies unconscious on the floor. Standing over her is an identical doppelganger in the same dress and black bob. The lighting is cold dawn blue, casting long, hard shadows. Retro-noir painterly texture.
```

- 한국어 번역: 각진 도기 타일 공중화장실의 하이앵글 와이드 샷. 연한 파란색 새틴 슬립 드레스의 소녀가 의식을 잃은 채 바닥에 누워 있다. 그 위에는 같은 드레스와 검은 단발의 똑같이 생긴 도플갱어가 서 있다. 조명은 차가운 새벽 파랑으로 길고 단단한 그림자를 드리운다. 레트로 누아르 회화적 질감.

**영상 생성 페이로드**

- task `i2v_se` · seconds `4` · aspect `16:9` · 입력 `arm-origin/frames/11.png` → 출력 `clips/arm-origin/11.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
The doppelganger stands perfectly still while the camera breathes with a handheld drift.
```

- 한국어 번역: 카메라가 핸드헬드 드리프트로 숨 쉬는 동안 도플갱어는 완벽하게 정지해 서 있다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_11",
  "task": "i2v_se",
  "prompt": "The doppelganger stands perfectly still while the camera breathes with a handheld drift.",
  "image": "arm-origin/frames/11.png",
  "seconds": 4,
  "aspect": "16:9",
  "out": "clips/arm-origin/11.mp4"
}
```

### 샷 12 — shot_12 (5s)

- **행동**: Demonstrate the doppelganger's cold, mechanical efficiency in disposing of the original.
- **카메라(writer 산출)**: `{"type":"MFS","angle":"eye_level","movement":"handheld_drift"}` · 구도: The doppelganger's hand on the girl's arm · 무드: Clinical, muted tones to match the emotionless action.

**이미지 생성(i2i) 페이로드**

- 모델: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/12.png`
- 참조: **identity_ref** — 동일 인물 2명(끌고 가는 도플갱어 + 끌려가는 소녀), 정본 1장이 둘 다 커버. **plate** — 배경에 각진 화장실 칸막이가 보임.
- 프롬프트 원문 (`image_prompt`, 무수정):

```
A medium full shot of the doppelganger dragging the unconscious girl by the arm across a geometric tile floor. Both wear pale blue satin dresses and black bobs. The background features angular bathroom stalls in a retro-noir style. Harsh, cold lighting from the side creates deep shadows.
```

- 한국어 번역: 도플갱어가 의식 잃은 소녀의 팔을 잡고 기하학적 타일 바닥을 가로질러 끌고 가는 미디엄 풀 샷. 둘 다 연한 파란색 새틴 드레스에 검은 단발이다. 배경에는 레트로 누아르 스타일의 각진 화장실 칸막이들이 있다. 옆에서 비추는 거칠고 차가운 조명이 짙은 그림자를 만든다.

**영상 생성 페이로드**

- task `i2v_se` · seconds `5` · aspect `16:9` · 입력 `arm-origin/frames/12.png` → 출력 `clips/arm-origin/12.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
The doppelganger slowly drags the limp body across the floor toward the left.
```

- 한국어 번역: 도플갱어가 축 늘어진 몸을 바닥 위로 천천히 왼쪽을 향해 끌고 간다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_12",
  "task": "i2v_se",
  "prompt": "The doppelganger slowly drags the limp body across the floor toward the left.",
  "image": "arm-origin/frames/12.png",
  "seconds": 5,
  "aspect": "16:9",
  "out": "clips/arm-origin/12.mp4"
}
```

### 샷 13 — shot_13 (4s)

- **행동**: Final reveal of the doppelganger's perfect, terrifying lack of emotion.
- **카메라(writer 산출)**: `{"type":"CU","angle":"eye_level","movement":"handheld_drift"}` · 구도: Doppelganger's eyes · 무드: High contrast, emphasizing the pale skin and dark hair.

**이미지 생성(i2i) 페이로드**

- 모델: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/13.png`
- 참조: **identity_ref만** — 얼굴 익스트림 클로즈업(단발·초커·드레스 어깨선). image_prompt에 화장실 표면이 전혀 등장하지 않으므로 plate는 넣을 근거 없음.
- 프롬프트 원문 (`image_prompt`, 무수정):

```
An extreme close-up of the doppelganger’s face. She has a black bob and wears a silver charm choker. Her expression is completely blank and emotionless, staring directly into the lens. Hard lighting highlights the angular jaw and the pale blue satin of her dress. Retro-noir painterly style.
```

- 한국어 번역: 도플갱어 얼굴의 익스트림 클로즈업. 검은 단발에 은색 참 초커를 착용하고 있다. 표정은 완전히 공허하고 무감정하며, 렌즈를 정면으로 응시하고 있다. 강한 조명이 각진 턱선과 드레스의 연한 파란색 새틴을 강조한다. 레트로 누아르 회화 스타일.

**영상 생성 페이로드**

- task `i2v_se` · seconds `4` · aspect `16:9` · 입력 `arm-origin/frames/13.png` → 출력 `clips/arm-origin/13.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
The doppelganger stares into the camera with absolute stillness and no blinking.
```

- 한국어 번역: 도플갱어가 눈 한 번 깜빡이지 않는 절대적인 정지 상태로 카메라를 응시한다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_13",
  "task": "i2v_se",
  "prompt": "The doppelganger stares into the camera with absolute stillness and no blinking.",
  "image": "arm-origin/frames/13.png",
  "seconds": 4,
  "aspect": "16:9",
  "out": "clips/arm-origin/13.mp4"
}
```

### 샷 14 — shot_14 (3s)

- **행동**: To emphasize the physical weight and total lack of life in the victim's body through a grounding floor-level perspective.
- **카메라(writer 산출)**: `{"type":"FS","angle":"low_angle","movement":"handheld_drift"}` · 구도: The point of contact between the girl's shoulder and the floor. · 무드: Cold, clinical dawn light with harsh magenta shadows in the corners.

**이미지 생성(i2i) 페이로드**

- 모델: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/14.png`
- 참조: **identity_ref** — 동일 인물 2명(내려놓는 도플갱어 + 축 늘어진 소녀). **plate** — 바닥 타일 등 화장실 공간이 보임.
- 프롬프트 원문 (`image_prompt`, 무수정):

```
Low angle floor level shot in a retro-noir restroom. A doppelganger in a pale blue satin slip dress is laying a limp, identical girl onto cold, angular pink ceramic tiles. The lighting is harsh and clinical 6500K. Painterly textures of water stains and grime on the floor. 50mm lens, sharp focus on the contact point.
```

- 한국어 번역: 레트로 누아르 화장실의 로우앵글 바닥 높이 샷. 연한 파란색 새틴 슬립 드레스의 도플갱어가 자신과 똑같이 생긴 축 늘어진 소녀를 차갑고 각진 핑크 도기 타일 위에 내려놓고 있다. 조명은 거칠고 임상적인 6500K. 바닥에는 물때와 얼룩의 회화적 질감. 50mm 렌즈, 접촉 지점에 선명한 초점.

**영상 생성 페이로드**

- task `i2v_se` · seconds `3` · aspect `16:9` · 입력 `arm-origin/frames/14.png` → 출력 `clips/arm-origin/14.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
The doppelganger slowly lowers the limp body of the girl onto the tiles with a heavy, physical weight.
```

- 한국어 번역: 도플갱어가 묵직한 물리적 무게감으로 소녀의 축 늘어진 몸을 타일 위에 천천히 내려놓는다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_14",
  "task": "i2v_se",
  "prompt": "The doppelganger slowly lowers the limp body of the girl onto the tiles with a heavy, physical weight.",
  "image": "arm-origin/frames/14.png",
  "seconds": 3,
  "aspect": "16:9",
  "out": "clips/arm-origin/14.mp4"
}
```

### 샷 15 — shot_15 (2s)

- **행동**: Highlight the uncanny and fetishistic detachment of the antagonist through a close-up of a stolen personal item.
- **카메라(writer 산출)**: `{"type":"ECU","angle":"eye_level","movement":"handheld_drift"}` · 구도: The angular toe of the black Mary Jane heel. · 무드: High contrast with magenta highlights reflecting off the black leather.

**이미지 생성(i2i) 페이로드**

- 모델: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/15.png`
- 참조: **identity_ref만** — 신체 일부(창백한 손)가 등장하므로 인물 참조 규칙 적용. 배경은 흐릿한 새틴뿐이고 image_prompt에 화장실 표면이 없으므로 plate는 넣을 근거 없음.
- 프롬프트 원문 (`image_prompt`, 무수정):

```
Extreme close-up of a pale hand holding a black patent leather Mary Jane heel with an angular toe. Harsh fluorescent light creates sharp highlights on the leather. The background is a blurred pale blue satin. Retro-pastel noir aesthetic with painterly textures.
```

- 한국어 번역: 각진 앞코의 검은 페이턴트 가죽 메리제인 힐을 쥔 창백한 손의 익스트림 클로즈업. 강한 형광등 빛이 가죽 위에 날카로운 하이라이트를 만든다. 배경은 흐릿하게 처리된 연한 파란색 새틴이다. 회화적 질감의 레트로 파스텔 누아르 미학.

**영상 생성 페이로드**

- task `i2v_se` · seconds `2` · aspect `16:9` · 입력 `arm-origin/frames/15.png` → 출력 `clips/arm-origin/15.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
The hand subtly tightens its grip on the shoe while the camera drifts slightly forward.
```

- 한국어 번역: 카메라가 살짝 앞으로 흘러가는 동안 손이 구두를 쥔 힘을 미묘하게 조인다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_15",
  "task": "i2v_se",
  "prompt": "The hand subtly tightens its grip on the shoe while the camera drifts slightly forward.",
  "image": "arm-origin/frames/15.png",
  "seconds": 2,
  "aspect": "16:9",
  "out": "clips/arm-origin/15.mp4"
}
```

### 샷 16 — shot_16 (4s)

- **행동**: To build dread through a prolonged moment of unnatural stillness and psychological void.
- **카메라(writer 산출)**: `{"type":"MS","angle":"eye_level","movement":"handheld_drift"}` · 구도: The doppelganger's eyes. · 무드: Desaturated blues and pinks with deep, oppressive shadows.

**이미지 생성(i2i) 페이로드**

- 모델: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/16.png`
- 참조: **identity_ref** — 도플갱어가 프레임 중심(드레스·표정). **plate** — 화장실 칸 내부(변기·각진 타일)가 보임.
- 프롬프트 원문 (`image_prompt`, 무수정):

```
Medium shot of the doppelganger sitting motionless on a closed toilet lid in a dim restroom stall. She wears a pale blue satin slip dress and has a vacant expression. Harsh top-down lighting creates deep shadows under her eyes. Retro-noir style with angular tiles in the background.
```

- 한국어 번역: 어둑한 화장실 칸 안, 닫힌 변기 뚜껑 위에 미동 없이 앉아 있는 도플갱어의 미디엄 샷. 연한 파란색 새틴 슬립 드레스를 입고 공허한 표정을 짓고 있다. 위에서 내리꽂는 강한 조명이 눈 밑에 깊은 그림자를 만든다. 배경에 각진 타일이 있는 레트로 누아르 스타일.

**영상 생성 페이로드**

- task `i2v_se` · seconds `4` · aspect `16:9` · 입력 `arm-origin/frames/16.png` → 출력 `clips/arm-origin/16.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
The doppelganger remains unnervingly still, staring blankly as the camera drifts with a subtle handheld breathing.
```

- 한국어 번역: 카메라가 미세한 핸드헬드 호흡으로 흘러가는 동안 도플갱어는 섬뜩하리만치 미동도 없이 멍하니 응시한다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_16",
  "task": "i2v_se",
  "prompt": "The doppelganger remains unnervingly still, staring blankly as the camera drifts with a subtle handheld breathing.",
  "image": "arm-origin/frames/16.png",
  "seconds": 4,
  "aspect": "16:9",
  "out": "clips/arm-origin/16.mp4"
}
```

### 샷 17 — shot_17 (3s)

- **행동**: To signify the completion of the 'replacement' and the abandonment of the original girl.
- **카메라(writer 산출)**: `{"type":"MFS","angle":"eye_level","movement":"tracking"}` · 구도: The doppelganger's back as she walks away. · 무드: Cold blue dominance with a final flash of magenta from the overhead lights.

**이미지 생성(i2i) 페이로드**

- 모델: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/17.png`
- 참조: **identity_ref** — 도플갱어 전신(드레스·흰 양말). **plate** — 칸막이·타일 바닥 등 화장실 공간이 보임.
- 프롬프트 원문 (`image_prompt`, 무수정):

```
Medium full shot in a retro-noir restroom. The doppelganger stands up from the toilet and walks out of the stall. She is wearing a pale blue satin dress and white socks. The stall door swings slowly. Harsh lighting creates long shadows on the angular tiled floor. 50mm lens.
```

- 한국어 번역: 레트로 누아르 화장실의 미디엄 풀 샷. 도플갱어가 변기에서 일어나 칸 밖으로 걸어 나온다. 연한 파란색 새틴 드레스와 흰 양말 차림이다. 칸막이 문이 천천히 흔들린다. 강한 조명이 각진 타일 바닥에 긴 그림자를 만든다. 50mm 렌즈.

**영상 생성 페이로드**

- task `i2v_se` · seconds `3` · aspect `16:9` · 입력 `arm-origin/frames/17.png` → 출력 `clips/arm-origin/17.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
The doppelganger walks away with a cold, steady pace as the stall door swings shut behind her.
```

- 한국어 번역: 도플갱어가 차갑고 일정한 걸음으로 걸어 나가고, 그 뒤로 칸막이 문이 흔들리며 닫힌다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_17",
  "task": "i2v_se",
  "prompt": "The doppelganger walks away with a cold, steady pace as the stall door swings shut behind her.",
  "image": "arm-origin/frames/17.png",
  "seconds": 3,
  "aspect": "16:9",
  "out": "clips/arm-origin/17.mp4"
}
```

### 샷 18 — shot_18 (2.5s)

- **행동**: To convey a sense of uncanny detachment by showing the doppelganger's mechanical and indifferent movement as she replaces the original girl.
- **카메라(writer 산출)**: `{"type":"MS","angle":"eye_level","movement":"static"}` · 구도: The doppelganger's face · 무드: Cool and clinical, emphasizing the pale blue tones to match the dawn light.

**이미지 생성(i2i) 페이로드**

- 모델: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/18.png`
- 참조: **identity_ref** — 도플갱어가 프레임 중심("a girl with a black bob and pale blue satin slip dress"). **plate** — 거울·각진 타일 벽 등 화장실 공간이 보임.
- 프롬프트 원문 (`image_prompt`, 무수정):

```
Medium shot in a retro-noir restroom. The doppelganger, a girl with a black bob and pale blue satin slip dress, walks past a sharp-edged rectangular mirror. Her expression is perfectly void of emotion. The walls are covered in angular ceramic tiles with subtle painterly grime. Soft 6500K light from above creates a cool, clinical atmosphere. Palette of pale blue and soft pink dominates.
```

- 한국어 번역: 레트로 누아르 화장실의 미디엄 샷. 검은 단발에 연한 파란색 새틴 슬립 드레스를 입은 소녀인 도플갱어가 날카로운 모서리의 직사각형 거울 앞을 지나 걸어간다. 표정은 완벽하게 감정이 비어 있다. 벽은 은은한 회화적 얼룩이 있는 각진 도기 타일로 덮여 있다. 위에서 비추는 부드러운 6500K 빛이 차갑고 임상적인 분위기를 만든다. 연한 파랑과 부드러운 핑크의 팔레트가 지배적이다.

**영상 생성 페이로드**

- task `i2v_se` · seconds `2.5` · aspect `16:9` · 입력 `arm-origin/frames/18.png` → 출력 `clips/arm-origin/18.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
The doppelganger walks steadily across the frame with mechanical indifference, exiting the shot.
```

- 한국어 번역: 도플갱어가 기계적인 무심함으로 화면을 가로질러 일정하게 걸어가 프레임 밖으로 나간다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_18",
  "task": "i2v_se",
  "prompt": "The doppelganger walks steadily across the frame with mechanical indifference, exiting the shot.",
  "image": "arm-origin/frames/18.png",
  "seconds": 2.5,
  "aspect": "16:9",
  "out": "clips/arm-origin/18.mp4"
}
```

### 샷 19 — shot_19 (2.5s)

- **행동**: To create a vacuum of sound and presence, heightening the dread through the sudden emptiness of the space.
- **카메라(writer 산출)**: `{"type":"WS","angle":"eye_level","movement":"static"}` · 구도: The closing door · 무드: Desaturated and hollow, emphasizing the lack of life in the room.

**이미지 생성(i2i) 페이로드**

- 모델: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/19.png`
- 참조: **plate** — 인물 없는 빈 화장실 와이드(닫히는 문만). 공간이 프레임 전체이므로 플레이트만.
- 프롬프트 원문 (`image_prompt`, 무수정):

```
Wide shot of the empty, angular restroom. A heavy door is in the process of swinging shut. The space is filled with hollow silence and sharp shadows. Porcelain sinks and silver soap dispensers reflect the cool dawn light. The color temperature is slightly warmer at 6000K. The floor tiles are wet with a painterly texture.
```

- 한국어 번역: 텅 빈 각진 화장실의 와이드 샷. 묵직한 문이 닫히는 중이다. 공간은 공허한 정적과 날카로운 그림자로 가득하다. 도기 세면대와 은색 비누 디스펜서가 차가운 새벽빛을 반사한다. 색온도는 6000K로 약간 더 따뜻하다. 바닥 타일은 회화적 질감으로 젖어 있다.

**영상 생성 페이로드**

- task `i2v_se` · seconds `2.5` · aspect `16:9` · 입력 `arm-origin/frames/19.png` → 출력 `clips/arm-origin/19.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
The restroom door swings shut slowly, clicking into place, leaving the room completely still.
```

- 한국어 번역: 화장실 문이 천천히 닫히며 딸깍 잠기고, 방은 완전한 정적에 잠긴다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_19",
  "task": "i2v_se",
  "prompt": "The restroom door swings shut slowly, clicking into place, leaving the room completely still.",
  "image": "arm-origin/frames/19.png",
  "seconds": 2.5,
  "aspect": "16:9",
  "out": "clips/arm-origin/19.mp4"
}
```

### 샷 20 — shot_20 (4s)

- **행동**: To deliver the final chilling revelation that the original girl is still there, discarded and forgotten.
- **카메라(writer 산출)**: `{"type":"CU","angle":"low_angle","movement":"dolly_in"}` · 구도: The white crew socks and black Mary Jane heels · 무드: The warmest but most ominous tone, with deep shadows creeping from the stall.

**이미지 생성(i2i) 페이로드**

- 모델: fal `openai/gpt-image-2/edit` · `image_size: landscape_16_9` · 출력: `assets/arm-origin/frames/20.png`
- 참조: **plate** — image_prompt에는 칸막이 문 아래 틈과 타일 바닥만 있고 인물·신체 요소가 없으므로 플레이트만. 구도(composition) 필드는 양말·구두를 지목하지만 발이 드러나는 것은 video_prompt(달리 인 후반)의 일이고, 시작 프레임의 측정 대상은 image_prompt다. 인물 없는 프롬프트에 identity_ref를 붙이면 모델이 인물을 지어 넣을 위험이 있어 배제. (이 판단은 오너 확인 포인트 — 아래 §5 열린 결정 참조)
- 프롬프트 원문 (`image_prompt`, 무수정):

```
Close-up, low-angle shot focusing on the narrow gap beneath a bathroom stall door. The floor is tiled in a geometric pattern with a subtle pinkish hue. The lighting is soft and dim at 5600K, casting long shadows. The edges of the stall door are sharp and clean. The atmosphere is thick with dread.
```

- 한국어 번역: 화장실 칸막이 문 아래의 좁은 틈에 초점을 맞춘 로우앵글 클로즈업. 바닥은 은은한 분홍빛이 도는 기하학적 패턴의 타일이다. 조명은 5600K로 부드럽고 어둑하며 긴 그림자를 드리운다. 칸막이 문의 모서리는 날카롭고 깔끔하다. 공기는 공포로 짙게 가라앉아 있다.

**영상 생성 페이로드**

- task `i2v_se` · seconds `4` · aspect `16:9` · 입력 `arm-origin/frames/20.png` → 출력 `clips/arm-origin/20.mp4`
- 모션 프롬프트 원문 (`video_prompt`, 무수정):

```
The camera slowly dollies forward toward the stall gap, revealing the motionless white-socked feet of the original girl.
```

- 한국어 번역: 카메라가 칸막이 아래 틈을 향해 천천히 달리 인 하며, 미동 없는 원래 소녀의 흰 양말 신은 발을 드러낸다.

**jobs.origin.json 조각**

```json
{
  "id": "origin_20",
  "task": "i2v_se",
  "prompt": "The camera slowly dollies forward toward the stall gap, revealing the motionless white-socked feet of the original girl.",
  "image": "arm-origin/frames/20.png",
  "seconds": 4,
  "aspect": "16:9",
  "out": "clips/arm-origin/20.mp4"
}
```

---

## 4. 실행 스펙

### 4-1. jobs.origin.json 스키마

실험 루트의 `jobs.origin.json`은 위 20개 조각의 배열이다(전례: [../2026-07-23_full-copy-bundle/jobs.base.json](../2026-07-23_full-copy-bundle/jobs.base.json)). 필드:

| 필드 | 값 | 설명 |
|---|---|---|
| `id` | `origin_01` ~ `origin_20` | 팔 접두사 + 샷 번호 |
| `task` | `"i2v_se"` | 시작 프레임 I2V. `end_image` 미지정 = 끝 프레임 없음 |
| `prompt` | video_prompt 원문 | shots.json에서 무수정 복사 |
| `image` | `arm-origin/frames/NN.png` | `--assets` 디렉토리 기준 상대경로 |
| `seconds` | `duration_seconds` 그대로 | 2 ~ 7 (아래 클램프 주의 참조) |
| `aspect` | `"16:9"` | 전 샷 공통 |
| `out` | `clips/arm-origin/NN.mp4` | `--assets` 디렉토리 기준 상대경로 |

seconds 클램프 주의: 힉스필드 레인 디스패처(`utils/tools/gen/providers/higgsfield.mjs`)는 `i2v_se`에서 duration을 `min 4 · max 15 · 반올림`으로 클램프한다. 즉 4초 미만 9개 샷(04·07·09·10·14·15·17·18·19)은 실제로 4초 클립으로 돌아온다. 이는 BASE 팔(19/19 완주)과 동일한 처리라 팔 간 비교에는 영향이 없고, 편집 없음 원칙에 따라 반환 길이 그대로 이어붙인다.

### 4-2. i2i 스테이징 도구 — tools/stage_origin.mjs (신규, 설계도에는 사양만)

[stage_bkm.mjs](../2026-07-23_full-copy-bundle/tools/stage_bkm.mjs) 패턴을 따르는 신규 도구. 이 문서 승인 후 구현한다.

- 입력: `../2026-07-23_full-copy-bundle/assets/arm-base/shots.json` + 본 문서 §3의 샷별 참조 테이블(코드 내 상수로 고정)
- 모델: fal `openai/gpt-image-2/edit` (shot_10만 `openai/gpt-image-2` T2I) · `image_size: landscape_16_9`
- 프롬프트: `image_prompt` 원문 그대로 전달. 래퍼 문장·참조 설명문 추가 금지(stage_bkm은 자체 프롬프트를 합성했지만, ORIGIN은 제품 프롬프트가 측정 대상이라 무수정이 원칙)
- 참조 업로드: `fal.storage.upload` 1회 업로드 후 URL 캐시(state 파일에 기록, stage_bkm 방식)
- resume: `assets/origin_state.json` — 샷별 성공 URL·실패 사유 기록, 재실행 시 성공분 스킵
- 재시도: 콘텐츠 차단(422 content_policy_violation)은 동일 입력 최대 4회, 그 외 오류는 2회. 4회 차단 시 Ⓑ 분류·해당 샷 제외 후 계속
- 콜 상한: 40 (기본 20콜 + 재시도·QC 재생성 여유)
- FAL_KEY: stage_bkm과 동일하게 `.env.local`에서 로드
- 산출: `assets/arm-origin/frames/NN.png` 20장 + `jobs.origin.json` (Ⓑ 제외분 반영)

### 4-3. 영상 디스패치 커맨드

프레임 20장이 QC 게이트(§5)를 통과한 뒤 발사:

```bash
node research/experiments/utils/tools/gen/dispatch.mjs \
  --jobs research/experiments/continuity-copy/2026-07-24_full-copy-v2/jobs.origin.json \
  --assets research/experiments/continuity-copy/2026-07-24_full-copy-v2/assets \
  --mode higgsfield --hf-concurrency 4 --hf-cap 80
```

### 4-4. 예산 추정

| 항목 | 추정 | 근거 |
|---|---|---|
| 영상 (힉스필드) | 74초 × 4.6크레딧/초 ≈ **340크레딧** | 총 duration_seconds 74초 기준 |
| 영상 상한 (클램프 반영) | 최대 86초 ≈ **396크레딧** | 4초 미만 9개 샷이 4초로 클램프될 경우의 생성 초수 상한 |
| 이미지 (fal, 별도 과금) | **20콜 + 재시도 여유** (상한 40콜) | i2i 19 + T2I 1, shot_2 최대 4회 재시도 + QC 재생성 여유 |

---

## 5. QC 게이트 — 발사 전 프레임 검수

영상 디스패치 전, 프레임 20장 전수 검수. 4항목:

1. **신원 정본 대조** — 인물 등장 샷(14개)의 얼굴·검은 단발·은색 초커·연파랑 새틴 드레스·흰 양말을 identity_ref와 대조. 2인 샷(11·12·14)은 두 인물 모두.
2. **시선 방향** — composition·character_action이 지정한 응시 방향(거울 응시, 렌즈 정면 응시, 배수구 하향 등)과 프레임의 실제 시선 일치 여부.
3. **소품 접촉** — 립글로스·메리제인 힐·팔 붙잡기 등 프롬프트가 명시한 손·신체와 소품의 접촉 상태가 프레임에서 성립하는지.
4. **구도** — camera(type·angle)와 composition 필드 대비 실제 프레임 구도(WS/MS/CU/ECU 스케일, 하이/로우 앵글, 프레임 내 배치) 일치 여부.

### ORIGIN 팔의 QC 원칙 (측정 오염 방지)

ORIGIN은 "제품 자생" 실력 측정이다. 따라서 QC 탈락 시 허용되는 조치는 **동일 입력(같은 프롬프트 + 같은 참조) 재생성뿐이다.** 프롬프트 수기 보정·참조 추가/교체·수동 리터치는 전면 금지 — 사람 손이 한 번이라도 들어가면 측정 대상이 "제품"에서 "제품+사람"으로 바뀌어 측정이 오염된다. 재생성 반복 후에도 탈락이면 마지막 산출을 그대로 쓰고 결함을 결과 문서에 기록한다 — 제품의 실패도 이 팔에서는 데이터다.

---

## 열린 결정 (오너 확인 대기)

1. **shot_10 프레임**: 신규 T2I 생성 vs BASE 팔 `frames/10.png` 재사용(동일 프롬프트·동일 무참조 조건, 콜 1회 절약). — §3 샷 10 참조
2. **shot_20 참조 선정**: image_prompt 기준으로 plate만 채택(인물 요소 없음). composition 필드가 양말·구두를 지목하는 것과 어긋나 보일 수 있어 확인 요청. — §3 샷 20 참조
3. **QC 재생성 상한**: 샷당 재생성 횟수 상한(제안: 2회, 콜 상한 40 내). 초과 시 마지막 산출 채택 + 결함 기록.
