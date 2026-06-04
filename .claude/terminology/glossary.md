# 용어 사전 (Glossary) — 한국어 ↔ 영어 ↔ 코드 식별자

← 돌아가기: [[README]]

> 빠른 검색용 사전. 식별자는 코드에서 verbatim. 상세는 각 concept 문서 링크 참고.

## 단계 (Stage)
| 한국어 | 코드 | 산출물 |
|---|---|---|
| 프로듀서 | `'producer'` | `ProjectSettings` |
| 라이터/작가 | `'writer'` | `SceneManifest`, `Shot[]` |
| 아티스트 | `'artist'` | `CharacterAsset`, `WorldAsset` |
| 디렉터/감독 | `'director'` | Director Canvas, `VideoClip` |
| 에디터 | `'editor'` | clipOrder, trim, speed |

(`StageId`, `src/types/project.ts`)

## 핵심 엔티티
| 한국어 | 영어 | 데이터 타입 | 캔버스 노드 | DB 테이블 | 문서 |
|---|---|---|---|---|---|
| 프로젝트 | Project | `Project` | — | `projects` | — |
| 씬 | Scene | `Scene` | `SceneNodeData` | `scenes` | [[scene]] |
| 샷 | Shot | `Shot` | `ShotNodeData` | `shots` | [[shot]] |
| 영상 클립 | Video Clip | `VideoClip` | `VideoNodeData` | `video_clips` | [[video]] |
| 캐릭터 | Character / Actor | `Character` / `CharacterAsset` | `'actor'` 노드 | `characters` | [[asset]] |
| 장소/월드 | Location / World | `Location` / `WorldAsset` | `'world'` 노드 | `locations` | [[asset]] |
| 매니페스트 | Manifest | `SceneManifest` | — | — | [[scene]] |
| 기법 | Technique | `KnowledgeTechnique` | — | `knowledge_techniques` | — |

## 이미지 / 레퍼런스
| 한국어 (UI) | 코드 식별자 | 타입 | 문서 |
|---|---|---|---|
| 샷이미지, 스토리보드 이미지 | `storyboardImage` (ShotNode) / `StoryboardImage` / DB `storyboard_image` | I2I 생성, 샷당 1장 | [[shot]] [[image]] |
| 영상 생성 방식 | `generationMethod` (Shot/ShotNode) / DB `generation_method` | `T2V\|I2V` | [[shot]] |
| 레퍼런스, 참고 이미지(사용자 업로드) | `referenceImages` (ShotNode) | `DirectorReferenceImage[]` | [[reference]] |
| (캐릭터) 레퍼런스 | `referenceImages` (Character) | `string[]` | [[reference]] |
| (샷) 참고 이미지 | `referenceImageUrl` (Shot) | `string\|null` | [[reference]] |
| 생성된 이미지 | `generatedImages` | `[]` | [[image]] |
| 누적 이미지 | `countImagesInSubtree()` | fn | [[image]] |
| 씬이미지(개념) | `WorldAsset.wideShot/establishingShot` | `string\|null` | [[image]] |
| 캐릭터 뷰 | `CharacterView` (5뷰) | front/side/back/threeQuarterLeft/threeQuarterRight | [[asset]] |
| 썸네일 | `thumbnailUrl` | `string\|null` | [[video]] |

## 샷 세부 (`src/types/shot.ts`)
| 한국어 | 코드 | 값 |
|---|---|---|
| 샷 타입 | `ShotType` | ECU/CU/MCU/MS/MFS/FS/WS/EWS/OTS/POV/TRACK/2S |
| 생성 방식 | `GenerationMethod` | T2V / I2V |
| 카메라(6축) | `CameraConfig` | horizontal/vertical/pan/tilt/roll/zoom |
| 조명 | `LightingConfig` | position/brightness/colorTemp |
| 카메라 프리셋 | `CameraPreset` | brand/focalLength/aperture/whiteBalance |
| 대사 | `DialogueLine` | characterId/text/emotion/delivery/durationHint |

## 캔버스 (`src/types/director-canvas.ts`)
| 한국어 | 코드 | 값 |
|---|---|---|
| 노드 종류 | `DirectorNodeKind` | scene / shot / video |
| 엣지 종류 | `DirectorEdgeCategory` | parent / relates-to |
| 영상 상태 | `DirectorVideoStatus` | pending/generating/completed/failed |
| 영상 제공자 | `DirectorVideoProvider` | kling / veo / local |
| 부모 씬 노드 | `parentSceneNodeId` | — |
| 부모 샷 노드 | `parentShotNodeId` | — |
| 원본 씬 링크 | `writerSceneId` | nullable |
| 원본 샷 링크 | `writerShotId` | nullable |
| 최종 영상 | `final` (TS) / `is_final` (DB) | boolean |
| 재생성 필요 | `stale` | boolean |
| 테이크 | `take_label` (DB) | 예: take_v1 |
| 오버라이드 | `VideoOverride` | prompt?/camera?/lighting?/cameraPreset?/provider? |

## Artist 캔버스/UI
| 한국어 (UI) | 코드 | 값 |
|---|---|---|
| 출력 모드 | `outputMode` | single / five-view / sixteen-angle |
| 생성 모델 | `modelId` | imagen / h100-self |
| 등록 | `registerCharacter()` | — |
| 등록 임계값 | `REGISTRATION_IMAGE_THRESHOLD` | — |
| 관계 정의 (메모) | `relationText` | — |
| 상속 | `'parent'` 엣지 | — |
| 배치 | `'in-world'` 엣지 | — |
| 관계(내러티브) | `'references'` 엣지 | — |

> 여기에 없는 충돌/주의 항목은 [[conflicts]] 참고.
