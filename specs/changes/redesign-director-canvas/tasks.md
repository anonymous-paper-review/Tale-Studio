# redesign-director-canvas — Tasks

> PROGRESS.md Phase 11 (D-1~D-8) mirror. 원본 PROGRESS.md는 그대로 유지.
> Spec: `specs/layers/director_canvas.md` (결정 #1~#18 완료). Artist 카드/팝업 패턴(`src/features/artist/`) 참고.

## Active (브라우저 검증 대기)

### D-1: 인프라 + 데이터 모델 (2026-05-25 코드 완료)
- [c] DB 마이그레이션 `005_director_canvas_layout.sql` — scenes/shots/video_clips에 `canvas_position` JSONB + `is_final`, `take_label`, `override` 컬럼 + 부분 인덱스
- [c] `src/types/director-canvas.ts` — `DirectorNodeKind`, Scene/Shot/Video NodeData, VideoOverride, 엣지 타입, ID 헬퍼, 레이아웃 상수, type guards
- [c] `src/types/index.ts` — re-export 추가
- [c] `src/stores/director-canvas-store.ts` — Zustand persist (key `tale-director-canvas-v1-default`). addSceneNode/addShotNode/addVideoTake/updateNodeData/deleteNode/setVideoFinal(Shot당 1개 강제)/setVideoStatus/applyVideoOverride/propagateStaleFromShot/cascade 삭제 confirm/relation modal + selectors (getChildShots / getChildVideos / getFinalVideo / getEffectiveShotConfig / nextShotPosition / nextScenePosition)
- [c] `src/features/director/canvas-nodes/{Base,Scene,Shot,Video}Node.tsx` — chart-3/4/5 매핑, Handle 4면, 헤더 액션 (Edit/Branch/Copy 비활성/Delete), Video는 ★ Final 토글 헤더 primary, override indicator
- [c] `src/features/director/canvas-edges/CategoryEdge.tsx` — parent 2px / relates-to 1.5px, selected 시 primary 색

### D-2: 캔버스 + 노드 기본 UI (2026-05-25 코드 완료)
- [c] `src/app/studio/director/page.tsx` 재작성 — 좌 Meeting Room strip placeholder + 중 ReactFlow + 우 Inspector(단계적) + 하 Palette placeholder + Legacy view 링크
- [c] 기존 director/page.tsx → `legacy/page.tsx` 이동
- [c] `CreatorModal` — Scene/Shot 선택. Scene 0개면 Scene 강제, 기존 있으면 Shot 가능 + 부모 Scene 셀렉터
- [c] `RelationModal` — relates-to 카테고리 + 자유 텍스트
- [c] `DeleteConfirmModal` — cascade 정보 + Final 영향 경고
- [c] SceneNode Branch wire-up — `nextShotPosition`으로 형제 Shot 자동 stacking
- [c] 핀 connectionMode='loose' + 더블클릭 노드 생성 + Snap 16px + persist
- [c] 빈 캔버스 hint
- [c] 우측 Inspector: 선택된 Shot의 camera/lighting/cameraPreset을 기존 AngleControl/KeyLight/CameraPresetControl로 편집 (단계적, 내부 #12)
- [c] 핀 → 빈 공간 release: Scene→Shot, Shot→Video 자동 자식 생성
- [c] HandoffButton (Head to Editor) 유지
- [c] **B-D1**: 빈 캔버스 더블클릭 → CreatorModal 안 뜨는 버그 fix — CanvasInner fragment → wrapper div + onDoubleClick을 wrapper에 직접 등록 (사용자 보고 2026-05-25, typecheck clean)

### D-3: NodePopup (Scene / Shot / Video) (2026-05-25 코드 완료)
- [c] `DirectorNodePopup` 라우터 — popupNodeId 기반 분기
- [c] `SceneNodePopup` — Location / TimeOfDay / Mood / Description + 자식 Shot 추가 버튼
- [c] `ShotNodePopup` — prompt / 참고 이미지 업/제거 / 카메라 6축 / 조명 / 카메라 프리셋 / Provider 선택 / Branch=새 Video / 삭제
- [c] `VideoNodePopup` — 마더 prefilled + override indicator / Final 토글 (헤더 ★) / 재생성 placeholder (D-5) / 카메라·조명·렌즈 override 편집
- [c] Video 헤더 ★ 아이콘 = Final 토글 (Shot당 1개 enforce)
- [c] director/page.tsx에 `<DirectorNodePopup />` 마운트
- [c] Inspector aside 제거 (NodePopup 흡수, 내부 #12 완료)

### D-7: Meeting Room — Agentic Director Canvas (2026-05-25 코드 완료)
- [c] `DirectorCanvasUpdate` union (13 액션: addScene/addShot/updateScene/updateShot/addVideoTake/setCamera/setLighting/setCameraPreset/generateVideo/connect/requestDelete/selectNode) + `applyUpdates` + tempId 매핑
- [c] `serializeDirectorCanvasContext(state)` 헬퍼 — Scene→Shot→Video 트리 + 통계 + 선택 노드 풀 정보
- [c] `/api/director/chat` 개편 — Legacy/Canvas 분기. DIRECTOR_CANVAS_SYSTEM 프롬프트 + validateCanvasUpdates 검증
- [c] `global-chat-store` director 분기 — canvasContext 전달, applyUpdates 적용. Legacy 응답 backward compat 유지
- [c] `use-director-canvas-warm-starting.ts` 훅 — Scene 0 / Shot 0 / Video 0 / Final 누락 / 같은 Shot Video ≥3 5단계 룰
- [c] GlobalChat에서 artistWarmTip / directorWarmTip 둘 다 wire-up

## Active (미착수)

### D-4: Writer ↔ Director 양방향 Sync
- [ ] Cross-store subscribe — `writer-store` ↔ `director-canvas-store`
- [ ] Writer Scene/Shot 추가 → Director 노드 자동 생성 (자동 배치 내부 #18)
- [ ] Director Shot 추가/수정/삭제 → Writer `shots[]` / `sceneManifest` 갱신
- [ ] 충돌 last-write-wins, Auto-Save 디바운스 유지
- [ ] cascade 삭제 모달 (Scene → Shot N개, Shot → Video N개)

### D-5: 영상 생성 wire-up (Shot → Video)
- [ ] Shot NodePopup `생성` → `addVideoTake()` + `/api/director/generate-video` 호출
- [ ] 새 Video 노드 마더 설정 상속 (내부 #13)
- [ ] `generatingNodeIds` 상태 spinner
- [ ] `video_clips` row 생성 + `shot_id` FK
- [ ] 재생성 시 기존 Video url 덮어쓰기, stale 해제

### D-6: Camera/Light Preset Library (Palette)
- [ ] `src/stores/preset-storage-store.ts` 신규
- [ ] DB 마이그레이션 — `camera_light_presets` (projectId, name, camera/lighting/cameraPreset JSONB)
- [ ] Palette 하단 탭 UI — 프리셋 카드 리스트
- [ ] Shot/Video NodePopup "이 셋업 프리셋으로 저장" 버튼
- [ ] 프리셋 카드 드래그 → 노드 drop → 전체 덮어쓰기 (내부 #16), prompt 유지

### D-8: Editor 핸드오프 + Inspector 정리
- [ ] "Head to Editor →" → 각 Shot의 ★ Final Video를 editor-store clips에 export
- [ ] Final 누락 Shot 경고 토스트 (마지막 Video fallback)
- [ ] 기존 Inspector 패널 제거 (내부 #12 단계 마이그레이션 완료)
- [ ] 기존 `director-store.ts` 의존(Director Chat 등) 정리 → `director-canvas-store.ts`로 통합 (내부 #14)
- [ ] 구 `/studio/director` 컴포넌트 (angle-control, key-light, cinematographic-inspector, etc.) 삭제

## Done (검증 완료 — 이 change 내)

- [x] 환경 셋업: `.env.local` 복사 + `pnpm-workspace.yaml` allowBuilds true (2026-05-25, `pnpm dev` 정상 부팅)

## Notes

- 브라우저 검증 시나리오 (D-2/D-3/D-7): 더블클릭 Scene 생성 / Scene Branch→Shot 자동 / Shot Branch→Video 자동 / 핀-핀 연결→RelationModal / 노드 선택→Inspector 슬라이더 / Delete→cascade 모달 / 새로고침 보존 / NodePopup camera/lighting/lens / Final 토글 ★ Shot당 1개 / 채팅 "오프닝 씬 만들어줘" → addScene / "이 영상 삭제해줘" → DeleteConfirmModal
- 알려진 빚: director-store는 D-8까지 살림 (내부 #14). Inspector 패널은 D-8까지 단계 마이그레이션 (내부 #12). 노드 위치 좌표는 shots/scenes JSONB 컬럼 (내부 #15) — 별도 layout 테이블 없음. Branch 변주 템플릿 MVP 제외 (내부 #13)
