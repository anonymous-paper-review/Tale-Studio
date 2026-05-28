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
  - `canvas-store` / `director-canvas-store`는 React Flow 인스턴스 *참조* 보관 금지

## 진행 중 변경
- L0 재설계 (`specs/changes/redesign-l0-canvas/`): `artist-store` 점진 deprecate, `canvas-store` + `asset-storage-store`로 교체 중. director/global-chat 의존 정리 후 삭제
- Director 재설계 (`specs/changes/redesign-director-canvas/`): `director-canvas-store`가 메인, 기존 `director-store`는 D-8까지 점진 유지

## 인벤토리
- 공유: `project-store`, `global-chat-store`
- Dev A: `producer-store`, `writer-store`, `artist-store` (deprecate 중), `canvas-store`, `asset-storage-store`
- Dev B: `director-store` (deprecate 중), `director-canvas-store`, `editor-store`
