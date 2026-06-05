# director-storyboard — Tasks

> PROGRESS.md mirror. 원본 PROGRESS.md는 그대로 유지.
> Spec: `specs/layers/director_canvas.md`. 관련 change: `redesign-director-canvas`(D-5 영상 생성 wire-up과 연속).
> 마커: `[ ]` 미착수 / `[c]` 코드완료·브라우저 검증 대기 / `[x]` 검증완료 / `[~]` 보류.

## Active

### ST-1: 데이터 모델 + 마이그레이션 (2026-06-04 코드 완료)
- [x] `src/types/director-canvas.ts` — `ShotNodeData`에 `storyboardImage: StoryboardImage | null`
      + `generationMethod: GenerationMethod`(shot.ts 재사용) 추가 (TS clean)
- [x] `StoryboardImage` 타입 신설 + `referenceImages[]` "유저 업로드 보조" 주석 명시 + index.ts re-export
- [x] `director-canvas-store.ts` `makeShotData` 기본값: `storyboardImage: null`, `generationMethod: 'T2V'`
- [x] persist — `nodes` 배열 전체를 partialize하므로 새 필드 자동 영속화. **필드별 화이트리스트 없음 → 별도 작업 불필요**
- [x] `shotConfigKeys`(stale 트리거)에 `generationMethod`/`storyboardImage` 추가 — 변경 시 자식 Video stale
- [x] DB 마이그레이션 `006_shot_storyboard_image.sql` 작성 (`shots.storyboard_image` JSONB +
      `shots.generation_method` TEXT NOT NULL DEFAULT 'T2V'). 파일 ✓ / **라이브 적용 확인됨**
      (2026-06-05 `_refresh.py` introspection: `shots.storyboard_image` jsonb + `generation_method` 존재)

### ST-2: I2I 스토리보드 이미지 생성 (2026-06-04 코드 완료)
- [c] asset 이미지 해석 헬퍼 `resolveShotAssetImages(data)` — `characterAssetIds`+`worldAssetIds`를
      `asset-storage-store`의 `referenceImages`(없으면 `views.single[0].url`) URL로 해석해 수집
- [c] `/api/generate/image` FAL 전환 + I2I 확장 — `provider` 기본 `'fal'`, `referenceImageUrls: string[]` 입력 수용.
      fal 래퍼(`src/lib/svc/llm/fal.ts`)가 reference 있으면 자동으로 `openai/gpt-image-2/edit`(I2I)로 라우팅.
      바이트 반환 계약 유지(호출부 blob 소비 3곳 무영향). gemini/tailscale은 명시 opt-in으로 보존.
      (2026-06-04 코드 완료, src/ typecheck clean / 브라우저 생성 검증 대기)
      → I2I 모델 경로 **검증 완료**: gpt-image-2/edit (당초 "미검증 리스크" 해소)
- [c] store 액션 `generateStoryboardImage(shotNodeId)` — asset 결합 + 샷 prompt → I2I 호출 →
      `storyboardImage` 채움, status 전이(generating→completed/failed). blob→`/api/assets/upload-image` 영속화
- [c] store 액션 `generateAllStoryboardImages()` — 씬 순서대로 모든 샷 순차 생성
- [c] "스토리보드 생성" 버튼(하단 Palette bar, 채팅 왼쪽) — 진행률 `N/총` + spinner + disabled 처리

### ST-3: 뷰 전환 + 스토리보드 그리드 뷰 (2026-06-04 코드 완료)
- [c] `viewMode: 'node' | 'storyboard'` 상태(director-canvas-store) + `setViewMode` + persist partialize
- [c] 뷰 토글 UI — 하단 Palette bar Node/Storyboard 세그먼트(레이아웃 `mr-80`으로 채팅 왼쪽에 위치)
- [c] `StoryboardGridView`(`canvas-views/`) — 씬별 그룹(+orphan) + 샷 셀 그리드, 썸네일/placeholder + 라벨 + prompt line-clamp-2
- [c] 셀 우하단 액션: completed → ▶▶(영상생성, accent), generating → spinner, 그 외 → 🖼(이미지생성, failed시 errorMessage tooltip)
- [c] 셀 더블클릭 → `openPopup` (기존 `DirectorNodePopup` 재사용, storyboard 뷰에도 마운트)
- [c] `director/page.tsx` viewMode 분기(ReactFlow vs StoryboardGridView), GlobalChat은 레이아웃 레벨 유지

### ST-4: I2V wire-up (storyboardImage → 영상) (2026-06-04 코드 완료)
- [c] store 액션 `generateVideoForShot(shotNodeId)` — `addVideoTake` + `/api/director/generate-video` POST + 폴링
- [c] 레퍼런스 결정: storyboardImage(completed) 우선 → referenceImages[0] → 없으면 T2V. generationMethod 자동 I2V/T2V
- [~] Writer 시간 축 연출 정보(움직임/카메라 동선) I2V 프롬프트 투입 — **보류**: director-canvas Shot에 movement 필드
      없음 + writer-store 연동 필요(D-4 sync 이후). 현재 Shot prompt만 투입(코드에 TODO 명시)
- [c] 완료 시 Video 노드 `videoUrl`/`status` 갱신(`setVideoStatus`), provider 매핑(kling/veo→fal), 영상 영속화
- [c] 노드뷰/그리드뷰 공통 store 액션 — 그리드 ▶▶에서 호출(노드뷰 NodePopup 연결은 후속)

## Blocked
- (없음)

## Done
- (없음)

## Notes
- 영상 생성은 **항상 사용자 클릭**으로만(자동 X, 내부 #40). 일괄은 이미지(ST-2)까지만, 영상은 샷별 클릭.
- I2I 모델 계약은 ST-2에서 실제 검증 후 확정(추측 금지) — Gemini 멀티모달 입력 가능 여부에 따라 경로 분기.
- `generationMethod` 필드는 기존 API(`generate-video/route.ts`)가 이미 요구하던 값 — 타입 불일치 해소 포함.
- redesign-director-canvas의 D-4(Writer↔Director sync)가 선행되면 샷 자동 생성이 매끄럽지만, 본 change는
  이미 존재하는 Shot 노드 기준으로 독립 동작 가능.
