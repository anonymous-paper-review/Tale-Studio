# src/features/director — Director Canvas (Dev B)

## Owner & Status
- Owner: Dev B (브랜치 `feature/director-editor`)
- Status: Director Canvas 노드 그래프 재설계 진행 중 (2026-05-25~)
- Spec: `@../../../specs/layers/director_canvas.md`
- 진행 중 변경: `@../../../specs/changes/redesign-director-canvas/`

## Stack
- React Flow (xyflow) — 노드 그래프
- Three.js + React Three Fiber — 3D viewport (일부 노드, depth parallax 후속)
- Zustand — `@../../../stores/director-canvas-store.ts`
- shadcn/ui — 인스펙터/모달 (Sheet, Dialog), context menu (DropdownMenu)

## 디렉토리 anatomy
- `canvas-nodes/` — 1 file = 1 node type (Base/Scene/Shot/Video)
- `canvas-edges/` — 1 file = 1 edge type (CategoryEdge)
- `canvas-popups/` — CreatorModal, RelationModal, DeleteConfirmModal, DirectorNodePopup + Scene/Shot/VideoNodePopup
- `hooks/` — use-director-canvas-warm-starting 등
- `legacy/` — 구 Director 패널 (D-8까지 유지, 검증 끝나면 삭제)

## 자주 하는 작업
| 무엇 | 어디 |
|---|---|
| 새 노드 타입 추가 | `canvas-nodes/`에 .tsx + `nodeTypes` 맵 |
| 새 엣지 타입 추가 | `canvas-edges/`에 .tsx + `edgeTypes` 맵 |
| 인스펙터 / 모달 추가 | `canvas-popups/`에 .tsx |
| 스토어 액션 추가 | `../../../stores/director-canvas-store.ts` |
| 데이터 모델 변경 | `../../../types/director-canvas.ts` + 스펙 업데이트 |
| Agent 액션 추가 | `DirectorCanvasUpdate` union + `applyUpdates` |

## 컨벤션
- 노드 ID는 `nanoid(10)`. URL slug 아님
- 노드 좌표는 **16px snap**. 자유 좌표 금지 (내부 결정 #18)
- 선택 halo: `ring-2 ring-node-selected ring-offset-2`
- 노드 컴포넌트는 `@/components/ui` 직접 import 금지. 캔버스 확장 토큰만 사용
- React Flow `nodeTypes` / `edgeTypes`는 **module-scope 상수** (인라인 객체 매 렌더 재생성 → 성능 저하)
- 핀 연결은 `connectionMode="loose"` (BaseNode Handle 4면 패턴)

## 노드 색 (내부 #10)
- Scene = `--chart-3`
- Shot = `--chart-4`
- Video = `--chart-5`

## Final 마킹 (내부 #11)
- Video 헤더 ★ = Final 토글. Shot당 1개 강제
- NodePopup에서도 토글 가능

## 안 건드릴 곳
- `../artist/canvas-*` — Dev A 소유. 패턴 참고는 OK, 직접 편집 금지
- `../../stores/artist-store.ts`, `canvas-store.ts`, `asset-storage-store.ts` — Dev A 소유
