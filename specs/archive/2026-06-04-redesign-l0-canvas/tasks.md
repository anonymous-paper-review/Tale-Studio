# redesign-l0-canvas — Tasks

> PROGRESS.md Phase 10 (P10-1~7) + P10-Followup의 L0 관련 항목 mirror. 원본 PROGRESS.md는 그대로 유지.
> 본 파일은 진행 중 변경의 audit trail이며, 검증 완료 시 PROGRESS.md와 본 파일 둘 다 `[x]` 승격.

## Archived (superseded — 카드형 Artist 롤백으로 폐기, 2026-06-04)

- [c] P10-2: 더블클릭 노드 생성 — `zoomOnDoubleClick={false}` + target 가드 (2026-05-17 버그픽스 후 미검증)
- [c] P10-2: 핀 → 빈 공간 = Status 자동 Branch
- [c] P10-3: 노드 Edit 팝업 (프롬프트 / 모델 / 출력 모드 / 생성)
- [c] P10-3: 출력 모드 토글 동적 너비 (Single 240 / 5-View 320 / 16-Angle 400)
- [c] P10-3: 노드 박스 내 이미지 그리드
- [c] P10-3: 등록 버튼 (누적 ≥ 20장 시 활성) + 등록 폼 (B-7 검증 보류)
- [c] P10-4: 엣지 카테고리 선택 모달 (references / in-world, parent 제거됨 — decisions #32)
- [c] P10-4: Branch 옵션 분기 모달 (Status / 독립 자식)
- [c] P10-4: 노드 박스 내 Branch 버튼 (헤더 호버 시 노출)
- [c] P10-4: 삭제 cascade 확인 모달 (Status 자식 있을 때)
- [c] P10-4: 등록된 노드 삭제 안내 토스트
- [c] P10-5c: `/api/artist/chat` 라우트 개편 — CanvasUpdate JSON validator (실호출 검증 필요)
- [c] P10-5d: `global-chat-store` artist 분기 — 캔버스 컨텍스트 + applyUpdates 적용
- [c] P10-5g: Warm starting 룰 기반 banner (`use-canvas-warm-starting` 훅)
- [c] P10-6: 이미지 생성 wire-up (H100 / Imagen 분기, 5-View 5장 / 16-Angle 16장)
- [c] P10-6: `Promise.allSettled` 부분 실패 허용 + 첫 에러 toast
- [c] P10-6: 노드별 loading 상태 (`generatingNodeIds`)
- [c] P10-6: World 16:9, Actor/Status 1:1 aspect ratio 자동
- [c] P10-7: Asset Storage → P4 export (`src/features/artist/asset-export.ts`)
- [c] P10-7: project-store wire-up — 전환 시 canvas/asset-storage reset + setProjectId

## Archived — 미착수 후속 (superseded)

- [ ] P10-6: 토큰 비용 정확화 (모델별 비용 차이 반영)
- [ ] P10-6: 비동기 큐 / 16-Angle 동시성 제한
- [ ] P10-7: Persistence key `<projectId>` 동적 isolation
- [ ] P10-7: Undo/Redo (Cmd/Ctrl+Z) — Zustand temporal middleware
- [ ] P10-7: artist-store deprecate 마이그레이션 (director/global-chat 의존 정리)
- [ ] B-7: 등록 임계값 실제 충족 검증 — 20장 충족 후 등록 폼 열리는지
- [ ] E-15: 노드별 loading 상태 (NodePopup + BaseNode) 통합 검증
- [ ] F-16: 프로젝트 전환 시 canvas reset / Asset Storage 보존
- [ ] 통합 시나리오 — 더블클릭 편집 / 헤더 Copy / RelationModal 2카테고리 / cascade 모달 신규 영역

## Blocked

- (없음 — quota reset 대기 항목은 Active 미진행 검증에 분류)

## Done (검증 완료 — 이 change 내)

- [x] P10-1: `@xyflow/react` 12.10.2 설치
- [x] P10-1: `canvas-store.ts` (Zustand + persist, 14 액션 + 8 selector)
- [x] P10-1: `asset-storage-store.ts`
- [x] P10-2: 캔버스 기본 — 더블클릭 모달 / snap 16px / 새로고침 보존 (라운드 1 OK)
- [x] P10-2: 빈 캔버스 hint
- [x] P10-2: 기존 패널 파일 4개 삭제
- [x] P10-4 우클릭 메뉴: 완전 제거 + BaseNode 헤더 Copy 아이콘 추가 (decisions #33)
- [x] P10-5a: `CanvasUpdate` union (10 액션) + `applyUpdates` + tempId 매핑
- [x] P10-5b: `serializeCanvasContext(state)` 헬퍼
- [x] F-7: 채팅 모델을 Claude API로 전환 (2026-05-17)
- [x] F-6: MeetingRoom → GlobalChat 통합 (2026-05-17)
- [x] F-2: 핀 연결 버그 — `connectionMode="loose"` (2026-05-17)
- [x] F-5: branchStatus parent 엣지 선 안 보이는 버그 — sourceHandle/targetHandle 명시 (2026-05-17)
- [x] F-D1: 엣지 카테고리 단순화 결정 (decisions #32)
- [x] F-D2: 우클릭 메뉴 처리 결정 (decisions #33)
- [x] F-1: 출력 모드 토글 가시성 — button 그룹 + 활성 시각
- [x] F-3: 엣지 카테고리 코드 적용 — RelationModal default = references
- [x] F-4: 우클릭 메뉴 제거 코드
- [x] 노드 더블클릭 = Edit 단축
- [x] 이미지 생성 API 진단 강화 (provider prefix + 콘솔 로그)
- [x] Imagen → Nano Banana 코드 전환 (decisions #34)

## Notes

- 임시 조치 (검증 종료 후 원복):
  - `project-store.canNavigateTo()` true 고정
  - `/api/generate/image` Nano Banana 사용 중. paid plan 결제 시 git history로 Imagen 복원
- 유닛 테스트: vitest 4.1.6, `tests/` 3 파일 / 32 케이스 / 136ms 통과 (2026-05-17)
