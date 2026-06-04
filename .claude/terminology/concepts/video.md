# 비디오 (Video) — 클립과 테이크

← 돌아가기: [[README]] · 관련: [[shot]] [[image]] [[relationships]] [[conflicts]]

## 정의

**비디오 클립(VideoClip)** 은 [[shot]](샷)으로부터 생성된 **영상 결과물**입니다.
한 샷은 여러 번 생성될 수 있고, 그 각각을 **테이크(take)** 라 부릅니다. 그중 하나가 **최종(final)** 으로 선택됩니다.

---

## 레이어별 표현

### 1. 데이터 모델 — `VideoClip` (`src/types/shot.ts`)
| 필드 | 타입 | 의미 |
|---|---|---|
| `shotId` | `string` | 소속 샷 |
| `url` | `string \| null` | 영상 URL |
| `status` | `'pending'｜'generating'｜'completed'｜'failed'` | 생성 상태 |
| `thumbnailUrl` | `string \| null` | 썸네일 → [[image]] |
| `trimStart` / `trimEnd` | `number` | Editor 트림 구간(초) |
| `speed` | `number` | 0.25~4.0 배속 |

### 2. Director 캔버스 노드 — `VideoNodeData` (`src/types/director-canvas.ts`)
`kind: 'video'`.

| 필드 | 타입 | 의미 |
|---|---|---|
| `parentShotNodeId` | `string` | 부모 샷 노드 |
| `override` | `VideoOverride` | 부모 샷 대비 덮어쓴 값 (`prompt?`, `camera?`, `lighting?`, `cameraPreset?`, `provider?`) |
| `videoUrl` | `string \| null` | 영상 URL |
| `thumbnailUrl` | `string \| null` | 썸네일 |
| `status` | `DirectorVideoStatus` | `'pending'｜'generating'｜'completed'｜'failed'` |
| `final` | `boolean` | 샷당 하나만 true (최종 선택) |
| `stale` | `boolean` | 상위 변경으로 재생성 필요 |

`DirectorVideoProvider`: `'kling' | 'veo' | 'local'`

### 3. DB 테이블 — `video_clips`
| 컬럼 | 비고 |
|---|---|
| `shot_id`, `url`, `status`, `duration`, `storage_path` | |
| `thumbnail_url`, `thumbnail_path` | 썸네일 |
| `is_final` (BOOLEAN) | `VideoNodeData.final`에 대응 (인덱스 `idx_video_clips_shot_final`) |
| `take_label` (TEXT) | 예: `'take_v1'` — 샷 내 테이크 순번 |
| `override` (JSONB) | `VideoOverride` |
| `canvas_position` (JSONB) | 영상 노드 좌표 |

---

## 테이크(Take) 개념

- 한 [[shot]]에 여러 영상 시도 = 여러 테이크. DB `take_label`(예: `take_v1`)로 구분.
- Director chat 작업: `addVideoTake`, `generateVideo`.
- `is_final` / `final`로 샷당 최종본 1개 지정.

> ⚠️ TS `VideoNodeData.final` / `stale` vs DB `is_final`(+ stale 컬럼 없음) 네이밍 차이 → [[conflicts]] 7번.

---

## Editor 단계에서의 영상

Editor는 영상 클립을 편집합니다 (`src/types/shot.ts`의 `trimStart/trimEnd/speed`):
- `PATCH /api/editor/reorder` — `clipOrder[]`로 `sort_order` 갱신
- `PATCH /api/editor/trim` — `trimStart`, `trimEnd`
- `PATCH /api/editor/speed` — `speed`
- `POST /api/editor/render-draft` — `clipOrder`로 플레이리스트 렌더

→ 전체 흐름은 [[relationships]] 2절 참고.
