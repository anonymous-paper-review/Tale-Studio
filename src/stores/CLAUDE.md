# src/stores — Zustand stores

## 인벤토리
- `project-store.ts` — 공유 (Dev A & B PR to main)
- `producer-store.ts`, `writer-store.ts`, `artist-store.ts` — Dev A
- `director-store.ts`, `editor-store.ts`, `director-canvas-store.ts` — Dev B
- `canvas-store.ts`, `asset-storage-store.ts` — Dev A (L0 Canvas)
- `global-chat-store.ts` — 공유

## 컨벤션
- **Slice 패턴**: state + actions를 하나의 `create()`에 묶음
- Selector는 컴포넌트에서 직접 `useStore(s => s.foo)`
- `persist` 미들웨어는 **직렬화 가능한 값만** (DOM 노드, 함수, Promise 금지)
- **다른 store import 금지** — `project-store`만 예외 (공유 컨테이너)
- React Flow 인스턴스 참조 보관 금지 (직렬화 불가)

## 변경 중
- L0 재설계 (`specs/changes/redesign-l0-canvas/`): `artist-store` 점진 deprecate → `canvas-store` + `asset-storage-store`
- Director 재설계 (`specs/changes/redesign-director-canvas/`): `director-canvas-store`가 메인. 기존 `director-store`는 D-8까지 점진 유지 (내부 #14)
