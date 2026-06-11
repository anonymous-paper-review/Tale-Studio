# generation-jobs-multiuser-guard — Tasks

## Archived

### Section 1: Runtime Metadata
- [x] migration 작성 + **라이브 적용**: `016_generation_jobs_runtime_metadata.sql` — 2026-06-12 pooler 직접 적용, 기존 240 row 백필 확인(user_id/workspace_id/provider/submitted_at/attempts)
- [x] `generation-jobs.ts` create/update/count 경로 확장 — 컬럼 라이브 반영 + tsc clean
- [x] 생성 라우트·writer prewarm에서 `user_id/workspace_id/input_snapshot` 전달 — 2026-06-12 00:55 KST 사용자 Artist 재생성 row 2건(actor=ui) `input_snapshot={model,prompt,reference_image_urls}` 풍부 기록 확인 → 앱 write 입증(백필은 input_snapshot 미터치)

### Section 2: Conservative Limits
- [x] 유저 queued cap `30 -> 8` — `generation-quota.ts:11 MAX_QUEUED_JOBS_PER_USER=8`
- [x] Artist submit concurrency `4 -> 2` — `artist-store ARTIST_GENERATION_n=2`
- [x] Director storyboard concurrency `3 -> 2` — `director-store n=2` + `use-writer-director-sync n=2`
- [x] Writer assets/images/videos default+max concurrency `4 -> 2` — `assets_generate/l6_images/l7_videos cn=Math.min(??2, 2)`

### Section 3: Documentation
- [x] 의사결정 템플릿 추가: `specs/_DECISION_TEMPLATE.md` (2026-06-11)
- [x] CLAUDE.md / route·lib 라우터 문서 fal limit·status 의미 갱신 — CLAUDE.md §기술 스택 "submit 동시성 2, queued 상한 8" 반영됨

### 검증
- [x] Supabase 라이브 DB에 015→016 적용 — 2026-06-12 멱등 적용 성공
- [x] DB 타입/cache 재생성 — `database.ts` + `.claude/cache/db` 재생성, tsc clean
- [x] 브라우저에서 Artist 자동생성/Director storyboard submit 확인 — 2026-06-12 00:55 KST 사용자 Artist 재생성 2건(project f1787cf9…) 라이브 확인
- [x] generation_jobs row에 `user_id/workspace_id/provider/input_snapshot/submitted_at/attempts` 기록 확인 — 신규 app-created row(actor=ui) 전 필드 정상: user_id=659bdc75…, workspace_id=ded034c8…, provider=fal, input_snapshot 풍부, submitted_at/attempts=1. actor=ui/writer 구분도 동작

## Blocked
- (없음)

## Done
- (검증 후 archive 예정)
