-- #wiring-persistence (2026-08-31): Director 수동 연결(이미지 입력·프레임 입력·영상 체인)의
-- DB 영속. 2026-08-28 실측(director-node-wiring 리포트 §5)에서 연결 관계가 브라우저
-- localStorage 에만 남아 새 기기/새 브라우저에서 전부 사라지는 것이 한계로 확정됐다.
--
-- 노드 id(dn_*)는 기기-로컬 난수라 DB에 그대로 못 넣는다. 안정 식별자 기반 참조로 저장한다:
--   { kind: 'shot'|'shotImage', shotId: shots.shot_id } | { kind: 'video', clipId: video_clips.id }
--   | { kind: 'asset', assetId }
-- 직렬화/복원은 src/lib/director/wiring-persistence.ts 가 담당하고, 이 컬럼은 그 결과만 담는다.
--
-- shots.image_inputs   — Shot 이미지 레퍼런스 입력 (ref 배열)
-- video_clips.frame_inputs — Video START/END/REF 프레임 입력 ({start,end,refs} of ref)
-- video_clips.video_chain  — 이전 영상 체인 ({ source_clip_id, frame_url })
--
-- 한계(의도): writerShotId 없는 수동 Shot 노드·videoClipId 없는 미생성 테이크는 DB 행이
-- 없어 참조 대상이 될 수 없다 — 그 연결은 종전대로 브라우저 저장에만 남는다.
--
-- 적용: supabase db query --linked 로 문장 개별 실행 (db push 막힘 — 20260813010000 주석 참조).
-- 소유자 경로(RLS owner-write)라 정책 추가 불요.

alter table public.shots
  add column if not exists image_inputs jsonb not null default '[]'::jsonb;

alter table public.video_clips
  add column if not exists frame_inputs jsonb;

alter table public.video_clips
  add column if not exists video_chain jsonb;
