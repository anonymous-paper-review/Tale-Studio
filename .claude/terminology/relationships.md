# 개념 관계도 (Relationships)

← 돌아가기: [[README]]

## 1. 전체 계층 (데이터 모델 기준)

```
Workspace (workspaces)
└── Project (projects)              ← 최상위. story_text, settings, current_stage 보유
    ├── SceneManifest               ← Writer 산출물 컨테이너
    │   ├── Scene[]   (scenes)      ← 서사 단위
    │   ├── Character[] (characters)← 등장인물
    │   └── Location[] (locations)  ← 장소
    ├── Shot[] (shots)              ← 씬에 속한 카메라 컷 (scene_id로 연결)
    └── VideoClip[] (video_clips)   ← 샷으로부터 생성된 영상 (shot_id로 연결)
```

소유 관계(DB 외래키, 전부 `project_id`로 묶임):

```
workspaces ──< projects ──< scenes
                        ──< shots       (논리적으로 shots.scene_id → scenes.scene_id)
                        ──< video_clips (논리적으로 video_clips.shot_id → shots.shot_id)
                        ──< characters
                        ──< locations
```

> 참고: `shots`, `video_clips`는 DB상 `project_id`로만 FK가 걸려 있고, `scene_id`/`shot_id`는
> 텍스트 컬럼으로 **논리적 연결**입니다(물리 FK 아님). 자세한 컬럼은 [[scene]], [[shot]], [[video]] 참고.

---

## 2. 제작 파이프라인 (Stage 흐름)

```
Producer ──→ Writer ──────→ Artist ────────→ Director ─────────→ Editor
설정 추출    씬/샷 분해      에셋 디자인        캔버스 연출/영상생성   영상 편집

산출물:
  Producer : ProjectSettings (playtime, genre, aspectRatio, toneStyle, dialogueLanguage)
  Writer   : SceneManifest (Scene/Character/Location) + Shot[]
  Artist   : CharacterAsset / WorldAsset  (Asset Storage에 "등록")
  Director : SceneNode/ShotNode/VideoNode (Director Canvas) → VideoClip
  Editor   : clipOrder 재정렬, trim, speed (최종 영상 시퀀스)
```

`StageConfig.nextStage`가 다음 단계를 가리키며, `handoffLabel`로 인계됩니다. (`src/types/project.ts`)

---

## 3. Writer 모델 ↔ Director 캔버스 연결

Director 캔버스 노드는 Writer가 만든 원본을 **참조**합니다(끊어질 수도 있어 nullable):

| 캔버스 노드 | 원본 참조 필드 | 가리키는 대상 |
|---|---|---|
| `SceneNodeData` | `writerSceneId: string \| null` | Writer의 `Scene.sceneId` |
| `ShotNodeData` | `writerShotId: string \| null` | Writer의 `Shot.shotId` |
| `ShotNodeData` | `parentSceneNodeId: string \| null` | 부모 `SceneNode` |
| `VideoNodeData` | `parentShotNodeId: string` | 부모 `ShotNode` |

캔버스 내부 엣지 종류 (`DirectorEdgeCategory`):
- `'parent'` — 계층 (Scene→Shot, Shot→Video)
- `'relates-to'` — 사용자가 정의한 서사적 관계

---

## 4. 에셋 ↔ 샷 연결 (Director)

`ShotNodeData`는 등록된 에셋을 **ID 배열**로 참조합니다:

```
ShotNodeData
├── characterAssetIds: string[]   → CharacterAsset.characterId 들
├── worldAssetIds: string[]       → WorldAsset.locationId 들
└── referenceImages: DirectorReferenceImage[]  → 자유 첨부 이미지 (에셋 아님)
```

> **핵심 구분**: 에셋 참조(`*AssetIds`)는 "등록된 재사용 객체를 가리키는 것"이고,
> `referenceImages`는 "그 샷에만 붙인 임시 참고 이미지"입니다. → [[reference]]

---

## 5. 개념별 상세 문서

- 씬: [[scene]]
- 샷: [[shot]]
- 영상: [[video]]
- 이미지 종류: [[image]]
- 레퍼런스: [[reference]]
- 에셋: [[asset]]
- 충돌 목록: [[conflicts]]
