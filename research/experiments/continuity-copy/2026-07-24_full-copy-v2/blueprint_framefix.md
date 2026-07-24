# FRAMEFIX 팔 설계도 — 시작+끝 프레임 한 쌍으로 못박는 I2V (full-copy v2)

한 줄 요약: ORIGIN 팔과 1·2단계(writer 산출·시작 프레임)를 완전히 공유하되, 샷마다 **끝 프레임을 i2i로 한 장 더 만들어** 영상 모델(Seedance 2.0)에 시작+끝을 둘 다 못박는 "제품 업그레이드 가설" 팔.

- **상태: 오너 확인 대기** (이 문서의 페이로드로 생성 착수하기 전 오너 컨펌 필요 — 유료 호출 없음, 문서만 작성된 상태)
- 작성일: 2026-07-24
- 상위 설계: [design.md](design.md)
- **실행 의존성: ORIGIN 팔의 시작 프레임 스테이징이 먼저 끝나야 한다.** 이 팔의 시작 프레임은 `assets/arm-origin/frames/NN.png`를 그대로 공유하며(재생성 금지), ORIGIN 설계도가 해당 파일의 정의·QC를 담당한다. ORIGIN 프레임 20장이 QC를 통과하기 전에는 이 팔의 어떤 생성도 시작하지 않는다.

---

## 1. 개요 — 의도 / 가설 / 왜

### 배경

어제 실험(`../2026-07-23_full-copy-bundle/`)의 BASE 팔이 무효 판정됐다. 제품 writer 샷 이미지에 정본 i2i 배선이 끊겨, 캐릭터·공간 정본 없이 순수 T2I 쓰레기 입력이 영상 모델로 들어갔기 때문이다. 재설계에서 팔 3개를 다시 돌린다:

| 팔 | 정의 | 설계도 |
|---|---|---|
| ORIGIN | 정본 i2i 배선을 복원한 현행 제품 — 시작 프레임 1장 + writer 모션 프롬프트 | (별도 문서) |
| **FRAMEFIX (이 문서)** | ORIGIN과 1·2단계 동일 + **끝 프레임 한 장 추가** → 영상 모델에 시작·끝 둘 다 고정 | 이 문서 |
| BKM2 | 원본 분석 기반 사람 고점 | (별도 문서) |

### 가설 (사전 고정)

> 시작+끝 프레임을 모두 고정하면, ORIGIN(시작 프레임만) 대비 샷 내부의 **카메라 폭주·동작 이탈이 줄어든다.**

선행 입력 포맷 실험(`../2026-07-23_input-format/`)에서 "그림 못박기 = 카메라 통제" 가설이 한 번 기각된 바 있다. 다만 그때는 사건 맥락·정본 앵커가 없는 조건이었다. 이번에는 **정본 i2i 프레임 위에서** 같은 가설을 재검증한다.

### 유일 변수

이 팔의 유일 변수는 ORIGIN 대비 **끝 프레임 추가**다. 그 외는 전부 ORIGIN과 동일해야 비교가 성립한다:

- 시작 프레임: ORIGIN과 **같은 파일** (`arm-origin/frames/NN.png` 공유, 재생성 없음)
- 모션 프롬프트: shots.json `video_prompt` **원문 그대로** (ORIGIN과 바이트 동일 문자열)
- 모델: Seedance 2.0 · 레인: 힉스필드 · task: `i2v_se` · seconds: `duration_seconds` 그대로
- 편집: 없음 (생성 순서·길이 그대로 이어붙임 — ORIGIN과 동일)

### 오염 금지 규약 (이 팔의 타당성 조건)

이 팔은 "제품이 스스로 할 수 있는 업그레이드"를 재는 팔이다. 따라서 이 설계도의 저작과 이후 실행 전 과정에서 **원본 영상 분석 자료를 절대 참조하지 않는다**: `conti_full.md`, `takes.json`, `assets/conti/`, `arm-bkm/` 폴더 열람 금지. 끝 상태 문장의 유일한 재료는 shots.json의 `video_prompt`·`character_action`·`camera`·`composition` 4개 필드다. (원본을 본 사람의 지식이 새면 이 팔은 BKM과 구분이 안 된다.) `jobs.bkm.json`은 잡 파일 **스키마(필드 구성)** 확인 목적으로만 참조했고, 그 안의 프롬프트 내용은 일절 차용하지 않았다.

---

## 2. 공통 재료

### 2-1. writer 산출 (재사용, 재실행 없음)

- 소스: `../2026-07-23_full-copy-bundle/assets/arm-base/shots.json` (project `2026-07-23_14-25-51_bzb8`, 20샷, 총 74초, 16:9)
- writer는 다시 돌리지 않는다. 아래 샷별 설계의 행동·카메라·구도·무드·프롬프트는 전부 이 파일 원문 복사다.

### 2-2. 시작 프레임 공유 규약

- 경로: `assets/arm-origin/frames/01.png` ~ `20.png` (assets 기준 상대경로 `arm-origin/frames/NN.png`)
- 소유권: **ORIGIN 설계도가 정의·생성·QC** — 이 팔은 읽기 전용으로 참조만 하고 절대 재생성하지 않는다. 파일을 공유하는 것 자체가 통제 변인이다(시작 프레임이 다르면 끝 프레임 효과와 분리 불가).
- 게이트: ORIGIN 프레임 20장 스테이징+QC 완료 전 이 팔 착수 금지.

### 2-3. 모델·레인

| 단계 | 모델 | 레인 | 디스패처 task |
|---|---|---|---|
| 끝 프레임 i2i | `openai/gpt-image-2/edit` | fal (`--mode fal`) | `edit` |
| 영상 | Seedance 2.0 (`seedance_2_0`, 720p) | 힉스필드 (`--mode higgsfield`) | `i2v_se` |

- `i2v_se`는 공용 디스패처(`research/experiments/utils/tools/gen/`)에 이미 매핑돼 있다: 힉스필드 `seedance_2_0`은 start_image/end_image 지원, seed 없음, duration 정수·최소 4초.
- seconds는 jobs 파일에 `duration_seconds` **그대로** 적는다. 디스패처가 i2v_se를 최소 4초로 반올림·클램프한다(`dispatch.mjs`의 duration 계산). ORIGIN 팔도 같은 task·같은 클램프를 타므로 팔 간 비교에는 영향이 없다.
- aspect: `16:9` (shots.json `format: horizontal_16:9`).

### 2-4. 끝 프레임 i2i 프롬프트 패턴

참조 이미지는 항상 **해당 샷의 시작 프레임 1장**. 프롬프트는 아래 세 변형 중 하나를 쓴다(샷별 최종 문자열은 3장에 전문 수록 — 패턴은 정의일 뿐, 모든 샷 블록에 최종 문자열을 그대로 적었다):

- **패턴 A (기본 — 정지 샷 + handheld_drift 샷)**:
  `Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: <끝 상태 문장> No camera movement between frames.`
- **패턴 A′ (무인 샷 01·04·07·10·19)**: 시작 프레임에 인물이 없으므로 `same person` → `same scene`으로 치환. 나머지 동일.
- **패턴 B (카메라 무브 샷 08·17·20 — dolly_in·tracking)**: "같은 프레이밍" 절이 무브 종착 구도와 모순되므로, 프레이밍 절을 **무브 종착 구도 서술**로 치환하고 말미를 `No camera movement beyond this end position.`으로 바꾼다:
  `Same camera, same person(무인이면 scene), same lighting. The framing is now at the end point of the <무브>: <종착 구도>. Only the action has advanced to its end state: <끝 상태 문장> No camera movement beyond this end position.`

**handheld_drift 처리(샷 09·11·12·13·14·15·16)**: 드리프트는 미세 호흡 수준의 흔들림이라 종착 구도 ≈ 시작 구도다. 끝 프레임에 "살짝 밀린 구도"를 일부러 굽는 것은 i2i 구도 오차가 의도한 드리프트보다 커지는 역효과가 있어, **패턴 A(구도 고정)로 취급**하고 드리프트 자체는 video_prompt가 영상 모델에 전달한다.

**끝 상태 문장 저작 원칙**: 각 샷 `video_prompt`가 묘사하는 동작의 **종착점**을 1~2문장 영어로 쓴다 — 동작의 '끝'이지 다음 샷의 시작이 아니다. 재료는 해당 샷의 `video_prompt`·`character_action`·`camera`·`composition` 4필드뿐이며, 시작 프레임이 이미 공간·인물을 담고 있으므로 문장은 **변한 것(또는 변하지 않았음)만** 서술한다. 무동작 샷(04·07·11·13·16)은 "시작 상태 유지"를 명시적으로 선언한다.

### 2-5. 산출 경로 규약 (assets 기준)

| 산출 | 경로 |
|---|---|
| 시작 프레임 (공유·읽기전용) | `arm-origin/frames/NN.png` |
| 끝 프레임 | `arm-framefix/frames/NN_end.png` |
| 클립 | `clips/arm-framefix/NN.mp4` |
| 잡 파일 (실험 루트) | `jobs.framefix.json` |

`jobs.framefix.json`은 3장의 샷별 JSON 조각(샷당 edit 1개 + i2v_se 1개, 총 40개)을 샷 순서대로 `[` … `]` 안에 이어붙인 것과 문자열이 정확히 일치해야 한다(이 문서가 정본).

### 2-6. shot_2 특례

ORIGIN 설계도와 동일 규칙을 따른다: shot_2 시작 프레임이 재시도 후에도 Ⓑ 판정이면 ORIGIN 팔에서 해당 샷을 제외하는데, **제외 시 이 팔도 같은 샷(샷 02의 끝 프레임·클립)을 제외**해 두 팔의 샷 구성을 짝으로 유지한다. 제외 여부는 ORIGIN QC 결과를 그대로 상속하며 이 팔이 독자 판단하지 않는다.

---

## 3. 샷별 설계 (본체 — 20샷 전문)

### 샷 01 — shot_1 (5s)

writer 산출 요약:
- 행동: "Establish the clinical, eerie atmosphere of the retro-pastel restroom at dawn."
- 카메라: WS · eye_level · static
- 구도: "The vanishing point at the center of the restroom corridor."
- 무드: "Desaturated pastels with a cold, clinical blue undertone."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/01.png` · 패턴 A′(무인)

```
Same camera, same framing, same scene, same lighting. Only the action has advanced to its end state: The empty restroom stands silent and unchanged, the overhead fluorescent lights settled back into a steady, even glare after their subtle flicker. No camera movement between frames.
```

번역: 같은 카메라, 같은 프레이밍, 같은 공간, 같은 조명. 동작만 종착 상태로 진행됐다: 텅 빈 화장실은 고요히 변함없이 서 있고, 머리 위 형광등은 미세한 깜빡임을 끝내고 다시 고르고 안정된 빛으로 돌아와 있다. 프레임 사이 카메라 이동 없음.

유도 근거: video_prompt "flicker subtly"의 종착 = 깜빡임이 끝나 재안정된 조명 상태 (피사체 동작 없음 → 공간 불변 선언).

**영상 페이로드** — task `i2v_se` · seconds 5 · aspect 16:9 · image `arm-origin/frames/01.png` · end_image `arm-framefix/frames/01_end.png` · out `clips/arm-framefix/01.mp4`

모션 프롬프트 (shots.json 원문):

```
The overhead fluorescent lights flicker subtly in the empty, silent restroom.
```

번역: 머리 위 형광등이 텅 빈 고요한 화장실 안에서 미세하게 깜빡인다.

jobs.framefix.json 조각:

```json
{ "id": "ff_01_end", "task": "edit", "prompt": "Same camera, same framing, same scene, same lighting. Only the action has advanced to its end state: The empty restroom stands silent and unchanged, the overhead fluorescent lights settled back into a steady, even glare after their subtle flicker. No camera movement between frames.", "image": "arm-origin/frames/01.png", "aspect": "16:9", "out": "arm-framefix/frames/01_end.png" },
{ "id": "ff_01", "task": "i2v_se", "prompt": "The overhead fluorescent lights flicker subtly in the empty, silent restroom.", "image": "arm-origin/frames/01.png", "end_image": "arm-framefix/frames/01_end.png", "seconds": 5, "aspect": "16:9", "out": "clips/arm-framefix/01.mp4" },
```

### 샷 02 — shot_2 (4s)

> **shot_2 특례 대상** (§2-6): ORIGIN에서 이 샷이 제외되면 아래 페이로드 2건 모두 실행하지 않는다.

writer 산출 요약:
- 행동: "Introduce the protagonist into the sterile environment, emphasizing her isolation."
- 카메라: MFS · eye_level · static
- 구도: "The girl as she enters the frame."
- 무드: "Maintain the cold dawn light, highlighting the pale blue of the dress."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/02.png` · 패턴 A

```
Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: The girl now stands at the sinks, her walk across the tile floor complete, her feet at rest on the tiles. No camera movement between frames.
```

번역: 같은 카메라, 같은 프레이밍, 같은 인물, 같은 조명. 동작만 종착 상태로 진행됐다: 소녀는 이제 세면대 앞에 서 있다. 타일 바닥을 가로지르는 걸음은 끝났고, 두 발은 타일 위에 멈춰 있다. 프레임 사이 카메라 이동 없음.

유도 근거: video_prompt "walks steadily across the tile floor toward the sinks" — 이동 동작의 종착 = 세면대 앞 도착·정지.

**영상 페이로드** — task `i2v_se` · seconds 4 · aspect 16:9 · image `arm-origin/frames/02.png` · end_image `arm-framefix/frames/02_end.png` · out `clips/arm-framefix/02.mp4`

모션 프롬프트 (shots.json 원문):

```
The girl walks steadily across the tile floor toward the sinks.
```

번역: 소녀가 타일 바닥을 가로질러 세면대 쪽으로 일정한 걸음으로 걸어간다.

jobs.framefix.json 조각:

```json
{ "id": "ff_02_end", "task": "edit", "prompt": "Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: The girl now stands at the sinks, her walk across the tile floor complete, her feet at rest on the tiles. No camera movement between frames.", "image": "arm-origin/frames/02.png", "aspect": "16:9", "out": "arm-framefix/frames/02_end.png" },
{ "id": "ff_02", "task": "i2v_se", "prompt": "The girl walks steadily across the tile floor toward the sinks.", "image": "arm-origin/frames/02.png", "end_image": "arm-framefix/frames/02_end.png", "seconds": 4, "aspect": "16:9", "out": "clips/arm-framefix/02.mp4" },
```

### 샷 03 — shot_3 (7s)

writer 산출 요약:
- 행동: "Create suspense by showing the girl's ignorance of the ghostly whisper coming from below."
- 카메라: MCU · eye_level · static
- 구도: "The girl's eyes in the mirror reflection."
- 무드: "Focus on the pink of the lip gloss and the pale blue of her dress reflection."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/03.png` · 패턴 A

```
Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: The gloss wand rests against her lips at the end of a stroke, her gaze still fixed blankly on her own reflection in the mirror. No camera movement between frames.
```

번역: 같은 카메라, 같은 프레이밍, 같은 인물, 같은 조명. 동작만 종착 상태로 진행됐다: 글로스 완드가 한 번의 스트로크를 끝내고 입술에 닿은 채 머물러 있고, 시선은 여전히 거울 속 자신의 반사상에 멍하니 고정되어 있다. 프레임 사이 카메라 이동 없음.

유도 근거: video_prompt "slowly applies lip gloss ... while staring blankly at her reflection" 도포 동작의 종착 + composition "The girl's eyes in the mirror reflection"의 시선 유지.

**영상 페이로드** — task `i2v_se` · seconds 7 · aspect 16:9 · image `arm-origin/frames/03.png` · end_image `arm-framefix/frames/03_end.png` · out `clips/arm-framefix/03.mp4`

모션 프롬프트 (shots.json 원문):

```
The girl slowly applies lip gloss to her lips while staring blankly at her reflection.
```

번역: 소녀가 거울 속 자신의 모습을 멍하니 응시하며 천천히 입술에 립글로스를 바른다.

jobs.framefix.json 조각:

```json
{ "id": "ff_03_end", "task": "edit", "prompt": "Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: The gloss wand rests against her lips at the end of a stroke, her gaze still fixed blankly on her own reflection in the mirror. No camera movement between frames.", "image": "arm-origin/frames/03.png", "aspect": "16:9", "out": "arm-framefix/frames/03_end.png" },
{ "id": "ff_03", "task": "i2v_se", "prompt": "The girl slowly applies lip gloss to her lips while staring blankly at her reflection.", "image": "arm-origin/frames/03.png", "end_image": "arm-framefix/frames/03_end.png", "seconds": 7, "aspect": "16:9", "out": "clips/arm-framefix/03.mp4" },
```

### 샷 04 — shot_4 (3s)

writer 산출 요약:
- 행동: "Identify the source of the whisper, grounding the horror in a physical object."
- 카메라: ECU · high_angle · static
- 구도: "The center of the drain hole."
- 무드: "High contrast between the bright sink and the absolute black of the drain."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/04.png` · 패턴 A′(무인)

```
Same camera, same framing, same scene, same lighting. Only the action has advanced to its end state: The dark, yawning hole of the drain remains exactly as before at the center of the frame - nothing has moved. No camera movement between frames.
```

번역: 같은 카메라, 같은 프레이밍, 같은 공간, 같은 조명. 동작만 종착 상태로 진행됐다: 어둡게 입을 벌린 배수구 구멍은 프레임 중앙에 이전과 정확히 똑같이 남아 있다 — 아무것도 움직이지 않았다. 프레임 사이 카메라 이동 없음.

유도 근거: video_prompt "The camera remains perfectly still on the dark, yawning hole" — 묘사된 피사체 동작이 없음 → 종착 = 시작 상태 유지 선언.

**영상 페이로드** — task `i2v_se` · seconds 3 · aspect 16:9 · image `arm-origin/frames/04.png` · end_image `arm-framefix/frames/04_end.png` · out `clips/arm-framefix/04.mp4`

모션 프롬프트 (shots.json 원문):

```
The camera remains perfectly still on the dark, yawning hole of the drain.
```

번역: 카메라는 어둡게 입을 벌린 배수구 구멍 위에 완벽하게 정지한 채 머무른다.

jobs.framefix.json 조각:

```json
{ "id": "ff_04_end", "task": "edit", "prompt": "Same camera, same framing, same scene, same lighting. Only the action has advanced to its end state: The dark, yawning hole of the drain remains exactly as before at the center of the frame - nothing has moved. No camera movement between frames.", "image": "arm-origin/frames/04.png", "aspect": "16:9", "out": "arm-framefix/frames/04_end.png" },
{ "id": "ff_04", "task": "i2v_se", "prompt": "The camera remains perfectly still on the dark, yawning hole of the drain.", "image": "arm-origin/frames/04.png", "end_image": "arm-framefix/frames/04_end.png", "seconds": 3, "aspect": "16:9", "out": "clips/arm-framefix/04.mp4" },
```

### 샷 05 — shot_5 (4s)

writer 산출 요약:
- 행동: "Conclude the scene with the girl's unsettling normalcy, leaving the audience in dread."
- 카메라: MS · eye_level · static
- 구도: "The girl's face."
- 무드: "A slightly colder, more clinical blue tone to end the scene."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/05.png` · 패턴 A

```
Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: Her hand has just come away from her hair, which now sits neatly in place, and her expression remains blank. No camera movement between frames.
```

번역: 같은 카메라, 같은 프레이밍, 같은 인물, 같은 조명. 동작만 종착 상태로 진행됐다: 손은 방금 머리카락에서 떨어졌고, 머리는 이제 단정하게 자리 잡았으며, 표정은 여전히 무표정하다. 프레임 사이 카메라 이동 없음.

유도 근거: video_prompt "adjusts her hair with a blank expression"의 종착 = 손이 내려오고 머리 정돈이 끝난 상태. "before the scene fades"는 편집 페이드라 프레임 상태에서 제외.

**영상 페이로드** — task `i2v_se` · seconds 4 · aspect 16:9 · image `arm-origin/frames/05.png` · end_image `arm-framefix/frames/05_end.png` · out `clips/arm-framefix/05.mp4`

모션 프롬프트 (shots.json 원문):

```
The girl adjusts her hair with a blank expression before the scene fades.
```

번역: 소녀가 무표정하게 머리를 매만지고, 장면이 페이드아웃된다.

jobs.framefix.json 조각:

```json
{ "id": "ff_05_end", "task": "edit", "prompt": "Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: Her hand has just come away from her hair, which now sits neatly in place, and her expression remains blank. No camera movement between frames.", "image": "arm-origin/frames/05.png", "aspect": "16:9", "out": "arm-framefix/frames/05_end.png" },
{ "id": "ff_05", "task": "i2v_se", "prompt": "The girl adjusts her hair with a blank expression before the scene fades.", "image": "arm-origin/frames/05.png", "end_image": "arm-framefix/frames/05_end.png", "seconds": 4, "aspect": "16:9", "out": "clips/arm-framefix/05.mp4" },
```

### 샷 06 — shot_6 (4s)

writer 산출 요약:
- 행동: "Visualize the girl's sudden isolation and the eerie realization of an uncanny presence in the empty space."
- 카메라: MCU · eye_level · static
- 구도: "The girl's eyes in the mirror reflection."
- 무드: "Cool dawn tones with a hint of retro pastel blue to enhance the quiet dread."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/06.png` · 패턴 A

```
Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: She remains completely frozen in place; her eyes have finished their subtle shift and now rest fixed on the reflection of the empty stalls. No camera movement between frames.
```

번역: 같은 카메라, 같은 프레이밍, 같은 인물, 같은 조명. 동작만 종착 상태로 진행됐다: 그녀는 여전히 완전히 얼어붙어 있다. 눈동자는 미세한 이동을 끝내고 이제 빈 칸막이들의 반사상에 고정되어 있다. 프레임 사이 카메라 이동 없음.

유도 근거: video_prompt "her eyes subtly shifting to scan the reflection of the empty stalls" — 시선 이동의 종착 = 스톨 반사상에 고정, 몸은 frozen 유지.

**영상 페이로드** — task `i2v_se` · seconds 4 · aspect 16:9 · image `arm-origin/frames/06.png` · end_image `arm-framefix/frames/06_end.png` · out `clips/arm-framefix/06.mp4`

모션 프롬프트 (shots.json 원문):

```
The girl remains completely frozen, her eyes subtly shifting to scan the reflection of the empty stalls.
```

번역: 소녀는 완전히 얼어붙은 채, 눈동자만 미세하게 움직여 빈 칸막이들의 반사상을 살핀다.

jobs.framefix.json 조각:

```json
{ "id": "ff_06_end", "task": "edit", "prompt": "Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: She remains completely frozen in place; her eyes have finished their subtle shift and now rest fixed on the reflection of the empty stalls. No camera movement between frames.", "image": "arm-origin/frames/06.png", "aspect": "16:9", "out": "arm-framefix/frames/06_end.png" },
{ "id": "ff_06", "task": "i2v_se", "prompt": "The girl remains completely frozen, her eyes subtly shifting to scan the reflection of the empty stalls.", "image": "arm-origin/frames/06.png", "end_image": "arm-framefix/frames/06_end.png", "seconds": 4, "aspect": "16:9", "out": "clips/arm-framefix/06.mp4" },
```

### 샷 07 — shot_7 (3s)

writer 산출 요약:
- 행동: "Clearly identify the source of the whisper, transforming a vague feeling into a specific, localized threat."
- 카메라: ECU · high_angle · static
- 구도: "The center of the drain grating."
- 무드: "High contrast to emphasize the darkness within the drain."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/07.png` · 패턴 A′(무인)

```
Same camera, same framing, same scene, same lighting. Only the action has advanced to its end state: The drain grating is unchanged; the shadows inside its holes now rest at the darkest point of their pulse. No camera movement between frames.
```

번역: 같은 카메라, 같은 프레이밍, 같은 공간, 같은 조명. 동작만 종착 상태로 진행됐다: 배수구 그레이팅은 변함없다. 구멍 안 그림자들은 이제 맥동의 가장 어두운 지점에 멈춰 있다. 프레임 사이 카메라 이동 없음.

유도 근거: video_prompt "the shadows within seem to pulse" — 그림자 맥동의 종착 위상을 최암점으로 고정 (그레이팅 자체는 무동작).

**영상 페이로드** — task `i2v_se` · seconds 3 · aspect 16:9 · image `arm-origin/frames/07.png` · end_image `arm-framefix/frames/07_end.png` · out `clips/arm-framefix/07.mp4`

모션 프롬프트 (shots.json 원문):

```
A static shot focusing on the dark void of the drain as the shadows within seem to pulse.
```

번역: 배수구의 어두운 공동에 고정된 정적 숏 — 그 안의 그림자들이 맥동하는 듯 보인다.

jobs.framefix.json 조각:

```json
{ "id": "ff_07_end", "task": "edit", "prompt": "Same camera, same framing, same scene, same lighting. Only the action has advanced to its end state: The drain grating is unchanged; the shadows inside its holes now rest at the darkest point of their pulse. No camera movement between frames.", "image": "arm-origin/frames/07.png", "aspect": "16:9", "out": "arm-framefix/frames/07_end.png" },
{ "id": "ff_07", "task": "i2v_se", "prompt": "A static shot focusing on the dark void of the drain as the shadows within seem to pulse.", "image": "arm-origin/frames/07.png", "end_image": "arm-framefix/frames/07_end.png", "seconds": 3, "aspect": "16:9", "out": "clips/arm-framefix/07.mp4" },
```

### 샷 08 — shot_8 (5s)

writer 산출 요약:
- 행동: "Escalate suspense by showing the character's fatal curiosity as she draws closer to the source of the voice."
- 카메라: CU · low_angle · **dolly_in**
- 구도: "The girl's ear and her wide, anxious eye."
- 무드: "Deepen the cool blues while introducing a faint magenta glow in the shadows."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/08.png` · 패턴 B(dolly_in 종착)

```
Same camera, same person, same lighting. The framing is now at the end point of the slow dolly-in: a tighter low-angle close-up on her ear and her wide, anxious eye. Only the action has advanced to its end state: Her head is fully lowered beside the sink, her ear brought closest to the drain, her wide anxious eye held open. No camera movement beyond this end position.
```

번역: 같은 카메라, 같은 인물, 같은 조명. 프레이밍은 이제 느린 달리 인의 종착 지점에 있다: 그녀의 귀와 크게 뜬 불안한 눈을 더 타이트하게 잡은 로우앵글 클로즈업. 동작만 종착 상태로 진행됐다: 고개는 세면대 옆으로 완전히 숙여졌고, 귀는 배수구에 가장 가까이 다가가 있으며, 크게 뜬 불안한 눈은 그대로 열려 있다. 이 종착 위치 이후 카메라 이동 없음.

유도 근거: video_prompt "leans her head down toward the sink, bringing her ear closer to the drain"의 종착 + camera.movement dolly_in의 종착 구도(composition "ear and her wide, anxious eye"를 더 타이트하게).

**영상 페이로드** — task `i2v_se` · seconds 5 · aspect 16:9 · image `arm-origin/frames/08.png` · end_image `arm-framefix/frames/08_end.png` · out `clips/arm-framefix/08.mp4`

모션 프롬프트 (shots.json 원문):

```
The camera slowly dollys in as the girl leans her head down toward the sink, bringing her ear closer to the drain.
```

번역: 소녀가 고개를 숙여 귀를 배수구 가까이 가져가는 동안 카메라가 천천히 달리 인 한다.

jobs.framefix.json 조각:

```json
{ "id": "ff_08_end", "task": "edit", "prompt": "Same camera, same person, same lighting. The framing is now at the end point of the slow dolly-in: a tighter low-angle close-up on her ear and her wide, anxious eye. Only the action has advanced to its end state: Her head is fully lowered beside the sink, her ear brought closest to the drain, her wide anxious eye held open. No camera movement beyond this end position.", "image": "arm-origin/frames/08.png", "aspect": "16:9", "out": "arm-framefix/frames/08_end.png" },
{ "id": "ff_08", "task": "i2v_se", "prompt": "The camera slowly dollys in as the girl leans her head down toward the sink, bringing her ear closer to the drain.", "image": "arm-origin/frames/08.png", "end_image": "arm-framefix/frames/08_end.png", "seconds": 5, "aspect": "16:9", "out": "clips/arm-framefix/08.mp4" },
```

### 샷 09 — shot_9 (3s)

writer 산출 요약:
- 행동: "Capture the peak of the girl's curiosity and tension as she investigates the source of the sound."
- 카메라: MS · low_angle · handheld_drift
- 구도: "The girl's hands near the pipes"
- 무드: "Cold dawn blue tones with high contrast shadows."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/09.png` · 패턴 A(drift는 구도 고정 취급)

```
Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: She has leaned fully down into the shadows, her hands now at the dark pipes. No camera movement between frames.
```

번역: 같은 카메라, 같은 프레이밍, 같은 인물, 같은 조명. 동작만 종착 상태로 진행됐다: 그녀는 그림자 속으로 완전히 몸을 숙였고, 두 손은 이제 어두운 파이프에 닿아 있다. 프레임 사이 카메라 이동 없음.

유도 근거: video_prompt "leans deeper into the shadows"의 종착 + composition "The girl's hands near the pipes". 카메라 drift는 미세 호흡으로 보고 끝 프레임 구도는 시작과 동일 취급(§2-4).

**영상 페이로드** — task `i2v_se` · seconds 3 · aspect 16:9 · image `arm-origin/frames/09.png` · end_image `arm-framefix/frames/09_end.png` · out `clips/arm-framefix/09.mp4`

모션 프롬프트 (shots.json 원문):

```
The girl leans deeper into the shadows while the camera drifts slightly forward.
```

번역: 소녀가 그림자 속으로 더 깊이 몸을 숙이고, 카메라는 살짝 앞으로 흘러간다.

jobs.framefix.json 조각:

```json
{ "id": "ff_09_end", "task": "edit", "prompt": "Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: She has leaned fully down into the shadows, her hands now at the dark pipes. No camera movement between frames.", "image": "arm-origin/frames/09.png", "aspect": "16:9", "out": "arm-framefix/frames/09_end.png" },
{ "id": "ff_09", "task": "i2v_se", "prompt": "The girl leans deeper into the shadows while the camera drifts slightly forward.", "image": "arm-origin/frames/09.png", "end_image": "arm-framefix/frames/09_end.png", "seconds": 3, "aspect": "16:9", "out": "clips/arm-framefix/09.mp4" },
```

### 샷 10 — shot_10 (2s)

writer 산출 요약:
- 행동: "Shock the audience with a sensory blackout and a brief flash of violence."
- 카메라: POV · eye_level · static
- 구도: "The center of the frame"
- 무드: "Pitch black interrupted by an aggressive, saturated magenta burst."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/10.png` · 패턴 A′(무인)

```
Same camera, same framing, same scene, same lighting. Only the action has advanced to its end state: The frame has returned to near-total darkness, with only a faint magenta afterglow dissolving at its center. No camera movement between frames.
```

번역: 같은 카메라, 같은 프레이밍, 같은 공간, 같은 조명. 동작만 종착 상태로 진행됐다: 화면은 거의 완전한 어둠으로 되돌아왔고, 중앙에는 희미한 마젠타 잔광만이 사그라들고 있다. 프레임 사이 카메라 이동 없음.

유도 근거: video_prompt "flash bursts across the screen then fades into darkness" — 섬광의 종착 = 어둠 복귀(잔광만 남음).

**영상 페이로드** — task `i2v_se` · seconds 2 · aspect 16:9 · image `arm-origin/frames/10.png` · end_image `arm-framefix/frames/10_end.png` · out `clips/arm-framefix/10.mp4`

모션 프롬프트 (shots.json 원문):

```
A sharp magenta flash bursts across the screen then fades into darkness.
```

번역: 날카로운 마젠타 섬광이 화면을 가로질러 터졌다가 어둠 속으로 사그라든다.

jobs.framefix.json 조각:

```json
{ "id": "ff_10_end", "task": "edit", "prompt": "Same camera, same framing, same scene, same lighting. Only the action has advanced to its end state: The frame has returned to near-total darkness, with only a faint magenta afterglow dissolving at its center. No camera movement between frames.", "image": "arm-origin/frames/10.png", "aspect": "16:9", "out": "arm-framefix/frames/10_end.png" },
{ "id": "ff_10", "task": "i2v_se", "prompt": "A sharp magenta flash bursts across the screen then fades into darkness.", "image": "arm-origin/frames/10.png", "end_image": "arm-framefix/frames/10_end.png", "seconds": 2, "aspect": "16:9", "out": "clips/arm-framefix/10.mp4" },
```

### 샷 11 — shot_11 (4s)

writer 산출 요약:
- 행동: "Establish the uncanny presence of the doppelganger and the girl's defeat."
- 카메라: WS · high_angle · handheld_drift
- 구도: "The doppelganger's standing figure"
- 무드: "Desaturated, clinical dawn light with deep blue shadows."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/11.png` · 패턴 A(drift는 구도 고정 취급)

```
Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: The doppelganger still stands perfectly motionless, her standing figure unchanged; nothing in the room has shifted. No camera movement between frames.
```

번역: 같은 카메라, 같은 프레이밍, 같은 인물, 같은 조명. 동작만 종착 상태로 진행됐다: 도플갱어는 여전히 완벽하게 미동 없이 서 있고, 서 있는 자세 그대로다. 방 안의 어떤 것도 움직이지 않았다. 프레임 사이 카메라 이동 없음.

유도 근거: video_prompt "stands perfectly still" — 피사체 무동작 → 종착 = 시작 상태 유지 선언. drift는 구도 고정 취급(§2-4).

**영상 페이로드** — task `i2v_se` · seconds 4 · aspect 16:9 · image `arm-origin/frames/11.png` · end_image `arm-framefix/frames/11_end.png` · out `clips/arm-framefix/11.mp4`

모션 프롬프트 (shots.json 원문):

```
The doppelganger stands perfectly still while the camera breathes with a handheld drift.
```

번역: 도플갱어가 완벽하게 정지해 서 있고, 카메라는 핸드헬드 드리프트로 숨 쉬듯 흔들린다.

jobs.framefix.json 조각:

```json
{ "id": "ff_11_end", "task": "edit", "prompt": "Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: The doppelganger still stands perfectly motionless, her standing figure unchanged; nothing in the room has shifted. No camera movement between frames.", "image": "arm-origin/frames/11.png", "aspect": "16:9", "out": "arm-framefix/frames/11_end.png" },
{ "id": "ff_11", "task": "i2v_se", "prompt": "The doppelganger stands perfectly still while the camera breathes with a handheld drift.", "image": "arm-origin/frames/11.png", "end_image": "arm-framefix/frames/11_end.png", "seconds": 4, "aspect": "16:9", "out": "clips/arm-framefix/11.mp4" },
```

### 샷 12 — shot_12 (5s)

writer 산출 요약:
- 행동: "Demonstrate the doppelganger's cold, mechanical efficiency in disposing of the original."
- 카메라: MFS · eye_level · handheld_drift
- 구도: "The doppelganger's hand on the girl's arm"
- 무드: "Clinical, muted tones to match the emotionless action."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/12.png` · 패턴 A(drift는 구도 고정 취급)

```
Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: The doppelganger has dragged the limp body farther toward the left side of the frame, her hand still on the girl's arm at the end of the pull. No camera movement between frames.
```

번역: 같은 카메라, 같은 프레이밍, 같은 인물, 같은 조명. 동작만 종착 상태로 진행됐다: 도플갱어는 축 늘어진 몸을 프레임 왼쪽으로 더 멀리 끌어다 놓았고, 손은 끌기의 끝 지점에서 여전히 소녀의 팔을 잡고 있다. 프레임 사이 카메라 이동 없음.

유도 근거: video_prompt "drags the limp body across the floor toward the left" — 끌기 동작의 종착(왼쪽 이동 완료 지점) + composition "hand on the girl's arm" 접점 유지.

**영상 페이로드** — task `i2v_se` · seconds 5 · aspect 16:9 · image `arm-origin/frames/12.png` · end_image `arm-framefix/frames/12_end.png` · out `clips/arm-framefix/12.mp4`

모션 프롬프트 (shots.json 원문):

```
The doppelganger slowly drags the limp body across the floor toward the left.
```

번역: 도플갱어가 축 늘어진 몸을 바닥 위로 천천히 왼쪽으로 끌고 간다.

jobs.framefix.json 조각:

```json
{ "id": "ff_12_end", "task": "edit", "prompt": "Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: The doppelganger has dragged the limp body farther toward the left side of the frame, her hand still on the girl's arm at the end of the pull. No camera movement between frames.", "image": "arm-origin/frames/12.png", "aspect": "16:9", "out": "arm-framefix/frames/12_end.png" },
{ "id": "ff_12", "task": "i2v_se", "prompt": "The doppelganger slowly drags the limp body across the floor toward the left.", "image": "arm-origin/frames/12.png", "end_image": "arm-framefix/frames/12_end.png", "seconds": 5, "aspect": "16:9", "out": "clips/arm-framefix/12.mp4" },
```

### 샷 13 — shot_13 (4s)

writer 산출 요약:
- 행동: "Final reveal of the doppelganger's perfect, terrifying lack of emotion."
- 카메라: CU · eye_level · handheld_drift
- 구도: "Doppelganger's eyes"
- 무드: "High contrast, emphasizing the pale skin and dark hair."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/13.png` · 패턴 A(drift는 구도 고정 취급)

```
Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: She still stares directly into the camera, eyes open and unblinking, held in exactly the same absolute stillness. No camera movement between frames.
```

번역: 같은 카메라, 같은 프레이밍, 같은 인물, 같은 조명. 동작만 종착 상태로 진행됐다: 그녀는 여전히 카메라를 똑바로 응시하고 있다. 눈은 뜬 채 깜빡임이 없고, 정확히 같은 절대적 정지 상태가 유지되고 있다. 프레임 사이 카메라 이동 없음.

유도 근거: video_prompt "absolute stillness and no blinking" — 피사체 무동작 → 종착 = 시작 상태 유지 선언.

**영상 페이로드** — task `i2v_se` · seconds 4 · aspect 16:9 · image `arm-origin/frames/13.png` · end_image `arm-framefix/frames/13_end.png` · out `clips/arm-framefix/13.mp4`

모션 프롬프트 (shots.json 원문):

```
The doppelganger stares into the camera with absolute stillness and no blinking.
```

번역: 도플갱어가 눈 한 번 깜빡이지 않는 절대적인 정지 상태로 카메라를 응시한다.

jobs.framefix.json 조각:

```json
{ "id": "ff_13_end", "task": "edit", "prompt": "Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: She still stares directly into the camera, eyes open and unblinking, held in exactly the same absolute stillness. No camera movement between frames.", "image": "arm-origin/frames/13.png", "aspect": "16:9", "out": "arm-framefix/frames/13_end.png" },
{ "id": "ff_13", "task": "i2v_se", "prompt": "The doppelganger stares into the camera with absolute stillness and no blinking.", "image": "arm-origin/frames/13.png", "end_image": "arm-framefix/frames/13_end.png", "seconds": 4, "aspect": "16:9", "out": "clips/arm-framefix/13.mp4" },
```

### 샷 14 — shot_14 (3s)

writer 산출 요약:
- 행동: "To emphasize the physical weight and total lack of life in the victim's body through a grounding floor-level perspective."
- 카메라: FS · low_angle · handheld_drift
- 구도: "The point of contact between the girl's shoulder and the floor."
- 무드: "Cold, clinical dawn light with harsh magenta shadows in the corners."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/14.png` · 패턴 A(drift는 구도 고정 취급)

```
Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: The girl's limp body now rests fully on the tiles, her shoulder settled against the floor, and the doppelganger's hands have just released it. No camera movement between frames.
```

번역: 같은 카메라, 같은 프레이밍, 같은 인물, 같은 조명. 동작만 종착 상태로 진행됐다: 소녀의 축 늘어진 몸은 이제 타일 위에 완전히 놓여 있고, 어깨는 바닥에 닿아 자리 잡았으며, 도플갱어의 손은 방금 몸을 놓았다. 프레임 사이 카메라 이동 없음.

유도 근거: video_prompt "lowers the limp body of the girl onto the tiles" — 내려놓기 동작의 종착(안착·손 놓음) + composition "shoulder and the floor" 접점.

**영상 페이로드** — task `i2v_se` · seconds 3 · aspect 16:9 · image `arm-origin/frames/14.png` · end_image `arm-framefix/frames/14_end.png` · out `clips/arm-framefix/14.mp4`

모션 프롬프트 (shots.json 원문):

```
The doppelganger slowly lowers the limp body of the girl onto the tiles with a heavy, physical weight.
```

번역: 도플갱어가 소녀의 축 늘어진 몸을 묵직한 물리적 무게감과 함께 타일 위로 천천히 내려놓는다.

jobs.framefix.json 조각:

```json
{ "id": "ff_14_end", "task": "edit", "prompt": "Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: The girl's limp body now rests fully on the tiles, her shoulder settled against the floor, and the doppelganger's hands have just released it. No camera movement between frames.", "image": "arm-origin/frames/14.png", "aspect": "16:9", "out": "arm-framefix/frames/14_end.png" },
{ "id": "ff_14", "task": "i2v_se", "prompt": "The doppelganger slowly lowers the limp body of the girl onto the tiles with a heavy, physical weight.", "image": "arm-origin/frames/14.png", "end_image": "arm-framefix/frames/14_end.png", "seconds": 3, "aspect": "16:9", "out": "clips/arm-framefix/14.mp4" },
```

### 샷 15 — shot_15 (2s)

writer 산출 요약:
- 행동: "Highlight the uncanny and fetishistic detachment of the antagonist through a close-up of a stolen personal item."
- 카메라: ECU · eye_level · handheld_drift
- 구도: "The angular toe of the black Mary Jane heel."
- 무드: "High contrast with magenta highlights reflecting off the black leather."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/15.png` · 패턴 A(drift는 구도 고정 취급)

```
Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: The hand's grip on the black Mary Jane heel is now visibly tightened, fingers pressed firm around the shoe. No camera movement between frames.
```

번역: 같은 카메라, 같은 프레이밍, 같은 인물, 같은 조명. 동작만 종착 상태로 진행됐다: 검은 메리제인 힐을 쥔 손아귀는 이제 눈에 띄게 조여져 있고, 손가락들이 신발을 단단히 감싸 누르고 있다. 프레임 사이 카메라 이동 없음.

유도 근거: video_prompt "The hand subtly tightens its grip on the shoe" — 조임 동작의 종착 + composition "the black Mary Jane heel". drift는 구도 고정 취급(§2-4).

**영상 페이로드** — task `i2v_se` · seconds 2 · aspect 16:9 · image `arm-origin/frames/15.png` · end_image `arm-framefix/frames/15_end.png` · out `clips/arm-framefix/15.mp4`

모션 프롬프트 (shots.json 원문):

```
The hand subtly tightens its grip on the shoe while the camera drifts slightly forward.
```

번역: 손이 신발을 쥔 손아귀를 미묘하게 조이고, 카메라는 살짝 앞으로 흘러간다.

jobs.framefix.json 조각:

```json
{ "id": "ff_15_end", "task": "edit", "prompt": "Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: The hand's grip on the black Mary Jane heel is now visibly tightened, fingers pressed firm around the shoe. No camera movement between frames.", "image": "arm-origin/frames/15.png", "aspect": "16:9", "out": "arm-framefix/frames/15_end.png" },
{ "id": "ff_15", "task": "i2v_se", "prompt": "The hand subtly tightens its grip on the shoe while the camera drifts slightly forward.", "image": "arm-origin/frames/15.png", "end_image": "arm-framefix/frames/15_end.png", "seconds": 2, "aspect": "16:9", "out": "clips/arm-framefix/15.mp4" },
```

### 샷 16 — shot_16 (4s)

writer 산출 요약:
- 행동: "To build dread through a prolonged moment of unnatural stillness and psychological void."
- 카메라: MS · eye_level · handheld_drift
- 구도: "The doppelganger's eyes."
- 무드: "Desaturated blues and pinks with deep, oppressive shadows."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/16.png` · 패턴 A(drift는 구도 고정 취급)

```
Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: She remains exactly as before, unnervingly still, her blank stare unbroken. No camera movement between frames.
```

번역: 같은 카메라, 같은 프레이밍, 같은 인물, 같은 조명. 동작만 종착 상태로 진행됐다: 그녀는 이전과 정확히 똑같이, 소름 끼치도록 미동 없이 남아 있고, 멍한 응시는 끊기지 않았다. 프레임 사이 카메라 이동 없음.

유도 근거: video_prompt "remains unnervingly still, staring blankly" — 피사체 무동작 → 종착 = 시작 상태 유지 선언.

**영상 페이로드** — task `i2v_se` · seconds 4 · aspect 16:9 · image `arm-origin/frames/16.png` · end_image `arm-framefix/frames/16_end.png` · out `clips/arm-framefix/16.mp4`

모션 프롬프트 (shots.json 원문):

```
The doppelganger remains unnervingly still, staring blankly as the camera drifts with a subtle handheld breathing.
```

번역: 도플갱어가 소름 끼치도록 미동 없이 멍하니 응시하는 동안, 카메라가 미세한 핸드헬드 호흡으로 흔들린다.

jobs.framefix.json 조각:

```json
{ "id": "ff_16_end", "task": "edit", "prompt": "Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: She remains exactly as before, unnervingly still, her blank stare unbroken. No camera movement between frames.", "image": "arm-origin/frames/16.png", "aspect": "16:9", "out": "arm-framefix/frames/16_end.png" },
{ "id": "ff_16", "task": "i2v_se", "prompt": "The doppelganger remains unnervingly still, staring blankly as the camera drifts with a subtle handheld breathing.", "image": "arm-origin/frames/16.png", "end_image": "arm-framefix/frames/16_end.png", "seconds": 4, "aspect": "16:9", "out": "clips/arm-framefix/16.mp4" },
```

### 샷 17 — shot_17 (3s)

writer 산출 요약:
- 행동: "To signify the completion of the 'replacement' and the abandonment of the original girl."
- 카메라: MFS · eye_level · **tracking**
- 구도: "The doppelganger's back as she walks away."
- 무드: "Cold blue dominance with a final flash of magenta from the overhead lights."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/17.png` · 패턴 B(tracking 종착)

```
Same camera, same person, same lighting. The framing is now at the end point of the tracking move: a medium full shot still holding the doppelganger's back at the same distance, farther along her path away from the stall. Only the action has advanced to its end state: She has walked several steady steps away, and the stall door behind her has swung fully shut. No camera movement beyond this end position.
```

번역: 같은 카메라, 같은 인물, 같은 조명. 프레이밍은 이제 트래킹 무브의 종착 지점에 있다: 도플갱어의 등을 같은 거리에서 계속 잡은 미디엄 풀 숏, 칸막이에서 더 멀어진 경로상의 지점. 동작만 종착 상태로 진행됐다: 그녀는 일정한 걸음으로 몇 걸음 더 멀어졌고, 등 뒤 칸막이 문은 완전히 닫혔다. 이 종착 위치 이후 카메라 이동 없음.

유도 근거: video_prompt "walks away ... as the stall door swings shut behind her" — 멀어지는 걸음과 문 닫힘의 종착 + camera.movement tracking의 종착 구도(composition "The doppelganger's back as she walks away"의 등 뒤 시점·거리 유지).

**영상 페이로드** — task `i2v_se` · seconds 3 · aspect 16:9 · image `arm-origin/frames/17.png` · end_image `arm-framefix/frames/17_end.png` · out `clips/arm-framefix/17.mp4`

모션 프롬프트 (shots.json 원문):

```
The doppelganger walks away with a cold, steady pace as the stall door swings shut behind her.
```

번역: 도플갱어가 차갑고 일정한 걸음으로 멀어지고, 등 뒤에서 칸막이 문이 흔들리며 닫힌다.

jobs.framefix.json 조각:

```json
{ "id": "ff_17_end", "task": "edit", "prompt": "Same camera, same person, same lighting. The framing is now at the end point of the tracking move: a medium full shot still holding the doppelganger's back at the same distance, farther along her path away from the stall. Only the action has advanced to its end state: She has walked several steady steps away, and the stall door behind her has swung fully shut. No camera movement beyond this end position.", "image": "arm-origin/frames/17.png", "aspect": "16:9", "out": "arm-framefix/frames/17_end.png" },
{ "id": "ff_17", "task": "i2v_se", "prompt": "The doppelganger walks away with a cold, steady pace as the stall door swings shut behind her.", "image": "arm-origin/frames/17.png", "end_image": "arm-framefix/frames/17_end.png", "seconds": 3, "aspect": "16:9", "out": "clips/arm-framefix/17.mp4" },
```

### 샷 18 — shot_18 (2.5s)

writer 산출 요약:
- 행동: "To convey a sense of uncanny detachment by showing the doppelganger's mechanical and indifferent movement as she replaces the original girl."
- 카메라: MS · eye_level · static
- 구도: "The doppelganger's face"
- 무드: "Cool and clinical, emphasizing the pale blue tones to match the dawn light."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/18.png` · 패턴 A

```
Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: She has walked fully out of the frame; the frame now holds only the empty background, with no one in view. No camera movement between frames.
```

번역: 같은 카메라, 같은 프레이밍, 같은 인물, 같은 조명. 동작만 종착 상태로 진행됐다: 그녀는 프레임 밖으로 완전히 걸어 나갔다. 화면에는 이제 아무도 없는 빈 배경만 남아 있다. 프레임 사이 카메라 이동 없음.

유도 근거: video_prompt "walks steadily across the frame ... exiting the shot" — 퇴장 동작의 종착 = 프레임에서 완전히 사라진 빈 프레임 상태. (`same person`은 참조인 시작 프레임의 인물 신원을 고정하는 절 — 종착 프레임에서는 퇴장 완료로 인물이 없는 것이 정답.)

**영상 페이로드** — task `i2v_se` · seconds 2.5 · aspect 16:9 · image `arm-origin/frames/18.png` · end_image `arm-framefix/frames/18_end.png` · out `clips/arm-framefix/18.mp4`

모션 프롬프트 (shots.json 원문):

```
The doppelganger walks steadily across the frame with mechanical indifference, exiting the shot.
```

번역: 도플갱어가 기계적인 무심함으로 프레임을 가로질러 일정하게 걸어 나가며 숏에서 퇴장한다.

jobs.framefix.json 조각:

```json
{ "id": "ff_18_end", "task": "edit", "prompt": "Same camera, same framing, same person, same lighting. Only the action has advanced to its end state: She has walked fully out of the frame; the frame now holds only the empty background, with no one in view. No camera movement between frames.", "image": "arm-origin/frames/18.png", "aspect": "16:9", "out": "arm-framefix/frames/18_end.png" },
{ "id": "ff_18", "task": "i2v_se", "prompt": "The doppelganger walks steadily across the frame with mechanical indifference, exiting the shot.", "image": "arm-origin/frames/18.png", "end_image": "arm-framefix/frames/18_end.png", "seconds": 2.5, "aspect": "16:9", "out": "clips/arm-framefix/18.mp4" },
```

### 샷 19 — shot_19 (2.5s)

writer 산출 요약:
- 행동: "To create a vacuum of sound and presence, heightening the dread through the sudden emptiness of the space."
- 카메라: WS · eye_level · static
- 구도: "The closing door"
- 무드: "Desaturated and hollow, emphasizing the lack of life in the room."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/19.png` · 패턴 A′(무인)

```
Same camera, same framing, same scene, same lighting. Only the action has advanced to its end state: The restroom door now sits fully shut, clicked into place, and the empty room is completely still. No camera movement between frames.
```

번역: 같은 카메라, 같은 프레이밍, 같은 공간, 같은 조명. 동작만 종착 상태로 진행됐다: 화장실 문은 이제 완전히 닫혀 딸깍 잠겨 있고, 텅 빈 방은 완전한 정적에 잠겨 있다. 프레임 사이 카메라 이동 없음.

유도 근거: video_prompt "swings shut slowly, clicking into place, leaving the room completely still" — 문 닫힘 동작의 종착 = 완전 폐문·정적.

**영상 페이로드** — task `i2v_se` · seconds 2.5 · aspect 16:9 · image `arm-origin/frames/19.png` · end_image `arm-framefix/frames/19_end.png` · out `clips/arm-framefix/19.mp4`

모션 프롬프트 (shots.json 원문):

```
The restroom door swings shut slowly, clicking into place, leaving the room completely still.
```

번역: 화장실 문이 천천히 흔들리며 닫혀 딸깍 잠기고, 방은 완전한 정적에 잠긴다.

jobs.framefix.json 조각:

```json
{ "id": "ff_19_end", "task": "edit", "prompt": "Same camera, same framing, same scene, same lighting. Only the action has advanced to its end state: The restroom door now sits fully shut, clicked into place, and the empty room is completely still. No camera movement between frames.", "image": "arm-origin/frames/19.png", "aspect": "16:9", "out": "arm-framefix/frames/19_end.png" },
{ "id": "ff_19", "task": "i2v_se", "prompt": "The restroom door swings shut slowly, clicking into place, leaving the room completely still.", "image": "arm-origin/frames/19.png", "end_image": "arm-framefix/frames/19_end.png", "seconds": 2.5, "aspect": "16:9", "out": "clips/arm-framefix/19.mp4" },
```

### 샷 20 — shot_20 (4s)

writer 산출 요약:
- 행동: "To deliver the final chilling revelation that the original girl is still there, discarded and forgotten."
- 카메라: CU · low_angle · **dolly_in**
- 구도: "The white crew socks and black Mary Jane heels"
- 무드: "The warmest but most ominous tone, with deep shadows creeping from the stall."

**끝 프레임 i2i 페이로드** — 참조: `arm-origin/frames/20.png` · 패턴 B(dolly_in 종착, 무인 시작 → `same scene`)

```
Same camera, same scene, same lighting. The framing is now at the end point of the slow dolly-in: a low-angle close-up arrived right up at the narrow stall gap. Only the action has advanced to its end state: The motionless white-socked feet of the original girl are now clearly revealed in the stall gap. No camera movement beyond this end position.
```

번역: 같은 카메라, 같은 공간, 같은 조명. 프레이밍은 이제 느린 달리 인의 종착 지점에 있다: 좁은 칸막이 틈 바로 앞까지 다가간 로우앵글 클로즈업. 동작만 종착 상태로 진행됐다: 미동도 없는 원래 소녀의 흰 양말 신은 발이 이제 칸막이 틈으로 뚜렷하게 드러나 있다. 이 종착 위치 이후 카메라 이동 없음.

유도 근거: video_prompt "dollies forward toward the stall gap, revealing the motionless white-socked feet" — reveal의 종착(발 노출 완료) + camera.movement dolly_in의 종착 구도(틈 최근접) + composition의 흰 크루 삭스 요소.

**영상 페이로드** — task `i2v_se` · seconds 4 · aspect 16:9 · image `arm-origin/frames/20.png` · end_image `arm-framefix/frames/20_end.png` · out `clips/arm-framefix/20.mp4`

모션 프롬프트 (shots.json 원문):

```
The camera slowly dollies forward toward the stall gap, revealing the motionless white-socked feet of the original girl.
```

번역: 카메라가 칸막이 아래 틈을 향해 천천히 달리 인 하며, 미동도 없는 원래 소녀의 흰 양말 신은 발을 드러낸다.

jobs.framefix.json 조각:

```json
{ "id": "ff_20_end", "task": "edit", "prompt": "Same camera, same scene, same lighting. The framing is now at the end point of the slow dolly-in: a low-angle close-up arrived right up at the narrow stall gap. Only the action has advanced to its end state: The motionless white-socked feet of the original girl are now clearly revealed in the stall gap. No camera movement beyond this end position.", "image": "arm-origin/frames/20.png", "aspect": "16:9", "out": "arm-framefix/frames/20_end.png" },
{ "id": "ff_20", "task": "i2v_se", "prompt": "The camera slowly dollies forward toward the stall gap, revealing the motionless white-socked feet of the original girl.", "image": "arm-origin/frames/20.png", "end_image": "arm-framefix/frames/20_end.png", "seconds": 4, "aspect": "16:9", "out": "clips/arm-framefix/20.mp4" }
```

---

## 4. 실행 스펙

### 4-1. 실행 순서

1. **전제 게이트**: ORIGIN 팔 시작 프레임 20장(`assets/arm-origin/frames/01.png`~`20.png`) 스테이징+QC 완료 확인. 누락·미완이면 착수 금지. shot_2가 ORIGIN에서 제외됐으면 이 팔의 `ff_02_end`·`ff_02`도 잡에서 뺀다(§2-6).
2. **jobs.framefix.json 조립**: 3장의 샷별 조각을 순서대로 이어붙여 배열로 만든다 (`tools/stage_framefix.mjs`가 자동화 — 아래 사양).
3. **끝 프레임 생성**: 디스패처 `--mode fal --only edit` (fal `openai/gpt-image-2/edit` 20콜).
4. **QC 게이트 1** (5장): 끝 프레임 20장 사람 검수. 탈락 샷은 동일 입력 재생성 후 재검수.
5. **영상 생성**: `higgsfield auth login` (short-lived 토큰) → `--dry-run`으로 크레딧 견적 확인 → 디스패처 `--mode higgsfield --only i2v_se`.
6. **이어붙임**: 편집 없음 — 샷 번호 순으로 그대로 concat (재정렬·트림·속도 조정 금지, ORIGIN과 동일 규칙).

3번과 5번을 한 번에 돌리지 않는 이유: 두 단계 사이에 QC 게이트(사람 검수)가 있고, 레인 고정 모드(`--mode fal` / `--mode higgsfield`)가 단계마다 다르기 때문이다.

### 4-2. tools/stage_framefix.mjs 사양 (사양만 — 구현은 실행 승인 후)

- 위치: `2026-07-24_full-copy-v2/tools/stage_framefix.mjs`
- 입력: `--assets <assets 경로>` `[--check-only]`
- 동작:
  1. `arm-origin/frames/01.png`~`20.png` 존재·0바이트 아님 검증. 누락 시 목록 출력 후 종료코드 1 (ORIGIN 의존성 게이트).
  2. `jobs.framefix.json` 생성 — 본 설계도 3장의 조각과 문자열이 정확히 일치해야 한다(설계도가 정본, diff 발생 시 중단). shot_2 제외가 확정된 경우 `ff_02_end`·`ff_02` 두 항목을 뺀 버전을 생성하고 그 사실을 stdout에 기록.
  3. (끝 프레임 생성 후 재실행 시) `arm-framefix/frames/NN_end.png` 존재·0바이트 검증 + QC 대기 목록 출력.
- **금지**: fal/higgsfield API 직접 호출 구현 금지 — 생성은 전부 공용 디스패처 경유 (CONVENTIONS 규칙 3-1: 실험별 생성 스크립트 복붙 금지).

### 4-3. 디스패처 커맨드 (레포 루트에서)

```bash
# 0) 견적 (과금 없음)
node research/experiments/utils/tools/gen/dispatch.mjs \
  --jobs research/experiments/continuity-copy/2026-07-24_full-copy-v2/jobs.framefix.json \
  --assets research/experiments/continuity-copy/2026-07-24_full-copy-v2/assets \
  --mode higgsfield --only i2v_se --dry-run

# 1) 끝 프레임 — fal 레인 고정 (FAL_KEY는 .env.local에서 주입)
node --env-file=.env.local \
  research/experiments/utils/tools/gen/dispatch.mjs \
  --jobs research/experiments/continuity-copy/2026-07-24_full-copy-v2/jobs.framefix.json \
  --assets research/experiments/continuity-copy/2026-07-24_full-copy-v2/assets \
  --mode fal --only edit

# (QC 게이트 1 통과 후)
# 2) 영상 — 힉스필드 레인 고정 (사전: higgsfield auth login)
node research/experiments/utils/tools/gen/dispatch.mjs \
  --jobs research/experiments/continuity-copy/2026-07-24_full-copy-v2/jobs.framefix.json \
  --assets research/experiments/continuity-copy/2026-07-24_full-copy-v2/assets \
  --mode higgsfield --only i2v_se
```

resume은 디스패처의 `gen_state.json`이 처리한다(완료분 skip → 재과금 방지). QC 탈락 샷 재생성은 해당 `NN_end.png`를 지우고(또는 gen_state에서 해당 키 제거) 1번 커맨드를 재실행하면 그 샷만 다시 돈다.

### 4-4. 예산 추정

| 항목 | 수량 | 추정 |
|---|---|---|
| 끝 프레임 i2i (fal `openai/gpt-image-2/edit`) | 20콜 | fal 달러 과금 (+QC 재생성 시 샷당 최대 3콜 추가 여지) |
| 영상 (힉스필드 Seedance 2.0) | 20클립 · 명목 합 74초 | 74초 × 4.6 ≈ **340크레딧** |

주의: Seedance는 duration 최소 4초·정수라 디스패처가 4초 미만 샷(3s·2s·2.5s, 총 10개 샷)을 4초로 클램프한다. 청구 기준 실초는 최대 86초 ≈ **396크레딧**이 상한. shot_2 제외 시 명목 70초(≈322크레딧), 클램프 상한 82초(≈377크레딧). ORIGIN 팔도 동일 클램프를 받으므로 팔 간 비교에는 영향 없음.

---

## 5. QC 게이트

### 게이트 1 — 끝 프레임 검수 (영상 착수 전, 20장 전수)

| # | 검수 항목 | 합격 기준 | 탈락 기준 |
|---|---|---|---|
| 1 | 카메라·공간 동일성 | 시작 프레임과 같은 카메라 위치·화각·공간. 무브 샷(08·17·20)은 **종착 구도** 기준 — 지시된 방향(달리 인 = 더 타이트, 트래킹 = 등 뒤 거리 유지)으로만 변했는가 | 구도 이탈(프레이밍 밀림·화각 변화·공간 왜곡) = 재생성 |
| 2 | 신원 유지 | 인물의 머리 모양·의상·체형이 시작 프레임과 동일 인물로 보임. 무인 샷(01·04·07·10·19)은 공간·소품 동일성으로 대체 | 다른 사람으로 보임·의상 변형 = 재생성 |
| 3 | 동작 종착 상태 | 끝 상태 문장이 서술한 종착이 실제로 보임. 무동작 샷(04·07·11·13·16)은 반대로 "시작과 거의 동일"이 합격 조건 | 시작 상태 그대로(동작 미진행), 종착을 지나쳐 다음 샷 시작처럼 보임, 무동작 샷의 과잉 변화 = 재생성 |

**탈락 처리 원칙**: 동일 입력 재생성 — 같은 참조 프레임, 같은 프롬프트 전문으로 다시 돌린다. 프롬프트 수정 금지(수정하면 팔 정의가 문서와 어긋난다). 재시도 상한 3회(제안값) — 초과 시 해당 샷을 기록하고 오너 에스컬레이션.

### 게이트 2 — 클립 배선 스팟체크 (참고)

영상 생성 직후 무작위 3샷의 클립 첫 프레임·끝 프레임을 추출해 `image`·`end_image` 입력이 실제로 반영됐는지 확인한다(못박기 배선 검증용 — 본 실험의 연출 품질 판정과는 별개).

---

## 열어둔 결정

1. **무동작 샷의 끝 프레임 생성 방식**: 샷 04·07·11·13·16처럼 종착 = 시작 유지인 샷은 i2i 대신 시작 프레임 파일을 그대로 복사하는 대안이 있다(비용 절감 + i2i 신원 드리프트 원천 차단). 현재 설계는 프로토콜 균일성(20샷 전부 신규 i2i)을 우선했다. 오너 판단 필요.
2. **QC 재시도 상한 3회**는 제안값 — 오너 확정 필요.
3. 다음 항목은 이 문서 저작자의 재량 결정으로, 문서에 근거를 남겼다(오너가 뒤집으면 해당 샷 프롬프트만 교체): 무인 샷의 `same person`→`same scene` 치환(패턴 A′), 무브 샷 3개의 프레이밍 절 치환(패턴 B), handheld_drift의 구도 고정 취급(§2-4).
