# 레퍼런스 (Reference) — 이미지 vs 에셋

← 돌아가기: [[README]] · 관련: [[asset]] [[image]] [[shot]] [[conflicts]]

이 문서는 사용자가 가장 혼동한다고 지목한 **레퍼런스 이미지** vs **레퍼런스 에셋**을 구분합니다.

> 추가 구분: **레퍼런스 이미지(사용자 업로드)** ≠ **샷이미지(`storyboardImage`, 시스템 I2I 생성)**.
> 결정 #37에서 둘을 의미상 분리했습니다. 샷이미지는 [[shot]]·[[image]] 참고.

---

## 한 줄 구분

| | 레퍼런스 이미지 (Reference Image) | 레퍼런스 에셋 (Reference Asset) |
|---|---|---|
| 정체 | 그 노드/샷에만 붙인 **임시 참고 이미지** | Asset Storage에 **등록된 재사용 객체** |
| 형태 | 이미지 URL (혹은 URL 묶음) | 구조화된 엔티티 (`CharacterAsset` / `WorldAsset`) |
| 참조 방식 | 이미지 자체를 직접 들고 있음 | **ID로 가리킴** (`characterAssetIds`, `worldAssetIds`) |
| 수명 | 일회성, 그 샷 한정 | 프로젝트 전역, 여러 샷이 공유 |
| 관련 문서 | 이 문서 + [[image]] | [[asset]] |

> 핵심: **이미지 = 첨부 파일**, **에셋 = 등록된 캐릭터/장소**. 에셋도 내부에 이미지를 갖지만,
> "레퍼런스 에셋"은 그 이미지 묶음 + 메타데이터를 가진 **재사용 단위**라는 점이 다릅니다.

---

## 레퍼런스 이미지 — 코드상 표현 (3곳, 서로 다름 ⚠️)

모두 **사용자가 직접 업로드**한 보조 참고 이미지입니다(생성물 아님 — 결정 #37).

| 위치 | 식별자 | 타입 | 비고 |
|---|---|---|---|
| `Character` (`scene.ts`) | `referenceImages` | `string[]` | URL 문자열 배열 |
| `Shot` (`shot.ts`) | `referenceImageUrl` | `string \| null` | **단수, 1장만** |
| `ShotNodeData` (`director.ts`) | `referenceImages` | `DirectorReferenceImage[]` | **객체 배열** (사용자 업로드) |

**`DirectorReferenceImage`** (`director.ts`):
```
{ id: string; url: string; uploadedAt: number }
```

> ⚠️ `referenceImages`라는 **이름이 두 곳에 있는데 타입이 다릅니다**(`string[]` vs `DirectorReferenceImage[]`).
> 또 `Shot`만 단수형 `referenceImageUrl`을 씁니다. → [[conflicts]] 1번·2번 항목.

UI 라벨: "레퍼런스", "참고 이미지" → 모두 `ShotNodeData.referenceImages`에 매핑
(`features/director/canvas-popups/ShotNodePopup.tsx`).

---

## 레퍼런스 에셋 — 코드상 표현

에셋은 [[asset]]에서 상세히 다룹니다. 요약:

| 에셋 종류 | 타입 | 내부 이미지 필드 | 샷에서 참조하는 ID 필드 |
|---|---|---|---|
| 캐릭터 에셋 | `CharacterAsset` | `views` (front/side/back/threeQuarterLeft/threeQuarterRight) | `ShotNodeData.characterAssetIds` |
| 월드 에셋 | `WorldAsset` | `wideShot`, `establishingShot` | `ShotNodeData.worldAssetIds` |

에셋은 Artist 단계에서 충분한 이미지가 모이면 **"등록"** 됩니다 (UI: "등록", "등록까지 N장 더 필요";
임계값 `REGISTRATION_IMAGE_THRESHOLD`, `registerCharacter()`).

---

## 의사결정 가이드 (어느 걸 써야 하나)

- "이 샷에 이 그림 느낌으로" 한 번 쓰고 버릴 이미지 → **레퍼런스 이미지** (`referenceImages`)
- "이 캐릭터/이 장소는 항상 이 디자인" 재사용 → **레퍼런스 에셋** 등록 후 `*AssetIds`로 참조

→ 더 큰 그림은 [[relationships]] 4절 참고.
