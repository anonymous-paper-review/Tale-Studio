# src/features/director — Director Canvas

> React Flow 동작과 현재 파일 구조는 코드가 진실이다. 페이지 진입점은 `src/app/studio/director/page.tsx`, 상태 진실은 `src/stores/director-store.ts`.

## Status
- 재설계 완료·archive (`@../../../specs/archive/2026-06-05-redesign-director/`). Spec: `@../../../specs/layers/director.md`
- 구 Director 패널(`legacy/`)과 **구** `director-store`(패널용, 780줄)는 제거 완료. 현 `director-store.ts` = 구 `director-canvas-store`가 개명된 것 (2026-06-11)

## Stack
- React Flow (xyflow) — 노드 그래프
- Three.js + React Three Fiber — 3D viewport 예정 (**미설치** — 도입 시 추가)
- Zustand — `@../../../stores/director-store.ts`
- shadcn/ui — 인스펙터/모달 (popup/모달에서만 portal 위젯)

## 디렉토리 anatomy (2026-06-10 동기화)
- `canvas-nodes/` — 1 file = 1 node type (Base/Scene/Shot/Video)
- `canvas-edges/` — CategoryEdge (`parent` / `relates-to` — `DirectorEdgeCategory`)
- `canvas-popups/` — CreatorModal, RelationModal, DeleteConfirmModal, DirectorNodePopup + Scene/Shot/VideoNodePopup, inventory-picker-dialog (ShotNodePopup reference용 워크스페이스 인벤토리 picker)
- `canvas-views/` — 캔버스 뷰
- `hooks/` — use-director-warm-starting 등
- 루트: `angle-control.tsx`, `camera-preset-control.tsx`, `key-light.tsx` — 카메라/조명 컨트롤

## 자주 하는 작업
| 무엇 | 어디 |
|---|---|
| 새 노드 타입 추가 | `canvas-nodes/`에 .tsx + `nodeTypes` 맵 |
| 새 엣지 타입 추가 | `canvas-edges/`에 .tsx + `edgeTypes` 맵 |
| 인스펙터 / 모달 추가 | `canvas-popups/`에 .tsx |
| 스토어 액션 추가 | `../../../stores/director-store.ts` |
| 데이터 모델 변경 | `../../../types/director.ts` + 스펙 업데이트 |
| Agent 액션 추가 | `DirectorCanvasUpdate` union + `applyUpdates` |

## Final 마킹 (내부 #11)
- Video 헤더 ★ = Final 토글. Shot당 1개 강제. NodePopup에서도 토글 가능

## 안 건드릴 곳
- `../artist/` — 직접 편집 금지
- `../../stores/artist-store.ts`, `asset-storage-store.ts` — 직접 편집 금지
