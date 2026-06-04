# 샷 (Shot)

← 돌아가기: [[README]] · 관련: [[scene]] [[video]] [[reference]] [[image]] [[conflicts]]

## 정의

**샷(Shot)** 은 [[scene]](씬) 안의 **단일 카메라 컷**입니다. 카메라 설정, 조명, 대사, 연출 정보를 담으며,
하나의 샷은 하나 이상의 [[video]](영상 클립)로 생성됩니다.

> "샷의 정의" = `Shot` 타입의 필드 + 그 샷이 어느 레이어에 있는지.

---

## 레이어별 표현

### 1. Writer/Director 데이터 모델 — `Shot` (`src/types/shot.ts`)
| 필드 | 타입 | 의미 |
|---|---|---|
| `shotId` | `string` | 샷 식별자 |
| `sceneId` | `string` | 소속 씬 |
| `shotType` | `ShotType` | 샷 종류 (아래 참고) |
| `actionDescription` | `string` | 동작 묘사 |
| `characters` | `string[]` | 등장 캐릭터 |
| `durationSeconds` | `number` | 길이(초) |
| `generationMethod` | `GenerationMethod` | `'T2V'`(텍스트→영상) \| `'I2V'`(이미지→영상) |
| `dialogueLines` | `DialogueLine[]` | 대사 (characterId, text, emotion, delivery, durationHint) |
| `camera` | `CameraConfig` | Kling 6축 카메라 |
| `cameraPreset` | `CameraPreset \| undefined` | 실제 시네마 카메라 스펙 |
| `movementPreset` | `string \| null` | 카메라 무빙 프리셋 |
| `movementIntensity` | `number` | 무빙 강도 |
| `lighting` | `LightingConfig` | 조명 |
| `referenceImageUrl` | `string \| null` | ⚠️ **단수** 참고 이미지 1장 → [[reference]] |

**`ShotType`** (12종): `'ECU'｜'CU'｜'MCU'｜'MS'｜'MFS'｜'FS'｜'WS'｜'EWS'｜'OTS'｜'POV'｜'TRACK'｜'2S'`

**`CameraConfig`** (6축, 각 -10~+10): `horizontal, vertical, pan, tilt, roll, zoom`
**`LightingConfig`**: `position('left'|'top'|'right'|'front')`, `brightness(0-100)`, `colorTemp(2000-10000K)`
**`CameraPreset`**: `brand`, `focalLength(mm)`, `aperture(f-stop)`, `whiteBalance(Kelvin)`

### 2. Director 캔버스 노드 — `ShotNodeData` (`src/types/director-canvas.ts`)
`kind: 'shot'`.

| 필드 | 타입 | 의미 |
|---|---|---|
| `writerShotId` | `string \| null` | 위 `Shot.shotId` 역참조 |
| `parentSceneNodeId` | `string \| null` | 부모 씬 노드 |
| `prompt` | `string` | 영상 생성용 프롬프트 (UI: "프롬프트 (영상 생성용)") |
| `referenceImages` | `DirectorReferenceImage[]` | ⚠️ **사용자 업로드 보조 참고** (생성물 아님) → [[reference]] |
| `storyboardImage` | `StoryboardImage \| null` | **샷이미지**: I2I 생성 샷 대표 이미지 (샷당 1장, I2V 기본 레퍼런스) → [[image]] |
| `generationMethod` | `GenerationMethod` | `'T2V'｜'I2V'` (storyboardImage/레퍼런스 있으면 I2V) |
| `characterAssetIds` | `string[]` | 참조하는 [[asset]] 캐릭터 ID |
| `worldAssetIds` | `string[]` | 참조하는 [[asset]] 월드 ID |
| `camera` / `lighting` / `cameraPreset` | | Shot과 동일 구조 |
| `provider` | `DirectorVideoProvider` | `'kling'｜'veo'｜'local'` |
| `stale` | `boolean` | 상위 변경으로 재생성 필요 표시 |

**`StoryboardImage`** (`director-canvas.ts`, 결정 #36/#37):
```ts
{ url: string; status: DirectorVideoStatus; errorMessage: string | null; generatedAt: number }
```

### 3. DB 테이블 — `shots`
| 컬럼 | 비고 |
|---|---|
| `shot_id`, `scene_id`, `shot_type`, `action_description`, `characters`, `duration_seconds`, `generation_method`, `prompt` | 1:1 |
| `camera_config`, `lighting_config`, `dialogue_lines` (JSON) | 구조체 |
| `movement_preset`, `movement_intensity` | |
| `camera_brand`, `focal_length`, `aperture`, `white_balance` | `CameraPreset`을 **컬럼으로 평탄화** |
| `storyboard_image` (JSONB) | 샷이미지 `{url, status, errorMessage, generatedAt}` (마이그레이션 006) |
| `generation_method` (TEXT, default 'T2V') | 영상 생성 방식 T2V/I2V |
| `canvas_position` (JSONB) | 샷 노드 좌표 |
| `sort_order` | Editor 정렬에 사용 |

---

## "샷이미지"는 무엇인가?

✅ **"샷이미지" = `storyboardImage` (정식 타입 `StoryboardImage`)** 입니다 (결정 #36/#37, 마이그레이션 006).
시스템이 연결된 actor+world 에셋 이미지 + 샷 프롬프트를 결합해 **I2I로 생성**한 샷당 1장의 대표 이미지로,
그 샷의 **I2V 영상 생성 기본 레퍼런스**가 됩니다.

> ⚠️ 사용자가 직접 올리는 `referenceImages`(보조 참고, 생성물 아님)와 **반드시 구분**하세요.
> - 샷이미지(`storyboardImage`) = 시스템 I2I 생성, 샷당 1장
> - 레퍼런스(`referenceImages`) = 사용자 업로드, 여러 장 가능

→ 이미지 종류 전체는 [[image]], 레퍼런스 구분은 [[reference]] 참고.

## 네이밍 주의 (자세히는 [[conflicts]])

- `Shot.referenceImageUrl`(단수 string) vs `ShotNodeData.referenceImages`(복수 객체배열) — **이름·타입 불일치** ⚠️
- 캔버스에서 샷 한 개가 여러 영상 테이크를 가질 수 있음 → [[video]]
