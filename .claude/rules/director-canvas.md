---
paths:
  - "src/features/director/**/*.{tsx,ts}"
---

# Director Canvas

## Status
- **Status**: Director Canvas 노드 그래프 재설계 진행 중 (2026-05-25~)
- **Spec**: `specs/layers/director_canvas.md`
- **진행 중 변경**: `specs/changes/redesign-director-canvas/` (proposal, tasks, deltas)

## React Flow 패턴
- `nodeTypes` / `edgeTypes`는 **module-scope 상수**. 인라인 객체 금지 (매 렌더마다 재생성 → 성능 저하)
- 노드 ID: `nanoid(10)`. URL slug 아님
- 좌표 **16px snap**. 자유 좌표 금지 (내부 결정 #18)
- 선택 halo: `ring-2 ring-node-selected ring-offset-2` (디자인 토큰)
- 핀 연결: `connectionMode="loose"` (Artist 캔버스 F-2 fix와 동일)

## 노드 색 (내부 #10)
- Scene = `--chart-3`
- Shot = `--chart-4`
- Video = `--chart-5`

## 디렉토리 anatomy
- `canvas-nodes/` — 1 file = 1 node type (Base/Scene/Shot/Video)
- `canvas-edges/` — 1 file = 1 edge type (CategoryEdge)
- `canvas-popups/` — 인스펙터·context modal·confirm (CreatorModal, RelationModal, DeleteConfirmModal, DirectorNodePopup + Scene/Shot/VideoNodePopup)
- `hooks/` — React hooks (use-director-canvas-warm-starting 등)

## 컨벤션
- 노드 컴포넌트: plain shadcn primitive(`Button`/`Input`/`Badge` 등 제자리 렌더) OK. **Radix portal 위젯(`Select`/`Popover`/`Tooltip`/`Dialog`/`DropdownMenu`)은 노드 본체 금지** — RF pane 밖 portal로 pan/zoom·포인터 충돌, popup/모달에 둘 것. 색은 캔버스 확장 토큰 우선
- Video 노드 헤더 ★ = Final 토글. Shot당 1개 강제 (내부 #11)
- Inspector aside는 단계적 마이그레이션 (내부 #12, D-3 완료 시 제거 — 이미 진행됨)
- 노드 위치 저장: `scenes` / `shots` / `video_clips` 테이블 `canvas_position` JSONB (내부 #15)

## 안 건드릴 곳
- `../artist/canvas-*` — 패턴 참고는 OK, 직접 편집 금지
- `../../stores/artist-store.ts`, `canvas-store.ts`, `asset-storage-store.ts` — 직접 편집 금지
