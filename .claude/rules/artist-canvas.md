---
paths:
  - "src/features/artist/**/*.{tsx,ts}"
---

# Artist L0 Concept Canvas

## Status
- **Status**: L0 Concept Canvas 노드 그래프 재설계 진행 중 (2026-05-17~)
- **Spec**: 구현이 source-of-truth (`src/features/artist/`, `src/app/studio/artist/`) + `specs/data/asset_storage.md`
- **진행 중 변경**: `specs/changes/redesign-l0-canvas/` (proposal, tasks, deltas)

## React Flow 패턴
- `nodeTypes` / `edgeTypes`는 **module-scope 상수**. 인라인 객체 금지
- 노드 ID: `nanoid(10)`
- 좌표 **16px snap**. 자유 좌표 금지
- 선택 halo: `ring-2 ring-node-selected ring-offset-2` (디자인 토큰)
- 핀 연결: `connectionMode="loose"` (F-2 fix). BaseNode Handle 4면 모두 `type="source"` 패턴 주의 — `source`/`target` 혼합 시 `loose` 필수

## 노드 색 (decisions #30)
- Actor = `--chart-1` (red)
- World = `--chart-2` (blue)
- Status = 마더 색 채도 50% 감소 (단일 톤 fallback 허용)

## 엣지 카테고리 (decisions #32)
- Actor↔Actor = `references`만 (점선 + 자유 텍스트 메모)
- Actor↔World = `in-world`
- `parent` = Status Branch 자동 생성 전용. 사용자 수동 생성 금지

## 노드 액션 (decisions #33)
- 우클릭 컨텍스트 메뉴 **완전 제거**
- 액션은 BaseNode 헤더 4 아이콘 (Edit / Branch / Copy / Delete) + NodePopup에 일원화
- 노드 더블클릭 = Edit 단축

## 디렉토리 anatomy
- `nodes/` — Base/Actor/World/StatusNode
- `edges/` — CategoryEdge
- `canvas-popups/` — NodePopup, RelationModal, DeleteConfirmModal, registration 폼

## 컨벤션
- 노드 컴포넌트: plain shadcn primitive(`Button`/`Input`/`Badge` 등 제자리 렌더) OK. **Radix portal 위젯(`Select`/`Popover`/`Tooltip`/`Dialog`/`DropdownMenu`)은 노드 본체 금지** — RF pane 밖 portal로 pan/zoom·포인터 충돌, popup/모달에 둘 것. 색은 캔버스 확장 토큰 우선
- 등록 임계값: 누적 이미지 ≥ 20장 (Higgsfield Soul ID 차용, decisions #29.5)
- 프롬프트만 전파, 이미지 재생성은 수동 (decisions #29.6)

## 안 건드릴 곳
- `../director/canvas-*` — 직접 편집 금지. 패턴 참고는 OK
- `../../stores/director-store.ts`, `director-canvas-store.ts`, `editor-store.ts` — 직접 편집 금지
