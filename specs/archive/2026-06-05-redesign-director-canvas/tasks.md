# redesign-director-canvas — Tasks

> PROGRESS.md Phase 11 (D-1~D-8) mirror. 원본 PROGRESS.md는 그대로 유지.
> Spec: `specs/layers/director_canvas.md` (결정 #1~#18 완료). Artist 카드/팝업 패턴(`src/features/artist/`) 참고.

## Active (브라우저 검증 대기)

### D-1: 인프라 + 데이터 모델 (2026-05-25 코드 완료)
- [~] DB 마이그레이션 `005_director_canvas_layout.sql` — **불필요 확정 (decision #43, 2026-06-05)**. 노드 위치는
      DB가 아니라 Zustand persist(localStorage)에 저장 (`grep canvas_position src/` = 0건). 라이브 미적용 유지.
      향후 D-4를 DB 영속으로 구현하면 재검토.
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

## Dropped (decision #44, 2026-06-05 — 사용자 스코프 결정)

### D-4: Writer ↔ Director **양방향** Sync — **폐기 (지금 안 함)**
- [~] Cross-store subscribe / Director→Writer 역반영 / last-write-wins 충돌해소 일체 **드롭**.
      양방향 라이브 sync 미구현. 대신 아래 D-4S 단방향 seed만 채택(decision #44/#45).

### D-8(일부): Editor 핸드오프 — **폐기 (지금 안 함)**
- [~] "Head to Editor →" Final Video export / Final 누락 토스트 **드롭**. editor 연동은 지금 작업 아님.

## Active (미착수)

### D-4S: Writer → Director 단방향 Seed (1회 로드, decision #45)
> ✅ **이미 구현돼 있었음** — `src/features/director/hooks/use-writer-director-sync.ts`(page.tsx:338 wire).
>   단방향 create-only, writerSceneId/writerShotId로 멱등, `nextScenePosition`/`nextShotPosition` 사용,
>   프롬프트+에셋 바인딩 + 스토리보드 자동생성(병렬3,1회)까지. **코드 ✓ / 브라우저 검증만 남음.**
- [c] Writer scenes/shots → 캔버스 노드 1회 seed (멱등) — 코드 ✓ / 검증 대기

### D-5: 영상 생성 wire-up — NodePopup 경로 (2026-06-05 코드 완료)
> store `generateVideoForShot` + 그리드뷰 ▶▶(StoryboardGridView)는 director-storyboard에서 이미 구현.
- [c] store: `regenerateVideo(videoNodeId)` 액션 추출(기존 Video 노드 effective 설정으로 재생성),
      `generateVideoForShot`는 addVideoTake+regenerateVideo로 리팩터 — tsc clean / 검증 대기
- [c] `ShotNodePopup` "새 Video 테이크 생성" → addVideoTake + openPopup + `regenerateVideo`(실제 생성).
      "Branch (빈 테이크)"는 빈 노드 유지 — 코드 ✓ / 검증 대기
- [c] `VideoNodePopup` "재생성" placeholder 제거 → `regenerateVideo(nodeId)` 실호출,
      `generatingNodeIds` spinner(setVideoStatus가 관리) — 코드 ✓ / 검증 대기

### D-6: Camera/Light Preset Library (Palette) — DB 백엔드 (decision #46, 2026-06-05 코드 완료)
- [c] `src/stores/preset-storage-store.ts` 신규 — DB 백엔드(persist 미사용), load/save/delete. tsc/eslint clean
- [c] API `src/app/api/director/presets/route.ts` — GET(projectId)/POST/DELETE, getUser+supabaseAdmin, camera_preset↔cameraPreset 매핑
- [x] DB 마이그레이션 `011_camera_light_presets.sql` — **라이브 적용 완료** (2026-06-05).
      `_apply_migration.mjs` 적용 + `NOTIFY pgrst reload schema` → PostgREST 200 확인 + `_refresh.py` 캐시 반영(camera_light_presets 0 rows)
- [c] Palette 프리셋 카드 스트립(`page.tsx` PaletteBar) — projectId effect 로드, 카드 + × 삭제 — 코드 ✓ / 검증 대기
- [c] Shot/Video NodePopup "이 셋업 프리셋으로 저장" 버튼(`window.prompt` 이름) — 코드 ✓ / 검증 대기
- [c] 프리셋 카드 드래그 → 노드 drop(`BaseNode`) → camera/lighting/cameraPreset 전체 덮어쓰기, prompt 유지
      (Shot=updateNodeData[자동 stale 전파], Video=applyVideoOverride) — 코드 ✓ / 검증 대기
- [x] **보안 IDOR 해결** (2026-06-05) — presets 라우트 GET/POST/DELETE에 `isProjectOwned(projectId, user.id)`
      가드 추가(`workspaces.owner_id` → `projects.workspace_id` 패턴, project/init과 동일). 미소유 시 403. tsc/eslint clean.

### D-8(잔여): 레거시 정리 (2026-06-05 — 안전분 완료, decision #47)
> editor export는 드롭(#44). Inspector aside는 D-3에서 이미 제거됨(#12).
- [x] `movement-control.tsx` 삭제 — 고아(grep 0건)
- [x] `legacy/page.tsx` 삭제 + PaletteBar "Legacy view" 링크/`next/link`·`ArrowUpRight` import 제거 + 빈 legacy 디렉토리 제거
- [x] `cinematographic-inspector.tsx` 삭제 — legacy 페이지 전용이었음
- [~] **`director-store.ts` 제거는 보류** — task 원문은 "구 컴포넌트 삭제(angle-control/key-light/camera-preset-control 등)"였으나
      angle-control/key-light/camera-preset-control은 **새 NodePopup이 재사용 중**이라 삭제 불가(유지).
      director-store(780줄)는 **legacy가 아니라 load-bearing**: `editor-store`(핸드오프 read) + `global-chat-store`
      (legacy director chat 분기)가 의존. 제거하려면 그 두 store 마이그레이션 필요 → **별도 change**로 분리(decision #47).

## Done (검증 완료 — 이 change 내)

- [x] 환경 셋업: `.env.local` 복사 + `pnpm-workspace.yaml` allowBuilds true (2026-05-25, `pnpm dev` 정상 부팅)

## Notes

- 브라우저 검증 시나리오 (D-2/D-3/D-7): 더블클릭 Scene 생성 / Scene Branch→Shot 자동 / Shot Branch→Video 자동 / 핀-핀 연결→RelationModal / 노드 선택→Inspector 슬라이더 / Delete→cascade 모달 / 새로고침 보존 / NodePopup camera/lighting/lens / Final 토글 ★ Shot당 1개 / 채팅 "오프닝 씬 만들어줘" → addScene / "이 영상 삭제해줘" → DeleteConfirmModal
- 알려진 빚: director-store는 D-8까지 살림 (내부 #14). Inspector 패널은 D-8까지 단계 마이그레이션 (내부 #12). 노드 위치 좌표는 shots/scenes JSONB 컬럼 (내부 #15) — 별도 layout 테이블 없음. Branch 변주 템플릿 MVP 제외 (내부 #13)
