---
change: redesign-director-canvas
status: active
created: 2026-05-25
decisions: [20, 26]
internal_decisions: [10, 11, 12, 13, 14, 15, 16, 17, 18]
---

# Redesign Director (P4) to Node Canvas

## Why

P4 Director는 V2 디자인에서 Scene Navigator + Shot Node Grid-Mindmap + Cinematographic Inspector + Director Chat의 3패널 통합으로 정의되었다 (decisions #26). 그러나 *Grid-Mindmap*과 *Inspector*의 별도 패널 운영은 Scene→Shot→Video 관계 표현에 한계가 있고, Artist L0 Canvas와의 메탈모델 일관성도 떨어진다. **Director를 노드 그래프로 재설계**하여 Scene/Shot/Video 트리를 명시적으로 표현하고, Inspector는 NodePopup으로 흡수한다.

기반 결정은 decisions #26 (P4 Storyboard 통합) + decisions #20 (Kling 6축). Director Canvas 내부 결정 #10~#18은 `specs/layers/director_canvas.md`에 정의되어 있다.

## What Changes

- React Flow (xyflow) 기반 노드 그래프 — Artist 카드/팝업 패턴(`src/features/artist/`) 참고
- **3종 노드**: Scene / Shot / Video (decisions #10 — Scene=chart-3, Shot=chart-4, Video=chart-5)
- **Final 마킹**: Shot당 ★ 1개 강제. Video 헤더에 별 아이콘 primary + NodePopup 토글 (내부 #11)
- **Inspector → NodePopup 흡수**: 단계적 마이그레이션. D-3 완료 시 우측 Inspector aside 제거 (내부 #12)
- **Branch 변주 템플릿**: MVP 제외. Branch = 빈 새 Video 1개, 마더 설정 상속 (내부 #13)
- **store**: `director-canvas-store` 신설. 기존 `director-store`는 D-8까지 점진 유지 (내부 #14)
- **노드 위치 저장**: `scenes` / `shots` / `video_clips` 테이블에 `canvas_position` JSONB 컬럼 (내부 #15)
- **Preset 적용**: 카메라/조명/렌즈 전체 덮어쓰기. prompt / 참고이미지 유지 (내부 #16)
- **Scene 박스**: 메타만 표시, 자식 Shot 미니맵 X (내부 #17)
- **자동 배치**: 부모 Scene 우측 stacking, snap 16px (내부 #18)
- **Agentic Director Canvas**: `DirectorCanvasUpdate` union 13 액션. global-chat-store director 분기, `/api/director/chat` 개편. Artist와 동일 패턴
- **DB 마이그레이션 `005_director_canvas_layout.sql`**: scenes/shots/video_clips에 `canvas_position` JSONB + `is_final`, `take_label`, `override` 컬럼 + 부분 인덱스
- **Kling 6축 카메라**: AngleControl / KeyLight / CameraPresetControl 컴포넌트 재사용 (decisions #20)

## Impact

- **Affected specs**: `specs/layers/director_canvas.md` (source-of-truth, 본 change에서 본문 작성)
- **Affected code**: `src/features/director/` 전면 — `canvas-nodes/`, `canvas-edges/`, `canvas-popups/`, `hooks/`. `src/app/studio/director/page.tsx` 재작성. `src/app/studio/director/legacy/page.tsx`로 이동 (D-8까지 유지). `src/app/api/director/chat/route.ts` 개편
- **Affected stores**: `src/stores/director-canvas-store.ts` (신규), `src/stores/director-store.ts` (D-8까지 점진 유지), `src/stores/global-chat-store.ts` (director 분기), `src/stores/writer-store.ts` (D-4 양방향 sync)
- **Affected types**: `src/types/director-canvas.ts` (신규), `src/types/index.ts` (re-export)
- **Affected DB**: scenes / shots / video_clips 테이블 schema 확장
- **Affected decisions**: #20, #26 (+ director_canvas.md 내부 #10~#18)

## Verification gate (archive 조건)

- `tasks.md`의 모든 `[c]`가 `[x]`로 승격 (D-1 ~ D-8)
- 브라우저 검증 시나리오: 더블클릭 Scene 생성 / Branch→Shot→Video 자동 / RelationModal / Inspector 슬라이더 (또는 NodePopup) / cascade 삭제 / 새로고침 보존 / 채팅 노드 조작
- 영상 생성 wire-up (D-5)으로 실제 Kling/Veo 생성 end-to-end 동작
- Director Canvas만으로 P4 전체 기능 동작. 구 패널·store 제거 완료
- `specs/layers/director_canvas.md`에 final state 반영
- decisions.md에 archive 사실 1줄 append
