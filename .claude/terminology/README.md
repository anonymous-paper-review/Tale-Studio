# Tale Studio 용어 위키 (Terminology Wiki)

> 이 위키는 `tale-sutio` 코드베이스에 흩어진 도메인 용어를 한곳에 모아 정리한 문서입니다.
> **권위 있는 소스(authoritative source)** 는 `src/types/*.ts`와 `databases/migrations/*.sql`이며,
> 이 문서는 그것을 사람이 읽기 쉽게 매핑·정리한 것입니다. 코드와 문서가 다르면 코드가 맞습니다.

마지막 갱신: 2026-06-04 (코드 기반 자동 추출)

---

## 0. 프로젝트 한 줄 요약

Tale Studio는 **텍스트 스토리 → 영상**으로 변환하는 AI 영상 제작 파이프라인입니다.
5개 제작 단계(Stage)를 거칩니다:

```
Producer → Writer → Artist → Director → Editor
(설정)     (씬/샷)   (에셋)    (캔버스/영상)  (편집)
```

`StageId = 'producer' | 'writer' | 'artist' | 'director' | 'editor'` (`src/types/project.ts`)

---

## 1. 핵심 개념 위키 (Concept Pages)

| 개념 | 문서 | 한 줄 정의 |
|---|---|---|
| 씬 (Scene) | [[scene]] → `concepts/scene.md` | 스토리를 나눈 서사 단위. Writer가 생성 |
| 샷 (Shot) | [[shot]] → `concepts/shot.md` | 씬 안의 단일 카메라 컷. 카메라/조명/대사 포함 |
| 이미지 (Image) | [[image]] → `concepts/image.md` | 씬이미지/샷이미지/생성이미지/레퍼런스이미지 구분 |
| 레퍼런스 (Reference) | [[reference]] → `concepts/reference.md` | **레퍼런스 이미지** vs **레퍼런스 에셋**의 차이 |
| 에셋 (Asset) | [[asset]] → `concepts/asset.md` | 등록된 재사용 캐릭터/월드 (Asset Storage) |
| 비디오 (Video) | [[video]] → `concepts/video.md` | 샷으로부터 생성된 영상 클립과 테이크 |

부속 문서:
- [[relationships]] → `relationships.md` — 개념 간 계층/관계도
- [[glossary]] → `glossary.md` — 한국어 ↔ 영어 ↔ 코드 식별자 빠른 사전
- [[conflicts]] → `conflicts.md` — **이름은 같은데 뜻/타입이 다른 충돌 목록 (중요)**

---

## 2. 한눈에 보기 — 마스터 매핑 표

같은 개념이 레이어(Writer 데이터 / Director 캔버스 / DB 테이블)마다 어떻게 불리는지:

| 개념 | Writer 데이터 모델 | Director 캔버스 노드 | DB 테이블 | 사용자 UI 라벨 |
|---|---|---|---|---|
| 씬 | `Scene` (`scene.ts`) | `SceneNodeData` (kind `'scene'`) | `scenes` | "씬", "Scene 라벨" |
| 샷 | `Shot` (`shot.ts`) | `ShotNodeData` (kind `'shot'`) | `shots` | "샷", "Shot 라벨" |
| 영상 | `VideoClip` (`shot.ts`) | `VideoNodeData` (kind `'video'`) | `video_clips` | (영상 노드) |
| 캐릭터 | `Character` (`scene.ts`) / `CharacterAsset` (`asset.ts`) | actor 노드 | `characters` | "캐릭터", "에셋", "actor" |
| 장소/월드 | `Location` (`scene.ts`) / `WorldAsset` (`asset.ts`) | world 노드 | `locations` | "Location (장소)", "world" |

> ⚠️ 한 개념에 3~4개 이름이 붙는 게 정상입니다(레이어가 다름). 문제는 [[conflicts]]에 정리된 **같은 이름 다른 뜻** 케이스입니다.

---

## 3. 이 위키 읽는 순서 (추천)

1. [[relationships]] 로 전체 그림(Project → Scene → Shot → Video) 파악
2. [[reference]] 와 [[image]] 로 가장 혼란스러운 "레퍼런스/이미지" 영역 정리
3. [[conflicts]] 로 현재 코드에 남아있는 네이밍 충돌 확인
4. 필요할 때 [[glossary]] 로 개별 용어 검색

---

## 4. 유지보수 규칙

- 새 타입/컬럼을 추가하면 해당 concept 문서와 [[glossary]]에 한 줄 추가합니다.
- 식별자 이름은 **코드에서 verbatim**으로 복사합니다(추론·의역 금지).
- 충돌을 새로 발견하면 [[conflicts]]에 기록합니다(이 위키는 코드를 바꾸지 않고 사실만 기록).
