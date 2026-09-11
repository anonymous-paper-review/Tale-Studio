# MVP 수정 및 30번 운영 반영 범위

**운영 반영은 최신 `main`을 바탕으로 MVP 변경만 선별해야 한다. 현재 `dev` 전체를 복사하거나 병합하면 이미 운영에 올라간 Producer 수정이 되돌아가고, 별도 채팅 도구·가격표 변경까지 섞인다.** 러프 예약 함수는 운영 DB 반영이 필요한 유일한 신규 MVP 마이그레이션으로 확인했다. 30번은 루트에서 구현 중이므로 이 보고서는 그 최종 파일이 확정되기 전의 범위 조사다.

조사: 2026-09-10. 제품 파일 변경, 커밋, fetch, worktree 조작, 외부 발송은 하지 않았다. 비교 기준은 현재 로컬에 저장된 `origin/main = 7f201cb9`, `dev = 123ef32f`다. 원격 최신 상태와 운영 DB 적용 여부를 이번 읽기 조사에서 새로 조회했다고 주장하지 않는다.

## 1. 이미 main에 있는 변경은 보존한다

현재 origin/main 이력에는 아래가 이미 포함되어 있다.

| 커밋 | 이미 포함된 내용 |
| --- | --- |
| `7795e785` | Director 일괄 영상 서버 이어가기·중단·복구 |
| `57a9a9ee` | 운영 썸네일 수정과 일괄 서버 이어가기 통합 |
| `54455bc4` | 운영 저장 구조 적용 후 영상 복구 cron 2분 간격 활성화 |
| `6ed72c3a` | 결제 진입 보호·결제 페이지·환불 만료 회계 수정 |
| `31d6edc7` | 최신 운영 영상 변경을 보존한 결제 통합 |
| `bd871bf6` | Producer 채팅 선택 보존 및 대사 언어 확인 |
| `7f201cb9` | Producer의 인물 변화 설명을 쉬운 말로 변경 |

`git diff origin/main`이 약 8,974줄 삭제를 보이는 것만으로 이를 실제 삭제 대상으로 취급하면 안 된다. dev 인덱스에서 미추적이지만 현재 파일은 존재하는 main 추가 파일들이 삭제처럼 보인다. 별도 텍스트 대조로 아래는 **현재 작업 폴더와 origin/main이 동일**함을 확인했다.

- `src/lib/director/video-submit.ts`, `batch-store.ts`, `video-batch-inputs.ts`.
- `src/app/api/director/video-batches/route.ts`, `src/app/api/cron/video-batches/route.ts`.
- `src/lib/generation-quota.ts`, `src/lib/api/quota.ts`, `src/middleware.ts`, `src/app/api/director/generate-previz-video/route.ts`.
- `vercel.json`.
- `20260909110000_director_video_batches.sql`, `20260909120000_generation_video_capacity_gate.sql`, `20260909130000_fix_refund_expiry.sql`.

일부 다른 파일은 줄바꿈 형식만 다르다. 원시 바이트 hash가 다르더라도 텍스트와 git diff를 함께 봐야 한다.

반대로 main에는 있지만 현재 dev 폴더에 실제로 없는 다음 파일은 main에서 **보존**한다.

- `src/features/producer/select-style-anchor.ts`.
- `src/lib/producer-dialogue-language.ts`.
- `src/lib/project-thumbnail.ts`.
- `tests/producer/dialogue-language.test.ts`, `palette-guidance.test.ts`, `style-guide.test.ts`, `style-picker-guide.test.ts`.
- `tests/project/project-list-thumbnail.test.ts`.

## 2. MVP 제품 변경의 필수 묶음

아래는 기존 MVP 보고의 소유 파일 및 실제 main 차이를 교차 확인한 배포 후보다. 공유 파일은 다음 절의 부분 적용 규칙을 따른다. 새 30번 파일은 루트의 최종 결과를 여기에 추가해야 한다.

| 사용자 결과 | 함께 필요한 제품 파일 |
| --- | --- |
| 보류 목록·채팅 기록 유지·다른 탭 승인·여러 인물 접수·결과별 완료 확인 | `src/lib/pending-proposal.ts`, `src/stores/global-chat-store.ts`의 MVP 부분, `src/components/layout/global-chat.tsx`의 MVP 부분, `src/stores/artist-store.ts`의 생성 관찰·모습 선택 부분, 해당 한국어 문구 |
| 밤 모습 설명·이미지·선택 일치 및 배경 작업 재접속 | `src/lib/artist/world-prompt.ts`, `src/features/artist/character-view-dialog.tsx`, `world-panel.tsx`, `world-view-dialog.tsx`, `src/app/api/artist/generation-status/route.ts`, `src/lib/generation-jobs.ts`의 `listQueuedWorldShotJobs`, Artist store 관련 부분 |
| 모델이 두 인물 중 하나를 빠뜨리면 이름으로 누락 안내 | 새 `src/lib/artist/chat-request-coverage.ts`, `src/app/api/artist/chat/route.ts`의 요청 대상 대조 부분, 해당 한국어 문구 |
| 러프 중복 발주 방지·진행 상태 분리 | 새 `src/lib/writer/rough-submit.ts`, `rough-progress.ts`, `src/app/api/writer/rough-storyboard/route.ts`, `src/features/writer/rough-storyboard-view.tsx`, `src/lib/writer/llm/fal.ts`, `src/lib/fal/keys.ts`, `src/lib/fal/reconcile.ts`, `src/app/api/generation-jobs/[id]/route.ts`, 예약 migration·DB 타입 |
| Writer 미확인 완료 수 정확화 | `src/lib/generation-batches.ts`, `generation-queue.ts`, `stage-seen.ts`, `generation-jobs.ts`의 완료 이력 조회, `src/app/api/generation/active/route.ts`, `src/components/layout/sidebar.tsx`, 한국어 문구 |
| 진행 막대 유지·내부 단계 숫자 및 부정확한 시간 숨김 | 새 `src/lib/writer/progress-view.ts`, `src/lib/writer/use-writer-status.ts`, `run-store.ts`, `src/app/api/writer/status/[projectId]/route.ts`, `src/components/layout/chat-progress-pin.tsx`, `src/lib/pipeline-progress.ts`, `src/features/writer/writer-generation-view.tsx`, 러프 뷰 관련 부분 |
| 이름·본문 언어·과거 미리보기 장소 표시 | `src/lib/writer/resolve-entity-names.ts`, `pipeline/util/prose_names.ts`, `pipeline/schemas.ts`, `pipeline/stages/s3_scenes.ts`, `s1s3_merged.ts`, `v2_design.ts`, `decoupage.ts`, `v4_shots.ts`, 새 `pipeline/validators/scene_content.ts`, `writer/types/pipeline.ts`, `src/lib/locale.ts`, `src/lib/i18n/content.ts`, `src/app/api/writer/preview/[projectId]/route.ts`, `src/lib/writer/use-writer-preview.ts`, `src/features/writer/dialogue-view.tsx`, `writer-character-panel.tsx` |
| 한국어 대사 전체 저장 후 다음 단계로 이동 | 새 `src/lib/writer/dialogue-handoff.ts`, Writer store의 `saveDialogueTranslation` 및 저장 순서 보호, Global chat store의 전체 대상 보존·후속 요청·저장 완료 판정, `src/lib/handoff-intent.ts`의 안전한 이동 의도 판별, 해당 한국어 문구; 30번 준비 조건/실제 화면 완료 수리는 별도 통합 중 |
| 승인받은 색·공통 메뉴 정리 | `src/app/globals.css`의 primary 토큰, `src/components/layout/footer-icon-item.tsx`, `src/components/demo/share-button.tsx`, `src/components/export-menu.tsx`, Sidebar 관련 부분 |

## 3. 공유 파일에서 포함할 부분과 제외할 부분

줄 번호는 다른 에이전트의 30번 수정으로 움직일 수 있으므로 함수·식별자 기준으로 적용한다.

### `src/stores/global-chat-store.ts`

**포함**:

- `combinePendingProposals`, `deferredProposals`, `deferredSuggestions`, `recordedSuggestionIds`, `executingProposalIds`, `cancelledProposalIds` 및 프로젝트별 `persistConversationState` / `loadConversationState`.
- 원래 요청 단계 `stageOverride`, 프로젝트/세션 전환 방어, 다른 탭 승인, 보류·복원·취소, 제안 본문을 대화에 한 번 저장하는 경로.
- Artist의 `find`/첫 항목 처리 대신 모든 원천/모습/재생성 제안을 한 승인에 보존하는 경로.
- `approvePendingProposal`의 대상별 실행·진행 증표·새 모습 키 보존·접수 후 다음 인물 시작·완료/실패를 각 인물에 연결하는 부분. `Promise.race([run, submitted])`를 통한 두 번째 접수가 MVP-25 핵심이다.
- `dialogueHandoffTarget`, `completeKoreanDialogue`, 전체 대사 저장 및 한 줄 진행 갱신 부분. 30번 최종 수리를 같은 경로에 결합한다.

**이번 MVP 배포에 자동 포함하지 않음**:

- 파일 첫머리의 `runChatToolLoop`, `createChatToolExecutor`, `createStudioToolResources`, `chatToolReceipt` 등 `chat-tools/*`·`chat-tool-bindings` 의존.
- `completedTools`, `toolOutcomes`, `toolEdit` 승인 실행, `toolMessages`를 보내는 범용 실행·복구 분기와 도구 전용 영수증. 별도 후속 세션 범위다. 이 import/분기를 남겨두고 새 파일만 빼면 빌드가 깨진다.
- Producer `producerExtractOutcome` / `saveDraftNow` 저장 확인 분기. 이를 넣으려면 Producer store 저장 변경과 해당 테스트까지 함께 필요하지만 MVP의 필수 의존은 아니다.
- 별도 Director 생성 변경인 `resolvedIds`, `buildVideoBatchInputs`, `inputSignature` 기반 영상 승인 스냅샷/새 영상 preflight 부분. Writer→Director **이동**과 Director **영상 생성**은 다른 범위다.
- main의 팔레트 안내 문장을 옛 `style picker` 안내로 되돌리는 hunk.

### `src/components/layout/global-chat.tsx`

보류 UI·전역 승인·한 번 저장한 제안 표시·스크롤 유지·`stageOverride` 전달은 포함한다. **main의 `selectStyleAnchorFromPicker` import 및 `onSelect` 호출은 보존한다.** 현재 작업 폴더의 `setStyleAnchor` 직접 호출로 바꾸는 hunk는 최신 Producer 선택 저장 수정의 역행이다.

### `src/stores/writer-store.ts` / `src/lib/writer-chat-updates.ts`

- 대사 저장 완료 판정과 `serializeWriterSave`/샷 저장 최신값 확인은 MVP-29/30의 저장 경합 방지에 필요하다. 번역 직전 UI 예약 저장이 번역 후 대사를 옛 값으로 덮지 않아야 한다.
- `hasPendingWriterEdit`는 범용 chat-tools 저장 보호의 소비처다. 도구 부분을 빼면 이 export는 MVP에 불필요하다.
- `beforeSceneId`/`afterSceneId`/`beforeShotId`/`afterShotId`, `insertionAfter`, 위치 삽입 CRUD는 별도 채팅 편집 확장이다. MVP 대사 완료 이동에 필요한 부분은 아니다.
- `dialogueLines.characterId = null` 내레이션 보존은 대사 번역과 맞물릴 수 있다. 전체 대사 저장 회귀에 내레이션을 넣어, 번역 과정에서 누락되지 않도록 필요한 부분만 포함한다. 위치 삽입 확장과 한 묶음으로 복사할 필요는 없다.

### `src/app/api/artist/chat/route.ts`

`supabaseAdmin`, `translate`, `isExplicitAppearanceAddition`, `missingMentionedAppearanceNames`, `ownsProject` 확인 및 `coverageNotice`는 MVP-26 누락 안내 의존이다. `prepareChatTools` import, `toolsEnabled`/`toolMessages`, `appTools`, `toolTurn`/`toolSupport`는 별도 채팅 도구다. 두 종류의 hunk가 인접하므로 함수 전체를 복사하지 않는다.

### Producer·Writer 채팅 API 및 `src/lib/claude.ts`

`src/app/api/produce/chat/route.ts`를 전체 복사하면 main의 `resolveProducerDialogueLanguage`와 `[Dialogue Language Decision]`, 모델 제안 언어의 제품 검증을 제거한다. 현재 추가는 대부분 범용 도구이므로 **main을 보존**한다. `src/app/api/produce/chat/system-prompt.ts`, `src/app/studio/producer/page.tsx`도 main의 최신 설명·선택 동작을 보존한다.

`src/app/api/writer/chat/route.ts`는 도구 활성화 부분을 제외한다. 내레이션 보존 문구는 위 대사 계약에 맞춰 필요한 경우 포함하고, 삽입 위치 확장은 별도 범위로 둔다. `src/lib/claude.ts`의 현재 main 대비 변경은 appTools/툴 턴/AbortSignal 연결이므로 범용 도구를 제외하는 배포에서는 main을 유지할 수 있다.

### Artist store 및 캐릭터 생성 API

Artist store의 모습별 선택·배경 재접속·정확한 설명 동기화·`traceId/onJob/onCreated` 전달은 MVP 결과와 연결되어 있다. 최초 캐릭터 생성 응답에 `defaultAppearance`를 추가하는 `src/app/api/artist/character/route.ts` 변경은 범용 캐릭터 생성/편집 세션의 경계도 섞여 있다. 두 기존 인물의 모습 접수 문제 자체에는 새 캐릭터 생성 경로가 필요하지 않다. 최초 캐릭터 응답 소비 hunk를 함께 제외하거나 포함 근거를 별도로 확인한다. 상호 의존하는 store 소비만 남기고 API 응답 변경을 빼지는 않는다.

### `src/lib/generation-jobs.ts`, DB 타입, 작은 공유 파일

- main 대비 `generation-jobs.ts` 변경은 완료 시각 선택·완료 이력 전체 조회·배경 queued 조회로 모두 MVP에 연결된다. 이미 main에 있는 영상 생명주기 함수는 그대로 보존한다.
- `src/types/database.ts`는 main 대비 `reserve_rough_storyboard_grid` 타입 **18줄만** 추가된 상태다. 이것을 포함한다. main의 Director/환불 타입을 삭제하지 않는다.
- `src/lib/fal/keys.ts`의 `submitQueueOnce`, `writer/llm/fal.ts`의 `retry:false` 경로, `fal/reconcile.ts`의 예약된 rough 보존, `generation-jobs/[id]`의 queued rough 삭제 409는 한 묶음이다.
- `.gitignore`에는 MVP 검사 스크립트 예외 5개만 추가한다. main의 기존 가격표·환불 스크립트 예외는 보존한다.

### `src/lib/i18n/messages-ko.ts`

MVP에서 실제 참조하는 보류·완료 수·러프·이름·진행·전체 대사 저장 문구만 추가한다. 맨 위 채팅 도구용 `Execution results`, `Recovery limit reached` 등은 도구를 제외하면 불필요하다. 아래는 **제외/보존**한다.

- main의 `인물의 변화`를 `아크`로 되돌리는 hunk는 제외한다.
- main의 `팔레트 아이콘` 안내를 옛 `스타일 피커`로 되돌리지 않는다.
- `P-10` → `Producer10`, Studio 학습 정책 문구는 별도 가격표 세션 범위다.
- Director 영상 preflight 문구는 해당 별도 영상 변경을 넣을 때만 필요하다.

## 4. 이번 신규 DB migration

**필수:** `supabase/migrations/20260910001500_reserve_rough_storyboard_jobs.sql`.

- 함수: `public.reserve_rough_storyboard_grid(uuid, uuid, uuid, text[], text, text, jsonb, boolean)`.
- 변경은 함수 생성과 실행 권한이다. 새 표·열은 없으며 기존 `projects`, `workspaces`, `shots`, `generation_jobs`를 읽고 예약 job을 생성한다.
- 외부 이미지 제출 **전에** 프로젝트별 advisory transaction lock으로 겹치는 샷을 예약한다. 기존 queued 예약은 공유하고, 완료된 러프는 자동 덮어쓰지 않는다.
- `service_role`만 실행 가능, `public`/`anon`/`authenticated`는 실행 불가.
- 개발 적용 증거: `.claude/docs/2026-09-09/mvp-feedback/dev-migration-applied.json`, UTC `2026-09-09T15:26:40.318Z`.
- 검증 SHA-256: `70933289f5965631cd44445b098732a493157b370dbe1f95e1e83fa59b6f750f`.
- 위 기록은 `productionChanged:false`다. 따라서 운영 미적용으로 취급하여 **배포 직전에 운영 함수와 migration 이력을 확인**하고 필요하면 적용한다. 이번 조사는 운영 DB에 접속하지 않았으므로 이후 다른 작업자가 적용했을 가능성을 배제하지 않는다.
- 환경 식별: 개발 `pbiumddivadgbzxuymak`, 운영 `qnjnrihfpqkdhjuzvepy`. 키는 보고서에 적지 않는다.
- 스키마 적용 후 개발 기준 타입 생성 규칙을 지키되, 현재 타입의 main 대비 추가가 위 18줄뿐인지 다시 대조한다.

이미 main에 들어간 Director `20260909110000`/`20260909120000`, 결제 `20260909130000`을 새 MVP migration처럼 다시 작성하거나 일괄 push하지 않는다. 실제 DB migration 이력 대조 후 필요한 파일만 처리한다. 앱의 새 rough 제출 코드는 예약 RPC가 없으면 실패하므로 운영 함수 적용이 앱 배포보다 먼저 준비되어야 한다.

## 5. 제외할 별도 작업

- `src/lib/chat-tools/**`, `src/stores/chat-tool-bindings.ts`와 대응 `tests/chat/tool-*`, `tests/writer/chat-tool-*`, Producer 명시 저장·삽입 편집 테스트. 공유 파일의 관련 호출도 함께 제외해야 한다.
- 새 Director `resolvedIds`·영상 승인 snapshot/preflight 및 대응 `tests/director/chat-*`, `temp-id-resolution.test.ts`. 기존 main Director 서버 이어가기 전체는 그대로 보존한다.
- 가격 이름/마케팅 정책: `src/lib/billing/catalog.ts`, `src/components/billing/pricing-families.tsx`, `pricing-page.tsx`, `src/app/page.tsx`, `src/app/pricing/layout.tsx`, `src/app/projects/page.tsx`, `scripts/check-pricing-ui.mjs`, 관련 가격표 테스트의 main 이후 차이. 결제 코드 전체를 제외한다는 뜻이 아니라 **이미 운영에 있는 결제를 보존하고 이번 이름/문구 변경을 싣지 않는다**는 뜻이다.
- `.pnpm-store`, `.smoke` 실험물, 임시 검수 `playground` route, 파일별 실행 로그·개인 원문·DB 자격 증명. 보고서는 한국어 결과와 캡처만 별도 산출물로 유지한다.

## 6. 선별 반영 후 검증 범위

공유 dev에서 수천 개 테스트가 통과한 것은 선별된 main 배포본의 통과 증거가 아니다. main을 기준으로 결합한 최종 코드에서 다시 확인한다.

1. MVP 신규 Artist/Writer/Chat/Job 회귀와 새 30번 실제 화면 전환 회귀. 특히 두 인물 모두 **완료 전 접수**, 대사 마지막 저장 전 **이동 0회**, Director 진입 확인 전 **완료 안내 없음**.
2. `tests/artist/appearances.test.ts`·`location-appearances.test.ts`의 기존 두 검사와 실제 동작 회귀. 테스트 문장/기대 변경은 별도 담당의 최종 판정·수정 결과를 사용하며 이 보고에서 대신 바꾸지 않는다.
3. main 전용 Producer `dialogue-language`, `palette-guidance`, `style-guide`, `style-picker-guide`, `tests/chat/produce-chat-locale-follow.test.ts` 및 프로젝트 썸네일 회귀. 이 파일들이 사라지거나 결과가 퇴행하지 않아야 한다.
4. 관련 결제·Director 기존 검사는 main 보호 확인으로 실행한다. 새 결제/영상 정책을 배포하는 근거로 사용하지 않는다.
5. 타입, 디자인 lint, 소스 lint, 전체 core 테스트와 실제 build. 새 파일 import 누락 및 chat-tools로 향하는 잔여 import가 없어야 한다.
6. 운영 RPC의 함수·권한·migration 기록 확인, 배포 후 실제 사용자 시나리오에서 API/화면 도착 확인. 유료 이미지 새 생성 없이도 예약 RPC 존재·읽기 및 이동 준비 API를 먼저 점검할 수 있다.

근거 보고: 9월9일 MVP `agent-a.md`, `agent-a-addendum.md`, `agent-b.md`, `agent-b-rough-reservation.md`, `agent-c.md`, `agent-d.md`; 9월10일 followup `eta.md`, `notification-audit.md`; confirmation `writer-badges.md`, `artist-two-queue.md`, `names-investigation.md`. 마지막 notification-audit의 24시간/500행 한계 설명은 이후 writer-badges 수정으로 해소되었으므로 최신 문서를 우선한다.
