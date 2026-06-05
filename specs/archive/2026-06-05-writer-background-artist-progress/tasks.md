# writer-background-artist-progress — Tasks

> PROGRESS.md mirror. 원본 PROGRESS.md는 그대로 유지.
> 마커: `[ ]` 미착수 · `[c]` 코드 완료/검증대기 · `[x]` 검증완료 · `[~]` 보류

## Active

### Section 1: 네비 & 핸드오프 전환
- [c] 1-1. 사이드바에서 writer 탭 숨김 (`sidebar.tsx` STAGES.filter). writer route 유지 — 코드 ✓ / 검증 대기
- [c] 1-2. producer 핸드오프 목적지 `/studio/writer` → `/studio/artist` (`producer/page.tsx`) — 코드 ✓ / 검증 대기
- [c] 1-3. `current_stage: 'artist'` + `setStage('artist')` (producer-store `saveAndHandoff`) — 코드 ✓ / 검증 대기
- [c] 1-4. writer 씬 생성 트리거를 producer 핸드오프에서 fire-and-forget 발사 + writer-page 자동생성 effect 제거 — 코드 ✓ / 검증 대기
- [c] 1-5. svc/start 점검 — svc 파이프라인은 DB 미기록(로그만)이라 generate-scenes(DB)와 충돌 없음, 둘 다 발사 확인 — 코드 ✓

### Section 2: Writer UI 정리
- [c] 2-1. writer 페이지 두 분기 `<MediaGenerationPanel>` 제거 + import 제거 (컴포넌트 파일 보존) — 코드 ✓ / 검증 대기
- [c] 2-2. writer 자동생성 effect/미사용 state(storyText·autoGenTriggered·generateScenes) 정리. 씬 편집 UI는 직접 URL 접근용 존치 — 코드 ✓
- [c] 2-3. svc asset 경로 호출자(MediaGenerationPanel) 소멸 확인. 라우트(`generate/assets`·`resume/assets`)는 무해하게 잔존(미사용) — 코드 ✓ / §5에서 최종 정리

### Section 3: Artist 첫 진입 progress gating
- [c] 3-1. svc 진행 UI를 공유 컴포넌트 `src/components/layout/svc-progress.tsx`로 추출, writer 페이지도 이를 사용하도록 교체 — 코드 ✓
- [c] 3-2. artist 빈 상태 → `SvcProgress`(블로킹) / svc 실패 시 실패 메시지로 교체 ("Complete the Script Room first" 제거) — 코드 ✓ / 검증 대기
- [c] 3-3. artist에 `useSvcStatus` + 데이터 미준비 시 `loadData()` 3초 폴링 재로드 — 코드 ✓ / 검증 대기
- [c] 3-4. 데이터 준비(characterAssets/worldAssets) 시 카드 UI 자동 전환 — 코드 ✓ / 브라우저 확인 필요

### Section 4: 뷰 모델 변경 (타입 + DB)
- [c] 4-1. `CharacterAsset.views` → `{main, front, back, sideLeft, sideRight}` (asset.ts: 타입/KEYS/COLUMNS/LABELS) — 코드 ✓
- [x] 4-2. 마이그레이션 `010_character_turnaround_views.sql` 적용 (view_main/view_side_left/view_side_right 추가) + database.ts 재생성 — 라이브 적용·컬럼 확인 ✓
- [c] 4-3. artist-store/director-store `loadData` 매핑 + mocks 갱신 (새 컬럼 read) — 코드 ✓
- [c] 4-4. 참조처 일괄 수정 (asset-storage-store 어댑터 .side→sideLeft/right, character-view-dialog) — 코드 ✓ / tsc·eslint 클린

### Section 5: 턴어라운드 시트 생성 + crop 파이프라인 (재개 — 토큰 출처 = DB)
- [x] 5-1. `sharp` 0.34.5
- [c] 5-2. `buildTurnaroundSheetPrompt` (source-agnostic) ✓
- [c] 5-4. `cropTurnaroundStrip` (sharp 4등분) + 런타임 색상 정합 검증 ✓
- [c] 5-3/5-5. `POST /api/artist/generate-sheet`: DB 토큰(appearance/costume/design_tokens) 읽기 → fal openai/gpt-image-2 → crop → storage 업로드 → characters.view_* 기록 — 코드 ✓ / **실생성 미검증**
- [c] 5-6. artist-store `generateSheet`(단일 인자) = 엔드포인트 호출, `autoGenerateBaseImages`가 views.main 없으면 1회 트리거 — 코드 ✓

### Section 5: 턴어라운드 시트 생성 + crop 파이프라인
> ⚠️ 입력 출처(svc 토큰)가 `unify-svc-writer-pipeline`(svc 토큰 DB化)와 결합됨.
>   통합을 먼저 하면 5-2를 "DB에서 토큰 읽기"로 깔끔히 구현. 순서 미정 — 사용자 결정 대기.
- [x] 5-1. `sharp` 의존성 추가 (sharp 0.34.5) — 설치 확인 ✓
- [c] 5-2. (순수 함수) `src/lib/artist/turnaround.ts` — `buildTurnaroundSheetPrompt` (source-agnostic: 토큰을 인자로 받음) 작성 ✓ / 입력 출처 배선은 unify 순서 후
- [c] 5-4. (순수 함수) `cropTurnaroundStrip` (sharp 4등분) 작성 + **런타임 색상 정합 검증 ✓** (front/sideL/sideR/back 정확히 분리)
- [ ] 5-3. 시트 생성 엔드포인트 `POST /api/artist/generate-sheet`: fal `openai/gpt-image-2`로 스트립 1장 생성 — **BLOCKED** (토큰 출처/DB, 다른 세션)
- [ ] 5-5. 업로드/저장: 각 조각 + main을 Supabase storage 업로드 → DB `view_*` 기록 — **BLOCKED** (DB 마이그레이션, 다른 세션)
- [ ] 5-6. artist-store: `autoGenerateBaseImages`/`generateSheet`를 시트+crop 호출로 대체 — BLOCKED (5-3/5-5 후)
- [ ] 5-7. 재생성/실패 처리: 시트 단위 재생성 + crop 재적용 — BLOCKED

### Section 6: Artist UI 재구성
- [c] 6-1/6-2. character-panel: main(전체 시트, aspect-video wide) + front/back/side-L/side-R(crop, grid-cols-4) 분리 표시. 라벨 Main/Front/Back/Side(L)/Side(R) — 코드 ✓ / 검증 대기
- [c] 6-3. 토큰 사용(globals.css)·ImagePlaceholder 재사용, 신규 색 없음 — 코드 ✓
- [c] 6-4. 생성중(Generating…)/잠금/빈 상태 기존 패턴 유지 — 코드 ✓

## Blocked
- (없음)

## Done
- (없음)
