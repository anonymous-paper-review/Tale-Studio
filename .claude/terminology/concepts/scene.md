# 씬 (Scene)

← 돌아가기: [[README]] · 관련: [[shot]] [[image]] [[relationships]] [[conflicts]]

## 정의

**씬(Scene)** 은 스토리를 나눈 **서사 단위**입니다. Writer 단계에서 `story_text`를 분해해 생성하며,
하나의 씬은 여러 [[shot]](샷)으로 쪼개집니다.

> "씬의 정의"란 결국 `Scene` 타입의 필드 집합 + 그것이 어느 레이어에 있는지를 말합니다.
> 같은 "씬"이라도 아래 3개 레이어로 존재합니다.

---

## 레이어별 표현 (같은 "씬"의 세 얼굴)

### 1. Writer 데이터 모델 — `Scene` (`src/types/scene.ts`)
서사 정보의 원본(source of truth).

| 필드 | 타입 | 의미 |
|---|---|---|
| `sceneId` | `string` | 씬 식별자 |
| `narrativeSummary` | `string` | 씬 줄거리 요약 |
| `originalTextQuote` | `string` | 원본 스토리에서 인용한 구절 |
| `location` | `string` | 장소 (텍스트) |
| `timeOfDay` | `string` | 시간대 |
| `mood` | `string` | 분위기 |
| `charactersPresent` | `string[]` | 등장 캐릭터 |
| `estimatedDurationSeconds` | `number` | 예상 길이(초) |

`Scene`들은 `SceneManifest { scenes, characters, locations }` 컨테이너에 담깁니다.

### 2. Director 캔버스 노드 — `SceneNodeData` (`src/types/director.ts`)
캔버스에 배치되는 씬 노드. `kind: 'scene'`.

| 필드 | 타입 | 의미 |
|---|---|---|
| `writerSceneId` | `string \| null` | 위 `Scene.sceneId` 역참조 (끊길 수 있음) |
| `label` | `string` | 노드 표시 이름 |
| `location` / `timeOfDay` / `mood` | `string` | 캔버스에서 편집되는 사본 |
| `description` | `string` | 씬 설명 (UI: "씬 설명") |

### 3. DB 테이블 — `scenes` (`databases/migrations`)
| 컬럼 | 비고 |
|---|---|
| `scene_id` (TEXT) | `Scene.sceneId`에 대응 |
| `narrative_summary`, `original_text_quote`, `location`, `time_of_day`, `mood` | 1:1 매핑 |
| `characters_present` (TEXT[]) | |
| `estimated_duration_seconds` (NUMERIC) | |
| `sort_order` (NUMERIC) | 씬 정렬 순서 |
| `canvas_position` (JSONB) | Director 캔버스상의 {x, y} 좌표 |
| `project_id` (UUID, FK) | `projects.id` |

---

## "씬이미지"는 무엇인가?

⚠️ 코드에 `sceneImage`라는 직접 식별자는 **없습니다**. "씬이미지"는 개념어이며,
실제로는 보통 다음 중 하나를 가리킵니다:

- 그 씬의 **장소를 보여주는 이미지** → [[asset]]의 `WorldAsset.wideShot` / `establishingShot`
- 캔버스 씬 노드에 붙은 참고 이미지 → [[reference]]

→ 이미지 종류 전체 구분은 [[image]] 참고.

---

## 네이밍 주의

- 코드: `Scene` / `sceneId` / `SceneNodeData` / `scenes`(테이블) — 일관됨 ✅
- UI 라벨은 "씬"과 "Scene"이 혼용됩니다(예: "씬 설명" vs "Scene 라벨"). → [[glossary]]
- `Scene`(Writer) ↔ `SceneNodeData`(캔버스)는 **별개 객체**이고 `writerSceneId`로만 연결됩니다. 동일시 금지.
