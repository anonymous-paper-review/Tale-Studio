# Asset Storage — 인터페이스 계약

> Asset Storage = 등록 에셋 저장소. Artist 카드(캐릭터/월드)가 공급하고 Director Canvas가 소비한다.

## 역할

Artist 스테이지에서 생성·확정된 캐릭터/월드 에셋을 저장하고, Director Canvas가 씬·샷에 이미지 URL을 매핑할 때 소비하는 인터페이스 레이어.

## 계약

- **키 = 카드 ID**: `id === characterId` / `id === locationId`. 동일 카드 재등록은 멱등 (덮어쓰기).
- **진입 경로 = 어댑터 함수만**: `registerCharacterCard(asset, projectId)` / `registerWorldCard(asset, projectId)`. store 액션(`registerCharacter` / `registerWorld`)을 직접 호출하지 않는다.
- **DB가 진실, store는 캐시**: `characters` / `locations` 테이블이 원본. `hydrateFromDb(projectId)` 호출로 store를 동기화. 브라우저 초기 진입·타 기기·localStorage 비움 상황에서도 이미지 채워짐이 보장된다.
- **이미지 = Supabase Storage URL**: 인라인 base64 아님. `GeneratedImage.url` 필드에 URL 저장.
- **손실 필드**: 카드→등록 매핑에서 `alias`, `background`, `statusVariants`, `views.fiveView`, `views.sixteenAngle`은 빈 값. `sourceCanvasNodeId`는 카드 id로 채워짐 (노드 없음). 상세는 어댑터 주석 블록이 계약. 단, 현재 어댑터는 DB `view_*` 컬럼에서 `views.fiveView`를 채우며 export는 DB `view_*` 컬럼을 소스로 사용한다.
- **localStorage 키**: 고정값 `tale-asset-storage-v1-default` (프로젝트별 분리 없음).

## 포인터

| 무엇 | 어디 |
|------|------|
| 구현 (어댑터·hydrate 주석이 상세 계약) | `src/stores/asset-storage-store.ts` |
| 타입 (`CharacterAsset`, `WorldAsset`, `GeneratedImage`) | `src/types/asset.ts` |
| 노드그래프 시대 구버전 | `specs/archive/2026-06-04-redesign-l0-canvas/` |

---

## 변경 이력

- 2026-06-11: spec diet — 노드그래프 시대 서술 전면 삭제, 인터페이스 계약만 재작성 (구현 = 코드).
