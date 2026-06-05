# src/stores — Zustand stores

## 인벤토리
- `project-store.ts` — 공유
- `producer-store.ts`, `artist-store.ts`
- `writer-store.ts` — **데이터 허브로 유지** (decision #38). writer UI 제거 후 생성 액션(generateScenes/
  regenerateAllShots/applyUpdates) 삭제. `sceneManifest`/`shots`를 DB에서 로드해 artist/director가 소비.
- `director-store.ts`, `editor-store.ts`, `director-canvas-store.ts`
- `asset-storage-store.ts` — L0 Artist 등록 에셋 저장소 (유지)
- `global-chat-store.ts` — 공유
- `canvas-store.ts` — **삭제됨** (노드 그래프 폐기 2026-06-04, 카드형 복원)

## 컨벤션
- **Slice 패턴**: state + actions를 하나의 `create()`에 묶음
- Selector는 컴포넌트에서 직접 `useStore(s => s.foo)`
- `persist` 미들웨어는 **직렬화 가능한 값만** (DOM 노드, 함수, Promise 금지)
- **다른 store import 금지** — `project-store`만 예외 (공유 컨테이너)
- React Flow 인스턴스 참조 보관 금지 (직렬화 불가, `director-canvas-store` 해당)

## 변경 중
- Artist 카드 복원 (`specs/changes/rollback-artist-card/`): `canvas-store` 삭제, `artist-store` 재활성. `asset-storage-store` 유지 + `registerCharacterCard` / `registerWorldCard` 어댑터 추가.
- Director 재설계 (`specs/changes/redesign-director-canvas/`): `director-canvas-store`가 메인. 기존 `director-store`는 D-8까지 점진 유지 (내부 #14)
