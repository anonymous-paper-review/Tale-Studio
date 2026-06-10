# src/features/artist — L0 Artist Card Studio

## Status
- Status: 카드형 패널 UI (2026-06-04 롤백 완료)
- 이력: 노드 그래프 버전은 `specs/archive/2026-06-04-redesign-l0-canvas/`에 보존
- Spec: 구현이 source-of-truth (`character-panel.tsx`/`world-panel.tsx`/`inventory-grid.tsx`) + `@../../../specs/data/asset_storage.md`
- 완료 변경: `@../../../specs/archive/2026-06-05-rollback-artist-card/` (archive됨)

## Stack
- shadcn/ui Tabs — Characters / World / Inventory 탭 패널
- Zustand — `@../../../stores/artist-store.ts` + `@../../../stores/asset-storage-store.ts`
- `canvas-store.ts` — **삭제됨** (노드 그래프 폐기)

## 디렉토리 anatomy
- `character-panel.tsx` — 캐릭터 카드 목록 (이미지 생성 + Register)
- `world-panel.tsx` — 월드 카드 목록 (이미지 생성 + Register)
- `inventory-grid.tsx` — 등록 에셋 그리드 (읽기 전용)
- `image-placeholder.tsx` — 이미지 없을 때 placeholder
- `add-character-dialog.tsx` / `character-view-dialog.tsx` / `world-view-dialog.tsx` — 추가/상세 다이얼로그

## 자주 하는 작업
| 무엇 | 어디 |
|---|---|
| 캐릭터 카드 편집 UI 변경 | `character-panel.tsx` |
| 월드 카드 편집 UI 변경 | `world-panel.tsx` |
| 등록 에셋 표시 변경 | `inventory-grid.tsx` |
| Register 어댑터 수정 | `../../../stores/asset-storage-store.ts` (registerCharacterCard / registerWorldCard) |
| 데이터 타입 변경 | `../../../types/asset.ts` + asset_storage.md |

## 컨벤션
- shadcn/ui 컴포넌트 우선 (`Card`, `Button`, `Input`, `Tabs`)
- `globals.css` 토큰 외 신규 색 금지 (specs/design.md)
- 이미지 생성: artist-store 액션 경유 (`/api/artist/generate-sheet`, `/api/artist/generate-world`, 레거시 `/api/generate/image`). 모델/프로바이더는 여기 적지 않음 — `src/lib/writer/llm/fal.ts` + 해당 라우트가 진실
- asset-storage-store에 기록 시 반드시 어댑터 함수 사용 (직접 `RegisteredCharacter` 조작 금지)

## 안 건드릴 곳
- `../director/` — 직접 편집 금지. 패턴 참고는 OK
- `../../stores/director-canvas-store.ts`, `editor-store.ts` — 직접 편집 금지
