---
paths:
  - "src/stores/*.ts"
---

# Zustand stores

## 컨벤션
- **Slice 패턴**: state + actions를 하나의 `create()`에 묶음
- Selector는 컴포넌트에서 직접 `useStore(s => s.foo)`. 외부 selector 모듈 분리 금지 (slice 안에 둠)
- **store 간 import 금지** — 단, `project-store`는 공유 컨테이너로 예외
- `persist` 미들웨어 사용 시 **직렬화 가능한 값만**:
  - DOM 노드 / 함수 / Promise / React Flow 인스턴스 참조 금지
  - `director-canvas-store`는 React Flow 인스턴스 *참조* 보관 금지

## 진행 중 변경
- Artist 카드 복원 (`specs/changes/rollback-artist-card/`): `canvas-store` 삭제 완료. `artist-store` 재활성. `asset-storage-store` 유지 + 카드→등록 어댑터(`registerCharacterCard`/`registerWorldCard`) 추가.
- Director 재설계 (`specs/changes/redesign-director-canvas/`): `director-canvas-store`가 메인, 기존 `director-store`는 D-8까지 점진 유지

## 인벤토리
- 공유: `project-store`, `global-chat-store`
- `producer-store`, `writer-store`, `artist-store`, `asset-storage-store`
- `director-store` (deprecate 중), `director-canvas-store`, `editor-store`
- `canvas-store` — **삭제됨** (노드 그래프 폐기, 2026-06-04)
