---
paths:
  - "src/components/ui/**/*.{tsx,ts}"
  - "src/components/layout/**/*.{tsx,ts}"
---

# Shared UI components

## 컨벤션
- React 19+ **`data-slot` 컨벤션** 유지. `forwardRef` 의존 패턴 작성 금지 (shadcn 최신 컴포넌트 미사용)
- shadcn 컴포넌트는 `npx shadcn@latest add <name>` CLI 사용. 직접 편집은 다음 `shadcn add`에 덮어쓰일 수 있음
- design.md 룰 적용 (작성 전이면 `docs/research/design-system-data-requirements.md`). `.claude/rules/design.md` 동시 적용됨

## 토큰
- raw hex / 임의 px 금지. **`src/app/globals.css`의 shadcn CSS variables** 또는 Tailwind 유틸리티만
- **캔버스 확장 토큰** (`--canvas-*`, `--node-*`, `--edge-*`)은 여기서 import 금지. 캔버스 노드(`src/features/*/canvas-nodes/`)에서만 사용

## 디렉토리
- shadcn primitive: `src/components/ui/`
- 레이아웃 (전역 사이드바, AppShell, GlobalChat 등): `src/components/layout/`
- 기능별 컴포넌트는 `src/features/<feature>/`로
