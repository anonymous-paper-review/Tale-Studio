# src/features/artist — L0 Concept Canvas

## Status
- Status: L0 Concept Canvas 노드 그래프 재설계 진행 중 (2026-05-17~)
- Spec: `@../../../specs/layers/L0_concept_canvas.md` + `@../../../specs/data/canvas_data_model.md` + `@../../../specs/data/asset_storage.md`
- 진행 중 변경: `@../../../specs/changes/redesign-l0-canvas/`

## Stack
- React Flow (xyflow) — 노드 그래프
- Zustand — `@../../../stores/canvas-store.ts` + `@../../../stores/asset-storage-store.ts`
- 기존 `artist-store.ts`는 점진 deprecate (director/global-chat 의존 정리 후 삭제)
- shadcn/ui — 노드 팝업, RelationModal, DeleteConfirmModal

## 디렉토리 anatomy
- `nodes/` — Base/Actor/World/StatusNode
- `edges/` — CategoryEdge
- `canvas-popups/` — NodePopup, RelationModal, DeleteConfirmModal, registration 폼
- `asset-export.ts` — Asset Storage → P4 export

## 자주 하는 작업
| 무엇 | 어디 |
|---|---|
| 새 노드 타입 추가 | `nodes/`에 .tsx + `nodeTypes` 맵 |
| 새 엣지 카테고리 추가 | `edges/CategoryEdge.tsx` |
| 팝업/모달 추가 | `canvas-popups/`에 .tsx |
| 스토어 액션 추가 | `../../../stores/canvas-store.ts` |
| 데이터 모델 변경 | `../../../types/index.ts` + canvas_data_model.md |
| Agent 액션 추가 | `CanvasUpdate` union + `applyUpdates` |

## 컨벤션
- 노드 ID는 `nanoid(10)`
- 노드 좌표 **16px snap**
- 선택 halo: `ring-2 ring-node-selected ring-offset-2`
- 노드 컴포넌트: plain shadcn primitive(`Button`/`Input`/`Badge`) OK. **Radix portal 위젯(`Select`/`Popover`/`Tooltip`/`Dialog`/`DropdownMenu`)은 노드 본체 금지** (RF pane 밖 portal 충돌 → popup/모달에). 색은 캔버스 확장 토큰 우선
- React Flow `nodeTypes` / `edgeTypes` module-scope 상수
- 핀 연결 `connectionMode="loose"` (F-2 fix)

## 노드 색 (decisions #30)
- Actor = `--chart-1` (red)
- World = `--chart-2` (blue)
- Status = 마더 색 채도 50% 감소

## 엣지 카테고리 (decisions #32)
- Actor↔Actor = `references`만 (점선 + 자유 텍스트)
- Actor↔World = `in-world`
- `parent`는 Status Branch 자동 생성 전용. 사용자 수동 그리기 금지

## 노드 액션 (decisions #33)
- 우클릭 컨텍스트 메뉴 **완전 제거**
- BaseNode 헤더 4 아이콘 (Edit / Branch / Copy / Delete) + NodePopup
- 노드 더블클릭 = Edit 단축

## 등록 임계값 (decisions #29.5)
- 누적 이미지 ≥ 20장 시 등록 가능 (Higgsfield Soul ID 차용)
- 프롬프트만 전파, 이미지 재생성은 수동

## 안 건드릴 곳
- `../director/canvas-*` — 직접 편집 금지. 패턴 참고는 OK
- `../../stores/director-store.ts`, `director-canvas-store.ts`, `editor-store.ts` — 직접 편집 금지
