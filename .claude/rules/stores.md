---
paths:
  - "src/stores/*.ts"
---

# Zustand stores — 제약

- **Slice 패턴**: state + actions를 하나의 `create()`에 묶음
- Selector는 컴포넌트에서 직접 `useStore(s => s.foo)`. 외부 selector 모듈 분리 금지 (slice 안에 둠)
- **store 간 import 금지** — `project-store`(공유 컨테이너)만 예외. 크로스스테이지 연동은 lib 경유 (`src/lib/generation-notify.ts` / `stage-nav.ts`의 `getState()` 패턴)
- **진입 게이트·백그라운드 작업 라이프사이클 state는 page-local `useState`/`useRef`에 두지 말 것.**
  route 는 탭 네비게이션마다 언마운트→리마운트되므로 page-local state·`setTimeout` 가드는 전부 리셋된다
  (생성 도중 탭 전환 시 progress 게이트가 재등장하던 artist 버그의 원인). 진입 허용/생성 진행은
  **projectId 키 store(또는 DB 파생)** 에 영속하고, 게이트는 그 값으로 판단한다. director-canvas-store
  (`generatingNodeIds`+`hydrateFromDb`)·artist-store(`enteredProjects`/`generatingStartedAt`)가 레퍼런스.
- `persist` 미들웨어 사용 시 **직렬화 가능한 값만**: DOM 노드 / 함수 / Promise / React Flow 인스턴스 참조 금지

인벤토리·스토어별 역할은 `src/stores/CLAUDE.md` (rule에 목록 복제 금지).
