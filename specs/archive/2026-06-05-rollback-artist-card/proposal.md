---
change: rollback-artist-card
status: active
created: 2026-06-04
decisions: [36]
---

# Artist UI 카드형 복원 (노드 그래프 롤백)

## Why

`redesign-l0-canvas` change(2026-05-17~)로 구현된 React Flow 노드 그래프 버전은 P10-2~7 구현을 완료했으나 [c] 항목(브라우저 검증 대기)이 20여 개 누적된 채 통과되지 못했다. 구현 복잡도 대비 검증 진척이 느리고, 캔버스-스토어·노드/엣지 코드베이스가 P4(Director Canvas)에 연관성이 낮아 분리 유지 비용이 높다.

사용자 결정(2026-06-04)으로 커밋 8507796(5-view character UI + inventory tab) 기준의 **카드형 패널 UI**로 복원. 하이브리드 결정: 카드 UI를 복원하되 **asset-storage-store(RegisteredCharacter/RegisteredWorld)**는 그대로 유지하고 카드→등록 어댑터(`registerCharacterCard` / `registerWorldCard`)로 연결한다.

Director Canvas(P4)는 `characterAssetIds` / `worldAssetIds` 필드와 `resolveShotAssetImages` 헬퍼가 이 asset-storage에 의존하므로 **손상 없이 유지**된다.

후속 milestone: Writer↔Director D-4 sync는 별도 변경 작업으로 진행 (본 롤백과 무관).

## What Changes

- `src/app/studio/artist/page.tsx` — 카드형 Tabs(Characters/World/Inventory) 복원
- `src/features/artist/` — `character-panel.tsx`, `world-panel.tsx`, `inventory-grid.tsx`, `image-placeholder.tsx` 복원
- `src/features/artist/{nodes,edges,popups,hooks}/` — 삭제 (노드 그래프 전용)
- `src/features/artist/asset-export.ts` — 삭제 (노드 그래프 P4 export, 불필요)
- `src/stores/canvas-store.ts` — 삭제 (React Flow 그래프 스토어)
- `src/stores/asset-storage-store.ts` — 유지 + `registerCharacterCard` / `registerWorldCard` 어댑터 추가
- `src/types/asset.ts` — `GeneratedImage` 타입 이동 (canvas-store에서 분리)
- `global-chat-store` artist 분기 — canvas-store 의존 제거. node updates dispatch no-op(TODO). warm tip 정적 문구
- `specs/layers/L0_concept_canvas.md` — 카드형으로 재작성 (완료)
- `specs/data/canvas_data_model.md` — deprecated 표기 (완료)

## Impact

- Affected specs: `specs/layers/L0_concept_canvas.md` (재작성 완료), `specs/data/canvas_data_model.md` (deprecated)
- Affected code: `src/features/artist/`, `src/app/studio/artist/page.tsx`, `src/stores/canvas-store.ts` (삭제), `src/stores/asset-storage-store.ts` (유지+어댑터), `src/types/asset.ts`
- Affected stores: `artist-store` (재활성), `canvas-store` (삭제), `asset-storage-store` (유지)
- Affected decisions: #36 (archive 결정)
- Director 무손상: `director-store`의 `characterAssetIds` / `worldAssetIds` / `resolveShotAssetImages` 그대로 동작

## Verification gate (archive 조건)

- tasks.md의 모든 `[c]` → `[x]`
- 브라우저 검증: Characters 탭 → 카드 표시 → 이미지 생성 → Register 버튼 동작
- 브라우저 검증: World 탭 → 카드 표시 → 이미지 생성 → Register 버튼 동작
- 브라우저 검증: Inventory 탭 → 등록된 에셋 표시
- 브라우저 검증: Director 탭 → ShotNode 등장 캐릭터/월드 드롭다운 → asset-storage에서 가져옴
- `specs/layers/L0_concept_canvas.md` final state 반영 완료 (완료)
- `tsc --noEmit` exit 0 (완료)
