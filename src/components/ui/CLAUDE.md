# src/components/ui — shadcn primitives

## 추가 워크플로
`/shadcn-component` 스킬 사용. 또는 수동:
1. `npx shadcn@latest add <name>`
2. `components.json`의 `cssVariables` 변경 확인
3. design.md에 새 variant나 토큰 있으면 업데이트

## 컨벤션
- 이 디렉토리 파일은 shadcn CLI가 관리. **직접 편집 시 다음 `shadcn add`가 덮어쓸 수 있음** (주의)
- 커스텀 컴포넌트는 `src/components/<feature>/` 하위에 두기 (예: `src/components/canvas/`)
- React 19+ **`data-slot` 컨벤션** 유지
- forwardRef 의존 패턴 작성 금지 (shadcn 최신 컴포넌트 미사용)

## 디자인 토큰
- `src/app/globals.css` 참조. 자세한 룰은 `specs/design.md`
- 새 토큰은 globals.css에만 (decisions #30)
- 캔버스 확장 토큰 (`--canvas-*`, `--node-*`, `--edge-*`)은 여기서 import 금지 — Director Canvas (`src/features/director/canvas-nodes/`, `src/features/director/canvas-edges/` 등)에서만
