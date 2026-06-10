# src/stores — Zustand stores

> 제약(slice 패턴 / store간 import 금지 / persist 직렬화 / 진입 게이트 영속)은 `.claude/rules/stores.md` — 여기는 인벤토리·역할만.

## 인벤토리 (2026-06-10 동기화 — `ls src/stores/`와 일치 유지)

- `project-store.ts` — 공유 컨테이너 (store간 import 유일 예외)
- `global-chat-store.ts` — 공유 채팅 (스테이지별 분기)
- `producer-store.ts` — P1 Producer
- `artist-store.ts` — 카드형 Artist (이미지 생성 액션, `enteredProjects` 진입 게이트)
- `asset-storage-store.ts` — 등록 에셋 저장소 (`registerCharacterCard` / `registerWorldCard` 어댑터)
- `writer-store.ts` — **데이터 허브** (decision #38): 생성 액션 없음, `sceneManifest`/`shots`를 DB에서 로드해 artist/director가 소비
- `director-canvas-store.ts` — Director Canvas 메인 (`generatingNodeIds`, `hydrateFromDb`)
- `editor-store.ts` — P5 Editor
- `inventory-store.ts` / `preset-storage-store.ts` / `chat-ui-store.ts` / `config-store.ts`

## 삭제된 스토어 (유령 참조 주의)
- `canvas-store.ts` — 노드 그래프 폐기 (2026-06-04 카드형 복원)
- `director-store.ts` — 구 Director 패널(legacy/)과 함께 제거 완료

새 store 추가/삭제 시 이 목록을 같이 갱신.
