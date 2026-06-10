---
paths:
  - "src/features/artist/**/*.{tsx,ts}"
---

# Artist (L0) — 카드형 패널

## Status
- **카드형 Tabs UI** (Characters / World / Inventory). React Flow **미사용**.
- 노드 그래프 버전은 2026-06-04 사용자 결정으로 폐기 — `specs/archive/2026-06-04-redesign-l0-canvas/`. 노드/엣지/snap 규칙은 이 디렉토리에 적용되지 않음 (director 캔버스 전용).
- 디렉토리 anatomy·자주 하는 작업은 `src/features/artist/CLAUDE.md` 참조.

## 규칙
- 카드/다이얼로그는 shadcn primitive (`Card`/`Tabs`/`Dialog`/`Button`/`Input`). `globals.css` 토큰 외 신규 색 금지.
- 이미지 생성은 **artist-store 액션 경유** (`/api/artist/generate-sheet`, `/api/artist/generate-world`, 레거시 `/api/generate/image`). 컴포넌트에서 직접 fetch 금지.
- 등록(Register)은 asset-storage-store **어댑터 함수만** (`registerCharacterCard` / `registerWorldCard`). `RegisteredCharacter` 직접 조작 금지.
- 생성 모델/프로바이더 이름을 이 영역 문서·코드에 하드코딩 금지 — 모델 선택은 `src/lib/writer/llm/fal.ts` + API 라우트가 진실.
- 등록 임계값·전파 정책 등 제품 결정은 `specs/decisions.md` 참조 (#29.5, #29.6).

## 안 건드릴 곳
- `../director/canvas-*` — 직접 편집 금지. 패턴 참고는 OK
- `../../stores/director-canvas-store.ts`, `editor-store.ts` — 직접 편집 금지
