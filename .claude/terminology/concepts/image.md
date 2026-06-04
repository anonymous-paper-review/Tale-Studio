# 이미지 (Image) — 종류 구분

← 돌아가기: [[README]] · 관련: [[reference]] [[asset]] [[shot]] [[scene]] [[video]]

이미지는 가장 표현이 흩어진 영역입니다. 코드에 등장하는 모든 "이미지"를 **역할별로** 분류합니다.

---

## 분류표

| 사용자가 부르는 말 | 실제 역할 | 코드상 표현 | 위치 |
|---|---|---|---|
| 샷이미지 / 스토리보드 이미지 | **I2I로 생성한 샷당 1장 대표 이미지** (I2V 기본 레퍼런스) | `StoryboardImage`, `ShotNodeData.storyboardImage`, DB `shots.storyboard_image` | [[shot]] |
| 레퍼런스 이미지 / 참고 이미지 | 사용자가 **직접 업로드**한 보조 참고 이미지 (생성물 아님) | `referenceImages`, `referenceImageUrl`, `DirectorReferenceImage` | [[reference]] |
| 씬이미지 (개념어) | 장소를 보여주는 이미지 | `WorldAsset.wideShot` / `establishingShot` | [[asset]], [[scene]] |
| 생성된 이미지 | Artist가 생성한 결과물 | `generatedImages[]` | Artist (API/UI) |
| 누적 이미지 | 노드 서브트리 이미지 총합 | `countImagesInSubtree()` | Artist UI |
| 캐릭터 뷰 이미지 | 캐릭터 다각도 레퍼런스 | `CharacterView` (front/side/back/...) | [[asset]] |
| 썸네일 | 영상 미리보기 | `thumbnailUrl` / `thumbnail_url` / `thumbnail_path` | [[video]] |

> ✅ **"샷이미지"는 정식 타입 `StoryboardImage`입니다** (결정 #36/#37, 마이그레이션 006).
> 시스템이 I2I로 생성한 샷 대표 이미지이며, 사용자가 올리는 `referenceImages`(보조 참고)와 **의미상 분리**됩니다.
> 반면 "씬이미지"는 여전히 코드 식별자가 아닌 개념어입니다(실제로는 `WorldAsset` 이미지).

---

## 0. 샷이미지 = 스토리보드 이미지 (출력 — I2I 생성, 샷당 1장)
시스템이 연결된 actor+world 에셋 이미지 + 샷 프롬프트를 결합해 **I2I로 생성**한 샷 대표 이미지.
이 이미지가 그 샷의 **I2V 영상 생성 기본 레퍼런스**가 됩니다 (결정 #36/#37). → 상세 [[shot]].

```ts
// director-canvas.ts
export type StoryboardImage = {
  url: string
  status: DirectorVideoStatus   // 'pending'|'generating'|'completed'|'failed'
  errorMessage: string | null
  generatedAt: number
}
// ShotNodeData.storyboardImage: StoryboardImage | null   (null = 미생성)
```
- DB: `shots.storyboard_image` (JSONB), 영상방식은 `shots.generation_method` (T2V/I2V)
- ⚠️ **레퍼런스 이미지(아래 1번)와 다름**: 샷이미지=시스템 생성, 레퍼런스=사용자 업로드.

## 1. 레퍼런스 이미지 (입력 — 사용자 업로드 보조 참고)
사용자가 직접 올리는 보조 참고 이미지 (**생성물 아님**, 결정 #37). → 상세 [[reference]].
- `Character.referenceImages: string[]`
- `Shot.referenceImageUrl: string | null` (단수)
- `ShotNodeData.referenceImages: DirectorReferenceImage[]` (복수 객체)

## 2. 에셋 이미지 (등록된 디자인)
에셋에 영속화된 이미지. → 상세 [[asset]].
- 캐릭터: `CharacterView.front/side/back/threeQuarterLeft/threeQuarterRight`
  (DB: `view_front`, `view_side`, `view_back` — 3개만)
- 월드: `WorldAsset.wideShot`, `WorldAsset.establishingShot`
  (DB: `wide_shot`, `establishing_shot`)

## 3. 생성된 이미지 (출력 — Artist)
Artist 노드가 프롬프트로 만들어낸 결과 이미지.
- API/UI: `generatedImages[]` (노드별 컬렉션)
- UI 라벨: "생성된 이미지", "누적 이미지"(`countImagesInSubtree()`)
- 생성 엔드포인트: `POST /api/generate/image` (`prompt`, `aspectRatio`, `provider`)
- 업로드: `POST /api/assets/upload-image`

## 4. 영상 썸네일 (영상의 대표 프레임)
영상 클립의 미리보기 이미지. → [[video]].
- `VideoClip.thumbnailUrl`, DB `thumbnail_url` / `thumbnail_path`

---

## 입력 vs 출력 관점 요약

```
입력 이미지 (참고)              처리                  출력 이미지 (생성)
─────────────────              ────                  ─────────────────
referenceImages(사용자업로드) →  Artist 생성        →  generatedImages
에셋 뷰 (등록됨) + 프롬프트    →  Director I2I       →  storyboardImage (샷이미지)
storyboardImage / 레퍼런스    →  Director I2V       →  VideoClip + thumbnail
```

용어가 흩어진 자세한 충돌은 [[conflicts]] 참고.
