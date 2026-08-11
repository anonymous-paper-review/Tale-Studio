# t0-v6-background-ref-trace — 최종 생성 경로의 배경 ref 무방어 추적

- **날짜**: 2026-08-11 (밤 러너)
- **판정**: **가설 참** — 최종 생성 경로에 샷별 뷰 분기·배경 방어 배선 없음 (기각 조건 "분기 실존" 미발동)
- **출처 티켓**: `research/backlog/t0-v6-background-ref-trace.md` ← background-view-3d §3

## Phase 0 — 라우트 확정

"최종 생성"의 실경로는 `src/app/api/director/generate-storyboard/route.ts` (DB 샷 webhook job 경로).
`src/app/api/artist/generate-sheet/route.ts`는 **캐릭터 뷰 시트** 생성 전용(로케이션·샷 무관)이라 대상 아님 —
vault 표기 "V6/generate-sheet"의 실체는 director 최종 스토리보드 생성이다.

## ref 조립 사슬 (파일:라인 전수)

최종 생성의 reference_image_urls가 조립되는 사슬:

1. **클라 조립** — `src/stores/director-store.ts:2138` `resolveShotAssetImages(data)` → `:2153` body로 전송
2. **로케이션 해석** — `director-store.ts:250-262`: `worldAssetIds` 각각에 `pickAssetImageUrl(store.getWorld(id))`
3. **대표 1장 선택** — `director-store.ts:243-247` `pickAssetImageUrl`: `referenceImages[0]` 없으면 `views.single[0].url`.
   **샷의 카메라 각도·뷰를 읽는 분기가 없다** — 인자가 아예 (reg)뿐, 샷 정보 미전달.
4. **로케이션 등록 시점** — `src/stores/asset-storage-store.ts` `worldAssetToRegisterInput`:
   `const wide = asset.wideShot; const single = wide ? [viewToGeneratedImage(wide, undefined)] : []`
   → 로케이션의 등록 이미지 = **wide_shot 1장** (vault 실측 "wide_shot 1장 존재·establishing_shot 전부 null"과 합치)
5. **서버** — `src/app/api/director/generate-storyboard/route.ts:139` callerRefs 그대로 사용
   (스트립 모드 `:129-133`도 `[stripRefUrl, ...callerRefs, anchor]` — 배경 분기 없음)

∴ 같은 씬의 모든 샷이 각도 무관하게 **같은 wide_shot 1장**을 배경 ref로 받는다.

## previz vs 최종 생성 대조표

| 축 | previz (`generate-storyboard-batch/route.ts:109`) | 최종 생성 (`generate-storyboard`) |
|---|---|---|
| ref 목록 | `[러프 그리드, ...캐릭터(view_main∥portrait :84-89), 스타일 앵커]` | `[스트립?, ...클라 refs(캐릭터+로케이션), 앵커]` |
| 배경 ref | **없음** (러프 그리드가 유일한 공간 단서) | **wide_shot 1장 고정** (전 각도 공통) |
| 샷별 뷰 분기 | 없음 | 없음 |
| 인물 방어 | view_main ref (+러프의 마네킹 규칙) | view_main ref |

비대칭 구조는 previz 실측과 동형: **인물은 방어(전용 ref), 배경은 무방어**. 최종 생성은 previz보다
반 발짝 낫지만(배경 ref가 존재는 함) 뷰가 하나뿐이라 각도 요구를 못 채운다 — "같은 명목 뷰가
씬마다 딴 건물"이 재발할 배선 조건이 최종 경로에도 그대로 있다.

## Q5(뷰 시트 실험)에 주는 전제 입력

- 뷰 시트(클러스터 뷰 5장 파생)를 도입할 경우 previz·최종 생성 **양쪽** 모두 소비 배선을 새로 깔아야 한다
  (현행은 둘 다 뷰를 고를 자리가 없음 — pickAssetImageUrl에 샷 컨텍스트 미전달이 병목 좌표).
- 실험 설계에서 "무방어 기준선"은 previz뿐 아니라 최종 경로도 동일하게 성립.

## 좌표

- 추적: 코드 read-only (grep + 정독). LLM·DB 접근 없음.
- 파일: 위 사슬의 5개 좌표 + 대조 기준 `src/app/api/director/generate-storyboard-batch/route.ts:84-109`
