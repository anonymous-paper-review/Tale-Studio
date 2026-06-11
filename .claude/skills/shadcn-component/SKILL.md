---
description: shadcn/ui 컴포넌트를 tale-studio에 추가. components.json + design.md 업데이트 + 토큰 충돌 검사. 사용자가 "버튼 추가", "shadcn add", "새 컴포넌트" 등 멘션 시.
when_to_use: shadcn 컴포넌트 신규 도입
allowed-tools: Bash, Read, Edit, Glob
---

# shadcn-component skill

shadcn/ui primitive 추가 워크플로.

## Process
1. 컴포넌트 이름 확정 (사용자 prompt에서 추출)
2. `npx shadcn@latest add <name>` 실행
3. 생성된 파일 확인: `src/components/ui/<name>.tsx`
4. `components.json`의 `cssVariables` 항목이 변경되었는지 확인
5. 새 variant나 토큰이 있으면 `specs/design.md` §components 섹션에 추가 권장
6. 사용 예시 1개를 적절한 곳에 작성 (사용자 컨텍스트에 따라)

## 컨벤션 (`src/components/ui/CLAUDE.md`, `specs/design.md`와 일관)
- React 19+ `data-slot` 컨벤션 유지. forwardRef 패턴 금지
- 새 토큰은 `src/app/globals.css`에만 추가 (decisions #30)
- 캔버스 확장 토큰 (`--canvas-*` 등)은 여기서 import 금지 — 캔버스 노드에서만
