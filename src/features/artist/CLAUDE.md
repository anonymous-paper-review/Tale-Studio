# src/features/artist — L0 Artist Card Studio

## Status
- Status: 카드형 패널 UI (2026-06-04 롤백 완료)
- 이력: 노드 그래프 버전은 `specs/archive/2026-06-04-redesign-l0-canvas/`에 보존
- Spec: 구현이 source-of-truth (`character-panel.tsx`/`world-panel.tsx`/`inventory-grid.tsx`) + `@../../../specs/data/asset_storage.md`
- 완료 변경: `@../../../specs/archive/2026-06-05-rollback-artist-card/` (archive됨)

## Stack
- shadcn/ui Tabs — Characters / World / Inventory 탭 패널
- Zustand — `@../../stores/artist-store.ts` + `@../../stores/asset-storage-store.ts` + `@../../stores/inventory-store.ts` (워크스페이스 인벤토리)
- `canvas-store.ts` — **삭제됨** (노드 그래프 폐기)

## 디렉토리 anatomy
- `character-panel.tsx` — 캐릭터 카드 목록 (이미지 생성 + Register)
- `world-panel.tsx` — 월드 카드 목록 (이미지 생성 + Register)
- `inventory-grid.tsx` — 워크스페이스 인벤토리 그리드 (`inventory_items` DB 로드/업로드/삭제, inventory-store 경유 — 프로젝트 간 재사용 라이브러리)
- `image-placeholder.tsx` — 이미지 없을 때 placeholder
- `add-character-dialog.tsx` / `character-view-dialog.tsx` / `world-view-dialog.tsx` — 추가/상세 다이얼로그

## 자주 하는 작업
| 무엇 | 어디 |
|---|---|
| 캐릭터 카드 편집 UI 변경 | `character-panel.tsx` |
| 월드 카드 편집 UI 변경 | `world-panel.tsx` |
| 인벤토리 표시/저장 변경 | `inventory-grid.tsx` + `../../stores/inventory-store.ts` |
| "인벤토리에 저장" 버튼 | `character-panel.tsx` / `world-panel.tsx` (`/api/inventory/save-from-asset`) |
| Register 어댑터 수정 | `../../stores/asset-storage-store.ts` (registerCharacterCard / registerWorldCard) |
| 데이터 타입 변경 | `../../types/asset.ts` + asset_storage.md |

## 컨벤션
- shadcn/ui 컴포넌트 우선 (`Card`, `Button`, `Input`, `Tabs`)
- `globals.css` 토큰 외 신규 색 금지 (specs/design.md)
- 이미지 생성: artist-store 액션 경유. 현재 endpoint/provider는 관련 `src/app/api/**/route.ts`와 `src/lib/**` 코드가 진실
- asset-storage-store에 기록 시 반드시 어댑터 함수 사용 (직접 `RegisteredCharacter` 조작 금지)

## 안 건드릴 곳
- `../director/` — 직접 편집 금지. 패턴 참고는 OK
- `../../stores/director-store.ts`, `editor-store.ts` — 직접 편집 금지
