# Progress

> **harness 이행 작업 완료 (2026-05-27)**. 새 작업은 `specs/changes/<name>/tasks.md`에 작성 권장.
>
> **이 파일은 진행 중(live) 작업만 유지.** 완료/superseded된 과거 Phase(0~10)는
> `docs/progress-log/2026-Q1.md`로 분리(2026-06-05). 500줄 넘으면 분기별 롤오프.
> 전체 harness 설계 reference: `docs/research/claude-code-harness-design-for-tale-studio.md`

> **상태 범례** (모든 작업 항목에 적용):
> - `[ ]` 미착수
> - `[c]` **코드 작성 완료, 브라우저/사용자 검증 대기** ← 다음 세션 진입 시 우선 처리 대상
> - `[x]` 검증 완료 (코드 + 브라우저 확인 둘 다 ✓)
> - `[~]` 보류 (사유 명시)
>
> **DoD 표기**: 각 phase의 DoD는 `코드 ✓ / 검증 ✓` 둘 다 충족해야 완료. 한쪽만 되면 "코드 ✓ / 검증 대기" 명시.
>
> **다음 세션 진입 시 권장 액션**:
> 1. 이 파일에서 `grep '^- \[c\]' PROGRESS.md` 또는 아래 **검증 보드** 확인
> 2. 미검증 항목 사용자에게 1줄 보고 ("D-X 검증 대기 항목 N개 있음")
> 3. (a) [c] 검증 (b) 신규 작업 (c) 잡힌 버그 수정 (d) `specs/changes/` 진행 중 선택받기

---

## 현재 검증 보드 — 비어 있음 (2026-06-10 일괄 waive)

> **2026-06-10 사용자 결정**: 누적 `[c]` 43건 + changes 21건을 **검증 waive로 일괄 `[x]` 승격**.
> 사유: writer 영역이 외부 협업자에 의해 재작업 예정 — 현 시점 브라우저 검증은 재작업 후 무효화되므로 생략.
> 재작업 머지 후 회귀 확인이 필요하면 그때 신규 검증 항목으로 등록할 것 (**waive ≠ 브라우저 동작 보증**).

> **진행 중 changes/**: `chat-proactive-copilot`, `workspace-inventory` — 둘 다 코드 완료·검증 waive (archive 의식만 남음).
> 2026-06-05 archive: `unify-svc-writer-pipeline` / `writer-background-artist-progress` / `director-storyboard` /
>   `rollback-artist-card` / `redesign-director-canvas` / `unify-director-store-db` (검증 waive, decisions #39~#42, #49~#50).

**임시 조치 (여전히 유효)**:
- `project-store.canNavigateTo()` true 고정 — 원복 시점 미정
- `/api/generate/image`가 Nano Banana(`gemini-2.5-flash-image`) 사용 중 (decisions.md #34)

> 과거 Phase 0~10 (완료/superseded) 상세 로그는 `docs/progress-log/2026-Q1.md`.

---

## Phase 12: Artist 카드형 UI 복원 (2026-06-04~)

> Change: `specs/changes/rollback-artist-card/`
> 사유: 노드 그래프 Phase 10 미검증 누적 → 사용자 결정으로 카드형 롤백. asset-storage 백엔드 유지.

### 인프라 / 삭제 / 타입

- [x] `src/stores/canvas-store.ts` 삭제 (2026-06-04)
- [x] `src/features/artist/nodes/`, `edges/`, `canvas-popups/`, `hooks/` 삭제 (2026-06-04)
- [x] `src/features/artist/asset-export.ts` 삭제 (2026-06-04)
- [x] `src/types/asset.ts` — `GeneratedImage` 타입 이동 (2026-06-04)
- [x] `tsc --noEmit` exit 0 (2026-06-04)

### Artist UI (코드 ✓ / 검증 waive 2026-06-10)

- [x] `src/app/studio/artist/page.tsx` — Tabs(Characters/World/Inventory) 카드형 복원 — 코드 ✓ / 검증 waive 2026-06-10
- [x] `character-panel.tsx` / `world-panel.tsx` / `inventory-grid.tsx` / `image-placeholder.tsx` 복원 — 코드 ✓ / 검증 waive 2026-06-10
- [x] Register 버튼 → asset-storage-store 기록 동작 — 코드 ✓ / 검증 waive 2026-06-10
- [x] `global-chat-store` artist 분기 canvas-store 의존 제거 + 정적 warm tip — 코드 ✓ / 검증 waive 2026-06-10

### Director ShotNode 에셋 선택 (코드 ✓ / 검증 waive 2026-06-10)

- [x] ShotNodePopup 등장 캐릭터/월드 드롭다운/칩 UI (director_canvas.md §5.3) — 코드 ✓ / 검증 waive 2026-06-10
- [x] `characterAssetIds` / `worldAssetIds` 필드 채우기 — 코드 ✓ / 검증 waive 2026-06-10
- [x] `resolveShotAssetImages` 스토리보드 생성 레퍼런스 — 코드 ✓ / 검증 waive 2026-06-10

### 캐릭터 생성 + hover 정보 (2026-06-06, 코드 ✓ / 검증 waive 2026-06-10)

> 사용자 요청 3태스크 (Register 의미 설명 + 신규 캐릭터 생성 UI + 카드 hover 정보). tsc/lint clean.

- [x] `artist-store.addCharacter` 액션 + `createCharacter` ArtistUpdate + `applyUpdates` 분기 — 코드 ✓ / 검증 waive 2026-06-10
- [x] `POST /api/artist/character` — characters 테이블 insert (supabaseAdmin) — 코드 ✓ / 검증 waive 2026-06-10
- [x] `add-character-dialog.tsx` + 카드 하단 (+) 버튼 → 이름/role/설명/외형 Dialog → 카드 등장 — 코드 ✓ / 검증 waive 2026-06-10
- [x] 캐릭터 카드 이미지 hover → role/description/외형 + writer 등장 씬(narrativeSummary 배경) Tooltip — 코드 ✓ / 검증 waive 2026-06-10
- [x] `/api/artist/chat` 카드모델 재작성(createCharacter/regenerateCharacter/regenerateWorldAsset) + `global-chat-store` artist applyUpdates 활성화 → 채팅으로 캐릭터 생성 — 코드 ✓ / 검증 waive 2026-06-10

---

## Phase 11: P4 Director Canvas — 노드 그래프 재설계 (2026-05-25~)

### 🔴 현재 검증 보드 (2026-05-25)

| 항목 | 상태 | 비고 |
|------|------|------|
| D-1 인프라/타입/스토어/노드/엣지 | `[x]` (waive 06-10) | typecheck/lint clean (2026-05-25) |
| D-2 캔버스 페이지 + 모달들 + Inspector(임시) | `[x]` (waive 06-10) | next dev 부팅 OK (`Ready in 2.1s`) |
| **B-D1 빈 캔버스 더블클릭 → CreatorModal 안 뜨는 버그** | `[x]` (waive 06-10) | 사용자 보고(2026-05-25). CanvasInner fragment → wrapper div + onDoubleClick을 wrapper에 직접 등록(ReactFlow 내부 처리와 독립적 캡처). typecheck clean. 검증 waive 06-10 |
| D-3 NodePopup 3종 (Scene/Shot/Video) | `[x]` (waive 06-10) | 2026-05-25. Inspector aside 제거(결정 #12 완료). 검증 waive 06-10 |
| D-7 Agentic Director Canvas (채팅으로 노드 조작) | `[x]` (waive 06-10) | 2026-05-25. global-chat-store director 분기, /api/director/chat 개편, warm starting 훅. 검증 waive 06-10 |
| 환경 셋업: `.env.local` 복사 + `pnpm-workspace.yaml` allowBuilds true | `[x]` | 2026-05-25, `pnpm dev` 정상 부팅 |

다음 작업 진입 권장 순서:
1. 브라우저 검증 — B-D1 더블클릭 / D-3 NodePopup 3종 / D-7 채팅 노드 조작
2. 검증 OK 후 **D-5 영상 생성 wire-up** (Kling/Veo API + video_clips row + 폴링)
3. 또는 **D-4 Writer↔Director 양방향 sync** (Writer Scene/Shot 추가 → Director 자동 노드)
4. 마지막 단계: D-6 Preset Library → D-8 Editor 핸드오프 + 단계적 마이그레이션 정리


> 브랜치: TBD
> 스펙: `specs/layers/director_canvas.md` (결정 #1~#18 완료, Open Questions 해소)
> 패턴: Artist L0 Canvas (`L0_concept_canvas.md`)와 동일. Inspector 패널은 단계적 마이그레이션 (결정 #12).

### 결정 요약 (구현 시 참조)

| # | 결정 | 한 줄 |
|---|------|-------|
| 10 | 노드 색 | Scene=chart-3 / Shot=chart-4 / Video=chart-5 |
| 11 | Final 마킹 | Shot당 ★ 1개 강제. Video 헤더 별 아이콘 primary + NodePopup 토글 |
| 12 | Inspector 패널 | 단계적 — D-3에서 NodePopup이 흡수, Inspector aside 제거 완료 (2026-05-25) |
| 13 | Branch 변주 템플릿 | MVP 제외. Branch = 빈 새 Video 1개, 마더 설정 상속 |
| 14 | director-store | 점진적 — director-canvas-store가 메인, 기존 store는 이후 정리 |
| 15 | 노드 위치 저장 | shots/scenes에 `canvas_position` JSONB 컬럼 |
| 16 | Preset 적용 | 카메라/조명/렌즈 전체 덮어쓰기. prompt/참고이미지 유지 |
| 17 | Scene 박스 | 메타만, 자식 Shot 미니맵 X |
| 18 | 자동 배치 | 부모 Scene 우측 stacking, snap 16px |

### Phase D-1: 인프라 + 데이터 모델 (2026-05-25 완료)

- [x] DB 마이그레이션 `005_director_canvas_layout.sql` — scenes/shots/video_clips에 `canvas_position` JSONB + `is_final`, `take_label`, `override` 컬럼 + 부분 인덱스 (※ decisions #43: 005는 라이브 미적용·불필요로 정정. canvas_position은 localStorage 유지) — 검증 waive 2026-06-10
- [x] `src/types/director-canvas.ts` — `DirectorNodeKind`/`SceneNodeData`/`ShotNodeData`/`VideoNodeData`/`VideoOverride`/엣지 타입 + ID 헬퍼 + 레이아웃 상수 + type guards — 검증 waive 2026-06-10
- [x] `src/types/index.ts` — re-export 추가 — 검증 waive 2026-06-10
- [x] `src/stores/director-canvas-store.ts` — Zustand persist (key `tale-director-canvas-v1-default`). addSceneNode/addShotNode/addVideoTake/updateNodeData/deleteNode/setVideoFinal(Shot당 1개 강제)/setVideoStatus/applyVideoOverride/propagateStaleFromShot/cascade 삭제 confirm/relation modal/selectors(getChildShots, getChildVideos, getFinalVideo, getEffectiveShotConfig, nextShotPosition, nextScenePosition) — 검증 waive 2026-06-10
- [x] `src/features/director/canvas-nodes/{Base,Scene,Shot,Video}Node.tsx` — chart-3/4/5 매핑, Handle 4면, 헤더 액션(Edit/Branch/Copy 비활성/Delete), Video는 ★ Final 토글 헤더에 prim, override indicator 표시 — 검증 waive 2026-06-10
- [x] `src/features/director/canvas-edges/CategoryEdge.tsx` — parent 2px / relates-to 1.5px, selected 시 primary 색 — 검증 waive 2026-06-10

DoD:
- [x] `npx tsc --noEmit` clean (2026-05-25)
- [x] ESLint clean (2026-05-25)
- [x] Next.js compile 통과 (페이지 데이터 수집은 .env.local 미설정 무관 에러)
- [x] D-2에서 캔버스 페이지에 마운트 — `nodeTypes` / `edgeTypes` 등록 + 페이지 부팅 OK (2026-05-25)

### Phase D-2: 캔버스 + 노드 기본 UI (2026-05-25 코드 완료)

- [x] `src/app/studio/director/page.tsx` 재작성 — 좌 Meeting Room 세로 strip placeholder + 중 ReactFlow + 우 Inspector(단계적, 결정 #12) + 하 Palette placeholder + Legacy view 링크 — 검증 waive 2026-06-10
- [x] 기존 director/page.tsx → `legacy/page.tsx`로 이동 (검증 끝나면 삭제) — 검증 waive 2026-06-10
- [x] `CreatorModal` (`canvas-popups/CreatorModal.tsx`) — Scene/Shot 선택. Scene 0개면 Scene 강제, 기존 있으면 Shot 가능 + 부모 Scene 셀렉터 — 검증 waive 2026-06-10
- [x] `RelationModal` (`canvas-popups/RelationModal.tsx`) — relates-to 카테고리 + 자유 텍스트 — 검증 waive 2026-06-10
- [x] `DeleteConfirmModal` (`canvas-popups/DeleteConfirmModal.tsx`) — cascade 정보 + Final 영향 경고 — 검증 waive 2026-06-10
- [x] SceneNode Branch wire-up — `nextShotPosition`으로 형제 Shot 자동 stacking — 검증 waive 2026-06-10
- [x] 핀 connectionMode='loose' + 더블클릭 노드 생성 + Snap 16px + persist (zustand) — 이전 D-1 산출물 그대로 활용 — 검증 waive 2026-06-10
- [x] 빈 캔버스 hint ("캔버스를 더블클릭해서 첫 Scene을 만들어 보세요") — 검증 waive 2026-06-10
- [x] 우측 Inspector: 선택된 Shot 노드의 camera/lighting/cameraPreset을 기존 AngleControl/KeyLight/CameraPresetControl 컴포넌트로 편집 (단계적 마이그레이션, 결정 #12) — 검증 waive 2026-06-10
- [x] 핀 → 빈 공간 release: Scene→Shot, Shot→Video 자동 자식 생성 (Video는 leaf라 무시) — 검증 waive 2026-06-10
- [x] HandoffButton (Head to Editor) 그대로 유지 — 검증 waive 2026-06-10

DoD:
- [x] `npx tsc --noEmit` clean
- [x] ESLint clean (D-2 신규 파일)
- [x] `next dev` 부팅 성공 (`✓ Ready in 2.1s`)
- [~] 브라우저 검증 시나리오 — waive (2026-06-10 사용자 결정)

### Phase D-3: NodePopup (Scene / Shot / Video) (2026-05-25 코드 완료)

- [x] `DirectorNodePopup` 라우터 — popupNodeId 기반 분기 — 검증 waive 2026-06-10
- [x] `SceneNodePopup` — Location / TimeOfDay / Mood / Description + 자식 Shot 추가 버튼 — 검증 waive 2026-06-10
- [x] `ShotNodePopup` — prompt / 참고 이미지 업로드 + 제거 / 카메라 6축 (AngleControl) / 조명 (KeyLight) / 카메라 프리셋 (CameraPresetControl) / Provider 선택 / Branch=새 Video / 삭제 — 검증 waive 2026-06-10
- [x] `VideoNodePopup` — 마더 prefilled + override indicator / Final 토글 (헤더 ★) / 재생성 placeholder (D-5 wire-up) / 카메라·조명·렌즈 override 편집 — 검증 waive 2026-06-10
- [x] Video 헤더 ★ 아이콘 = Final 토글 (Shot당 1개 강제 enforce) — D-1에서 이미 완료 — 검증 waive 2026-06-10
- [x] director/page.tsx에 `<DirectorNodePopup />` 마운트 — 검증 waive 2026-06-10
- [x] 결정 #12 완료: 우측 Inspector aside 제거 (NodePopup이 흡수) — 검증 waive 2026-06-10

DoD:
- [x] `npx tsc --noEmit` clean
- [x] ESLint clean (D-3 신규 파일)
- [~] 브라우저 검증 — waive (2026-06-10 사용자 결정)

### Phase D-4: Writer ↔ Director 양방향 Sync

- [ ] Cross-store subscribe — `writer-store` ↔ `director-canvas-store`
- [ ] Writer Scene/Shot 추가 → Director 노드 자동 생성 (자동 배치 #18: 부모 Scene 우측 stacking)
- [ ] Director Shot 추가/수정/삭제 → Writer `shots[]` / `sceneManifest` 갱신
- [ ] 충돌 last-write-wins, Auto-Save 디바운스 유지
- [ ] cascade 삭제 모달 (Scene → Shot N개, Shot → Video N개)

DoD: Writer에서 Shot 추가 → Director 캔버스에 자동 배치된 Shot 노드 등장 / 반대도 동일

### Phase D-5: 영상 생성 wire-up (Shot → Video)

- [ ] Shot NodePopup `생성` 버튼 → `addVideoTake()` + `/api/director/generate-video` 호출
- [ ] 새 Video 노드는 마더 설정 상속 (#13)
- [ ] `generatingNodeIds` 상태 — 생성 중 spinner
- [ ] `video_clips` 테이블 row 생성 + `shot_id` FK
- [ ] 재생성 시 기존 Video url 덮어쓰기, stale 해제

DoD: Shot에서 생성 → Video 노드 생성 → 영상 완료 시 썸네일 + 재생

### Phase D-6: Camera/Light Preset Library (Palette)

- [ ] `src/stores/preset-storage-store.ts` 신규
- [ ] DB 마이그레이션 — `camera_light_presets` 테이블 (projectId, name, camera/lighting/cameraPreset JSONB)
- [ ] Palette 하단 탭 UI — 프리셋 카드 리스트
- [ ] Shot/Video NodePopup 안에 "이 셋업 프리셋으로 저장" 버튼
- [ ] 프리셋 카드 드래그 → 노드 drop → 카메라/조명/렌즈 **전체 덮어쓰기 (#16)**, prompt 유지

DoD: 셋업 저장 → 다른 Shot에 드래그 → 적용 확인

### Phase D-7: Meeting Room — Agentic Director Canvas (2026-05-25 코드 완료)

- [x] `DirectorCanvasUpdate` union (13 액션: addScene/addShot/updateScene/updateShot/addVideoTake/setCamera/setLighting/setCameraPreset/generateVideo/connect/requestDelete/selectNode) + `applyUpdates()` + tempId 매핑 — 검증 waive 2026-06-10
- [x] `serializeDirectorCanvasContext(state)` 헬퍼 — Scene→Shot→Video 트리 + 통계 + 선택 노드 풀 정보 — 검증 waive 2026-06-10
- [x] `/api/director/chat` 개편 — Legacy/Canvas 분기 (canvasContext 유무로). DIRECTOR_CANVAS_SYSTEM 프롬프트 + validateCanvasUpdates 검증 — 검증 waive 2026-06-10
- [x] `global-chat-store` director 분기 — canvas nodes 있으면 canvasContext 전달, applyUpdates 적용. Legacy 응답(suggestedCamera 등)도 backward compat 유지 — 검증 waive 2026-06-10
- [x] 우측 floating GlobalChat 그대로 사용 (Artist와 동일 패턴, 별도 좌측 도킹 컴포넌트 미생성 — Artist도 같음) — 검증 waive 2026-06-10
- [x] `use-director-canvas-warm-starting.ts` 훅 — Scene 0 / Shot 0 / Video 0 / Final 누락 / 같은 Shot Video ≥3 5단계 룰 — 검증 waive 2026-06-10
- [x] GlobalChat에서 artistWarmTip / directorWarmTip 둘 다 wire-up — 검증 waive 2026-06-10

DoD:
- [x] `npx tsc --noEmit` clean
- [x] ESLint clean
- [~] 브라우저 검증 시나리오 — waive (2026-06-10 사용자 결정)

### Phase D-8: Editor 핸드오프 + Inspector 정리

- [ ] "Head to Editor →" 버튼 → 각 Shot의 ★ Final Video를 editor-store clips에 export
- [ ] Final 누락 Shot 경고 토스트 (마지막 Video fallback)
- [ ] 노드 그래프 안정성 검증 후 기존 Inspector 패널 제거 (#12 단계적 마이그레이션 완료)
- [ ] 기존 `director-store.ts` 의존(Director Chat 등) 정리 → `director-canvas-store.ts`로 통합 (#14)
- [ ] 구 `/studio/director` 컴포넌트 (angle-control, key-light, cinematographic-inspector, etc.) 삭제

DoD: Director Canvas만으로 P4 전체 기능 동작. 구 패널·store 제거

### 알려진 빚 / 결정 사항

- director-store는 D-8까지 살림 (#14)
- Inspector 패널은 D-8까지 단계 마이그레이션 (#12)
- 노드 위치 좌표는 localStorage(Zustand persist) — 005 마이그레이션 불필요 확정 (#43)
- Branch 변주 템플릿 (조명만 / 렌즈만)은 MVP 제외 (#13). 사용 패턴 명확해지면 후속 phase

---

## TODO: P4 Director — Depth Parallax 카메라 프리뷰 (미착수)

> 카메라 슬라이더 조작 시 샷 이미지가 실시간으로 3D 시차 효과로 움직이는 기능

### 배경
- 현재 카메라 6축 슬라이더는 **영상 생성(Kling) 프롬프트에만** 반영됨
- 이미지 생성에는 카메라 설정 미반영 → 슬라이더 움직여도 이미지 변화 없음
- CSS 3D transform은 종이 돌리는 느낌이라 부적합

### 계획
- [ ] H100 서버에 **Depth Anything V2 Large** API 엔드포인트 추가 (이형석 요청)
- [ ] 샷 이미지 생성 시 depth map 자동 생성 + 함께 저장
- [ ] R3F Canvas + 커스텀 GLSL parallax shader 컴포넌트 (~300줄)
- [ ] 카메라 슬라이더 6축 → shader uniform 연결 (실시간 60fps)
- [ ] 가장자리 처리 (mirror/stretch UV)

### 참고
- 기법: Fragment shader UV offset (DepthFlow / Immersity AI와 동일 방식)
- Depth Anything V2 Large: H100에서 ~50ms/장, 1회 생성 후 캐시
- Three.js / R3F 이미 프로젝트 스택에 포함

## Backlog

- [ ] Kling API 키 → Vercel 환경변수 `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` 등록
- [ ] 전체 파이프라인 E2E 검증 (P1→P5)
- [ ] Tailscale 502 에러 — H100 이미지 서버 프로세스 상태 확인 (이형석)
