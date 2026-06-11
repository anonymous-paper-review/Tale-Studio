# rollback-artist-card — Tasks

> PROGRESS.md 카드 롤백 항목 mirror. 원본 PROGRESS.md는 그대로 유지.
> DoD 마커: [x] = 코드+브라우저 둘 다 ✓, [c] = 코드 ✓ / 브라우저 검증 대기, [ ] = 미착수

## Active

### Infra / 삭제 / 타입 (인프라성 = 코드 자체로 검증 완료)

- [x] `src/stores/canvas-store.ts` 삭제 — React Flow 그래프 스토어 제거 (2026-06-04)
- [x] `src/features/artist/nodes/`, `edges/`, `canvas-popups/`, `hooks/` 삭제 (2026-06-04)
- [x] `src/features/artist/asset-export.ts` 삭제 (노드 그래프 P4 export, 불필요) (2026-06-04)
- [x] `src/types/asset.ts` — `GeneratedImage` 타입 이동 (canvas-store 분리) (2026-06-04)
- [x] `tsc --noEmit` exit 0 (2026-06-04)

### Artist UI 복원 (코드 ✓ / 브라우저 검증 대기)

- [c] `src/app/studio/artist/page.tsx` — Tabs(Characters/World/Inventory) 카드형 복원 — 코드 ✓ / 검증 대기
- [c] `src/features/artist/character-panel.tsx` 복원 — 카드 목록 + 이미지 생성 UI — 코드 ✓ / 검증 대기
- [c] `src/features/artist/world-panel.tsx` 복원 — 월드 카드 + Cinematic Boost — 코드 ✓ / 검증 대기
- [c] `src/features/artist/inventory-grid.tsx` 복원 — 등록 에셋 그리드 — 코드 ✓ / 검증 대기
- [c] `src/features/artist/image-placeholder.tsx` 복원 — 이미지 없을 때 placeholder — 코드 ✓ / 검증 대기

### asset-storage 어댑터 (코드 ✓ / 브라우저 검증 대기)

- [c] `asset-storage-store.registerCharacterCard(card)` 어댑터 — CharacterAsset→RegisterInput 매핑 — 코드 ✓ / 검증 대기
- [c] `asset-storage-store.registerWorldCard(card)` 어댑터 — WorldAsset→RegisterInput 매핑 — 코드 ✓ / 검증 대기
- [c] Characters 탭 → Register 버튼 → asset-storage 기록 동작 — 코드 ✓ / 브라우저 검증 대기
- [c] World 탭 → Register 버튼 → asset-storage 기록 동작 — 코드 ✓ / 브라우저 검증 대기
- [c] Inventory 탭 → 등록 에셋 표시 동작 — 코드 ✓ / 브라우저 검증 대기

### global-chat artist 분기 (코드 ✓ / 브라우저 검증 대기)

- [c] `global-chat-store` artist 분기 — canvas-store 의존 제거, node updates dispatch no-op(TODO) — 코드 ✓ / 검증 대기
- [c] warm tip 정적 문구 (LLM 호출 없음) — 코드 ✓ / 검증 대기

### Director ShotNode 에셋 선택 (코드 ✓ / 브라우저 검증 대기)

- [c] ShotNodePopup — 등장 캐릭터/월드 선택 드롭다운/칩 UI (specs/layers/director.md §5.3) — 코드 ✓ / 검증 대기
- [c] `characterAssetIds` / `worldAssetIds` 필드 채우기 — 코드 ✓ / 검증 대기
- [c] `resolveShotAssetImages` — 스토리보드 생성 레퍼런스로 사용 — 코드 ✓ / 검증 대기

## Blocked

- (없음)

## Done (검증 완료)

- [x] Spec 갱신: `specs/layers/L0_concept_canvas.md` 카드형 재작성 (2026-06-04)
- [x] Spec 갱신: `specs/data/canvas_data_model.md` deprecated 표기 (2026-06-04)
- [x] Archive: `specs/changes/redesign-l0-canvas` → `specs/archive/2026-06-04-redesign-l0-canvas/` (2026-06-04)
- [x] decisions.md #36 entry 추가 (2026-06-04)
