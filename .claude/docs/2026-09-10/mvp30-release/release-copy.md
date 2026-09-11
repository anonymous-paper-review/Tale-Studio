# MVP 배포 체크아웃 선별 복사 결과

**최신 main 기준 배포 체크아웃에 MVP 전용 86개 파일을 복사했습니다. 제품 코드 48개, 테스트·fixture 33개, 검증 스크립트 5개입니다. main 전용 변경이 없는지 먼저 대조했고, 혼합된 3개 파일은 루트 통합 대상으로 남겼습니다.**

- 배포 체크아웃: `/Users/xcape/orca/workspaces/tale-studio/mvp-feedback-release-20260910`
- 기준: `123ef32`(기존 dev 기반), 배포 체크아웃 `HEAD a5d8dc18`, 현재 원본 dev 파일.
- 원본 공유 제품 파일 수정 0개. 이 결과 보고서만 원본 폴더에 작성.
- `src/stores/**`, Global chat UI, 한글 문구, Artist/Producer/Writer 채팅 API, Writer 채팅 변경 해석, handoff-intent 및 새 30번 파일은 루트 또는 별도 담당 소유이므로 복사하지 않음.
- 결제·별도 Director 영상·홈페이지·pricing·chat-tools·middleware·vercel 변경은 복사하지 않음.
- 커밋·push·운영 DB 적용·배포·의존성 설치 없음.

## 비교 방법

기존 파일은 main 내용이 123ef32의 내용과 동일한 경우만 현재 원본을 복사했습니다. 신규 파일은 기존 기반과 main 양쪽에 없음을 확인했습니다. 줄바꿈 CRLF/LF 차이는 비교할 때 정규화했습니다. 복사 직전 배포 체크아웃의 대상 파일이 HEAD에서 바뀌지 않았는지 다시 검사했습니다. 이번 복사 대상 중 다른 담당의 수정 때문에 건너뛴 파일은 없습니다.

`.gitignore`는 파일 전체를 복사하지 않고 MVP 검증 스크립트 예외 5줄만 덧붙였습니다. main의 기존 가격표·환불 스크립트 예외는 보존했습니다.

## 루트가 통합해야 하는 3개 파일

| 파일 | 최신 main 대비 남은 차이 |
|---|---|
| `src/lib/generation-jobs.ts` | 완료 시각 선택, 완료 이력 전체 조회, 배경별 진행 중 작업 조회 |
| `src/lib/fal/reconcile.ts` | 접수 결과가 불명확한 러프 예약을 시간만으로 실패 처리하지 않는 2줄 |
| `src/types/database.ts` | `reserve_rough_storyboard_grid` 함수 타입 18줄 |

이 세 파일은 main에도 기반 이후 변경이 있어 자동 복사 대상에서 제외했습니다. 이후 최신 main과 현재 원본의 직접 diff를 검토한 결과, 현재 원본이 main의 기존 변경을 이미 포함하며 위 MVP 차이만 더 가지고 있음을 확인했습니다. 루트에게 이 사실과 남은 적용 범위를 전달했습니다.

## 검증과 한계

- 복사한 파일의 로컬 `@/` import 경로를 확인했고, 대상 파일이 없는 import는 0개입니다.
- 복사한 파일에서 금지한 `chat-tools` / `chat-tool-bindings` import는 0개입니다.
- 복사한 추적 파일 및 `.gitignore`의 `git diff --check`: 통과.
- 배포 체크아웃에 `node_modules`가 없어 테스트·타입·build는 실행하지 않았습니다. 공유 원본의 기존 통과 결과를 이 체크아웃의 통과로 간주하지 않습니다.
- 미복사 3개 파일 및 루트 소유 파일이 아직 필요한 중간 통합 상태입니다. 루트의 최종 결합 후 새 체크아웃에서 전체 검증이 필요합니다.

## 복사 목록

| 파일 | 대조 결과 |
|---|---|
| `src/lib/pending-proposal.ts` | 기존 main = 기반 |
| `src/lib/artist/world-prompt.ts` | 기존 main = 기반 |
| `src/features/artist/character-view-dialog.tsx` | 기존 main = 기반 |
| `src/features/artist/world-panel.tsx` | 기존 main = 기반 |
| `src/features/artist/world-view-dialog.tsx` | 기존 main = 기반 |
| `src/app/api/artist/generation-status/route.ts` | 기존 main = 기반 |
| `src/lib/artist/chat-request-coverage.ts` | 신규: 기반·main 모두 없음 |
| `src/lib/writer/rough-submit.ts` | 신규: 기반·main 모두 없음 |
| `src/lib/writer/rough-progress.ts` | 신규: 기반·main 모두 없음 |
| `src/app/api/writer/rough-storyboard/route.ts` | 기존 main = 기반 |
| `src/features/writer/rough-storyboard-view.tsx` | 기존 main = 기반 |
| `src/lib/writer/llm/fal.ts` | 기존 main = 기반 |
| `src/lib/fal/keys.ts` | 기존 main = 기반 |
| `src/app/api/generation-jobs/[id]/route.ts` | 기존 main = 기반 |
| `src/lib/generation-batches.ts` | 기존 main = 기반 |
| `src/lib/generation-queue.ts` | 기존 main = 기반 |
| `src/lib/stage-seen.ts` | 기존 main = 기반 |
| `src/app/api/generation/active/route.ts` | 기존 main = 기반 |
| `src/components/layout/sidebar.tsx` | 기존 main = 기반 |
| `src/lib/writer/progress-view.ts` | 신규: 기반·main 모두 없음 |
| `src/lib/writer/use-writer-status.ts` | 기존 main = 기반 |
| `src/lib/writer/run-store.ts` | 기존 main = 기반 |
| `src/app/api/writer/status/[projectId]/route.ts` | 기존 main = 기반 |
| `src/components/layout/chat-progress-pin.tsx` | 기존 main = 기반 |
| `src/lib/pipeline-progress.ts` | 기존 main = 기반 |
| `src/features/writer/writer-generation-view.tsx` | 기존 main = 기반 |
| `src/lib/writer/resolve-entity-names.ts` | 기존 main = 기반 |
| `src/lib/writer/pipeline/util/prose_names.ts` | 기존 main = 기반 |
| `src/lib/writer/pipeline/schemas.ts` | 기존 main = 기반 |
| `src/lib/writer/pipeline/stages/s3_scenes.ts` | 기존 main = 기반 |
| `src/lib/writer/pipeline/stages/s1s3_merged.ts` | 기존 main = 기반 |
| `src/lib/writer/pipeline/stages/v2_design.ts` | 기존 main = 기반 |
| `src/lib/writer/pipeline/stages/decoupage.ts` | 기존 main = 기반 |
| `src/lib/writer/pipeline/stages/v4_shots.ts` | 기존 main = 기반 |
| `src/lib/writer/pipeline/validators/scene_content.ts` | 신규: 기반·main 모두 없음 |
| `src/lib/writer/types/pipeline.ts` | 기존 main = 기반 |
| `src/lib/locale.ts` | 기존 main = 기반 |
| `src/lib/i18n/content.ts` | 기존 main = 기반 |
| `src/app/api/writer/preview/[projectId]/route.ts` | 기존 main = 기반 |
| `src/lib/writer/use-writer-preview.ts` | 기존 main = 기반 |
| `src/features/writer/dialogue-view.tsx` | 기존 main = 기반 |
| `src/features/writer/writer-character-panel.tsx` | 기존 main = 기반 |
| `src/lib/writer/dialogue-handoff.ts` | 신규: 기반·main 모두 없음 |
| `src/app/globals.css` | 기존 main = 기반 |
| `src/components/layout/footer-icon-item.tsx` | 기존 main = 기반 |
| `src/components/demo/share-button.tsx` | 기존 main = 기반 |
| `src/components/export-menu.tsx` | 기존 main = 기반 |
| `supabase/migrations/20260910001500_reserve_rough_storyboard_jobs.sql` | 신규: 기반·main 모두 없음 |
| `tests/artist/appearances.test.ts` | 기존 main = 기반 |
| `tests/artist/location-appearances.test.ts` | 기존 main = 기반 |
| `tests/artist/chat-generation-arguments.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/artist/chat-request-coverage.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/artist/saved-appearance-sync.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/artist/two-appearance-queue.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/artist/world-appearance-generation.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/artist/world-job-resume.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/chat/request-preservation.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/job/completion-active-response.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/job/completion-badge-feedback.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/job/completion-first-visit.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/job/completion-history-retention.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/job/completion-project-boundaries.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/job/completion-seen-boundaries.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/job/completion-snapshot-updates.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/job/writer-image-completion.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/job/writer-rough-save-completion.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/manual/rough-reservation-db.manual.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/manual/rough-reservation-dev-db.manual.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/producer/pending-proposal-cancel.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/writer/dialogue-handoff-completion.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/writer/feedback-content-boundaries.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/writer/feedback-display-consumers.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/writer/legacy-preview-candidate-names.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/writer/progress-scope.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/writer/rough-progress.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/writer/rough-submit-http-once.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/writer/rough-submit-no-retry.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/writer/rough-submit-reservation.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/writer/status-eta.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/writer/status-sharing.test.ts` | 신규: 기반·main 모두 없음 |
| `tests/fixtures/mvp-feedback-page.tsx` | 신규: 기반·main 모두 없음 |
| `scripts/check-mvp-dialogue-ui.mjs` | 신규: 기반·main 모두 없음 |
| `scripts/check-mvp-feedback-followup-ui.mjs` | 신규: 기반·main 모두 없음 |
| `scripts/check-mvp-feedback-ui.mjs` | 신규: 기반·main 모두 없음 |
| `scripts/test-rough-reservation-db.mjs` | 신규: 기반·main 모두 없음 |
| `scripts/test-rough-reservation-dev-db.mjs` | 신규: 기반·main 모두 없음 |

## 덧붙인 스크립트 예외

- `!scripts/check-mvp-dialogue-ui.mjs`
- `!scripts/check-mvp-feedback-followup-ui.mjs`
- `!scripts/check-mvp-feedback-ui.mjs`
- `!scripts/test-rough-reservation-db.mjs`
- `!scripts/test-rough-reservation-dev-db.mjs`

## 추가 혼합 파일 통합 (2026-09-10 14:22 KST)

루트가 이어서 맡긴 혼합 파일을 배포 체크아웃에 통합했습니다. 원본 제품 파일은 수정하지 않았습니다.

| 파일 | 포함한 변경 | 제외·보존 |
|---|---|---|
| `src/stores/artist-store.ts` | 모습 선택 저장, 배경 작업 재접속, 새 모습 생성의 접수·완료 관찰, 원천 설명과 기본 모습 동기화 | 범용 채팅 도구 의존 없음 |
| `src/app/api/artist/character/route.ts` | 기존 생성 API가 이미 저장한 기본 모습을 응답에 포함 | 새 표·추가 유료 실행 없음 |
| `src/stores/writer-store.ts` | 저장 순서 직렬화, 대사 번역 저장 완료 확인, 이전 화면의 예약 저장이 번역 대사를 덮어쓰지 않도록 보호 | 위치 삽입 CRUD·도구용 `hasPendingWriterEdit`·clarify 실행 변경 제외 |
| `src/lib/writer-chat-updates.ts` | null 화자의 내레이션만 보존 | 위치 삽입·clarify 변경 제외 |
| `src/app/api/artist/chat/route.ts` | 명시한 두 인물 중 빠진 새 모습 제안 안내 | main의 모델 호출 계약 보존, chat-tools 연결 제외 |
| `src/lib/i18n/messages-ko.ts` | MVP 및 새 30번 문구 65개 추가. `All dialogue changes are saved.` 포함 | main의 인물 변화·팔레트 문구 유지. chat-tools·Producer 별도 저장 정책·Director 영상 생성 문구 제외 |

처음에는 신규 캐릭터의 기본 모습 응답 소비를 제외했으나, 루트가 기존 MVP의 ‘새 인물의 기본 모습을 바로 사용한다’ 약속에 필요한 15줄 API 수정임을 확인하고 API·스토어를 함께 포함하도록 지시했습니다. 해당 기존 검사도 그대로 유지했습니다.

추가 검사 `tests/writer/dialogue-narrator.test.ts`는 기존 한국어 약속 ‘내레이션을 수정해도 화자 없는 대사가 유지된다’를 별도 삽입 CRUD 검사에서 분리해 확인합니다. null 내레이션과 등록 화자는 보존하고 발명된 화자는 제외합니다.

배포 체크아웃의 독립 6개 파일 검사 43개 통과(기본 모습 응답·외형 동기화·두 인물 누락 안내·배경 생성·배경 작업 재접속·Writer 대사 해석·내레이션). 통합한 제품 6개 파일과 새 테스트의 ESLint 오류·경고 0개, `git diff --check` 통과. 금지한 도구 의존과 삽입 CRUD 식별자 없음 확인.

Global chat 통합 전 실행한 연결 검사 8개 파일은 당시 42통과·41실패였으며, 아직 main 상태인 요청 보존·두 인물 승인·전체 대사 후 이동 경로의 차이였습니다. 루트에 즉시 전달했고, 이 중간 결과를 최종 배포본 검증으로 간주하지 않습니다. Global chat과 새 30번 통합 뒤 연결 검사 및 전체 검증은 루트가 다시 실행해야 합니다.
