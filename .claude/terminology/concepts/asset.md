# 에셋 (Asset) — Asset Storage

← 돌아가기: [[README]] · 관련: [[reference]] [[scene]] [[image]] [[conflicts]]

## 정의

**에셋(Asset)** 은 Artist 단계의 **Asset Storage**에 **등록된 재사용 가능한 디자인 객체**입니다.
두 종류가 있습니다: **캐릭터 에셋**과 **월드 에셋**. 등록된 에셋은 [[shot]]에서 ID로 참조됩니다.

> 에셋과 "레퍼런스 이미지"의 차이는 [[reference]]에서 다룹니다(에셋 = 등록된 재사용 단위).

---

## 1. 캐릭터 에셋 — `CharacterAsset` (`src/types/asset.ts`)

| 필드 | 타입 | 의미 |
|---|---|---|
| `characterId` | `string` | 식별자 |
| `name` | `string` | 이름 |
| `views` | `CharacterView` | 다각도 뷰 이미지 모음 |
| `locked` | `boolean` | 잠금 여부 |

**`CharacterView`** — 5개 뷰:
`front`, `side`, `back`, `threeQuarterLeft`, `threeQuarterRight` (각 `string | null`)
(키 타입: `CharacterViewKey`)

> ⚠️ **DB 불일치**: `characters` 테이블에는 `view_front`, `view_side`, `view_back` **3개 컬럼만** 있습니다.
> `threeQuarterLeft` / `threeQuarterRight`는 DB에 영속화되지 않습니다. → [[conflicts]] 3번.

DB `characters` 테이블 주요 컬럼: `character_id`, `name`, `role`, `description`, `fixed_prompt`,
`locked`, `view_front`, `view_side`, `view_back`, `project_id`.

---

## 2. 월드 에셋 — `WorldAsset` (`src/types/asset.ts`)

| 필드 | 타입 | 의미 |
|---|---|---|
| `locationId` | `string` | 장소 식별자 (Location과 공유) |
| `name` | `string` | 이름 |
| `sceneId` | `string` | 연관 씬 |
| `wideShot` | `string \| null` | 와이드샷 이미지 ("씬이미지"로 흔히 부름) |
| `establishingShot` | `string \| null` | 설정샷 이미지 |

DB `locations` 테이블: `location_id`, `name`, `visual_description`, `time_of_day`,
`lighting_direction`, `wide_shot`, `establishing_shot`, `scene_id`, `project_id`.

---

## 3. 같은 개념, 세 가지 이름 (캐릭터/장소) ⚠️

이 프로젝트에서 가장 헷갈리는 지점입니다. 동일 대상이 단계마다 다르게 불립니다:

| 실제 대상 | Writer (`scene.ts`) | Artist 에셋 (`asset.ts`) | Artist 캔버스 노드 kind |
|---|---|---|---|
| 등장인물 | `Character` | `CharacterAsset` | `'actor'` |
| 장소/배경 | `Location` | `WorldAsset` | `'world'` |

> 즉 **Location = WorldAsset = world 노드**, **Character = CharacterAsset = actor 노드** 입니다.
> 특히 "Location"이 에셋/캔버스에선 "World/world"로 바뀌고, "Character"가 캔버스에선 "actor"로 바뀝니다.
> → [[conflicts]] 4번·5번.

---

## 4. 에셋 등록(Registration)

Artist 단계 UI 개념:
- "등록" = `registerCharacter()` 호출로 Asset Storage에 영속화
- "등록까지 N장 더 필요" = 등록 자격 이미지 수 임계값 (`REGISTRATION_IMAGE_THRESHOLD`)
- 생성 모드(`outputMode`): `'single' | 'five-view' | 'sixteen-angle'`
- 생성 모델(`modelId`): `'imagen' | 'h100-self'`

→ 샷이 에셋을 참조하는 방법은 [[shot]]의 `characterAssetIds` / `worldAssetIds` 참고.
