---
paths:
  - "src/features/director/**/*.{tsx,ts}"
---

# Director Canvas — 제약

## Status
- 재설계 완료·archive (`specs/archive/2026-06-05-redesign-director-canvas/`). Spec: `specs/layers/director_canvas.md`
- 디렉토리 anatomy·자주 하는 작업은 `src/features/director/CLAUDE.md` 참조

## React Flow 패턴
- `nodeTypes` / `edgeTypes`는 **module-scope 상수**. 인라인 객체 금지 (매 렌더마다 재생성 → 성능 저하)
- 노드 ID: `nanoid(10)`. URL slug 아님
- 좌표 **16px snap**. 자유 좌표 금지 (내부 결정 #18)
- 선택 halo: `ring-2 ring-node-selected ring-offset-2` (디자인 토큰)
- 핀 연결: `connectionMode="loose"` (BaseNode Handle 4면 패턴)

## 노드 색 (내부 #10 — canonical은 design.md §2.2)
- Scene = `--chart-3` / Shot = `--chart-4` / Video = `--chart-5`

## 컨벤션
- 노드 컴포넌트: plain shadcn primitive(`Button`/`Input`/`Badge` 등 제자리 렌더) OK. **Radix portal 위젯(`Select`/`Popover`/`Tooltip`/`Dialog`/`DropdownMenu`)은 노드 본체 금지** — RF pane 밖 portal로 pan/zoom·포인터 충돌, popup/모달에 둘 것. 색은 캔버스 확장 토큰 우선
- Video 노드 헤더 ★ = Final 토글. Shot당 1개 강제 (내부 #11)
- 노드 위치 저장: `scenes` / `shots` / `video_clips` 테이블 `canvas_position` JSONB (내부 #15)

## 안 건드릴 곳
- `../artist/` — 직접 편집 금지 (카드형 — 캔버스 패턴 없음)
- `../../stores/artist-store.ts`, `asset-storage-store.ts` — 직접 편집 금지
