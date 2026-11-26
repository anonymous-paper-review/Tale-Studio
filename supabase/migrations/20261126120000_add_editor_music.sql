-- Editor 음악 만들기(2026-11-26 오너 요청 E1 · 리드 승인 O2 · O3): Editor 위 왼쪽 판 [생성]에서 만든 곡의 목록.
--   곡 하나 = 행 하나. 만들기는 지금 생성 작업 길 그대로다 — generation_jobs(kind 'editor_music') · fal 큐 · 웹훅 · 마무리.
--   마무리가 fal 결과를 보관함 {ws}/{project}/editor/music/{id}.mp3 에 올리고 이 행을 completed + url 로 바꾼다.
--   타임라인에 놓은 조각은 이 주소를 편집 저장본(editor_states)에 들고 가므로, 다른 브라우저에서도 목록 · 소리가 같다.
--   [빼기]는 deleted_at 만 찍는다 — 파일은 지우지 않는다(이미 타임라인에 놓은 조각이 그 파일을 쓴다).
--   서버(service role)만 읽고 쓴다 — 화면은 /api/editor/music 로 읽는다(artist_versions · generation_jobs 와 같은 관례, 클라이언트 정책 없음).
--   job_id 는 FK 가 아니다 — 작업 장부(generation_jobs)를 정리해도 곡은 남는다.
--   약속: tests/ops/editor-music-migration.test.ts · tests/job/editor-music-job.test.ts · tests/editor/music-panel.test.ts
--   되돌리기: supabase/rollbacks/20261126120000_add_editor_music.rollback.sql(이 폴더 밖 — 이 폴더의 .sql 은 모두 마이그레이션으로 실행된다).
--   새 표만 더하고 기존 표에는 칸을 더하지 않는다. 기존 표는 아래 (3) 하나만 — generation_jobs.kind 에 값 목록 제약이 걸려 있을 때만 'editor_music' 을 더한다.
begin;

-- (1) 만든 곡 목록.
create table public.editor_music (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- 이 곡을 만든 생성 작업(generation_jobs.id). FK 아님 — 장부 정리와 상관없이 곡은 남는다.
  job_id uuid,
  -- 만든 사용자(auth.users.id). 기록용.
  created_by uuid,
  -- 음악 모델 레지스트리 키(src/lib/editor/music-models.ts — 'elevenlabs-music' · 'minimax-music-2.6').
  model text not null,
  -- 사용자가 쓴 분위기 글 · 가사(노래일 때). 모델로 보내기 전에 검사를 통과한 글이다.
  prompt text not null,
  lyrics text,
  instrumental boolean not null default true,
  -- 길이를 정하는 모델(ElevenLabs)만 — 고른 길이(초, 3 ~ 180). 다른 모델은 null(모델이 정한다).
  requested_duration_sec numeric,
  -- 끝나면 보관함 공개 주소.
  url text,
  status text not null default 'queued' check (status in ('queued', 'completed', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  -- [빼기] 시각. 찍힌 곡은 목록에 보이지 않는다.
  deleted_at timestamptz
);

create index editor_music_project_created_idx on public.editor_music (project_id, created_at desc);

comment on table public.editor_music is
  'Editor 음악 만들기(2026-11-26): [생성]에서 만든 곡 목록. 곡 하나 = 행 하나, 파일은 보관함 {ws}/{project}/editor/music/{id}.mp3. 서버(service role)만 읽고 쓴다.';

-- (2) 클라이언트 정책 없음 = 브라우저에서 직접 읽고 쓸 수 없다(service role 만).
alter table public.editor_music enable row level security;

-- (3) generation_jobs.kind 값 목록 제약 — 이 저장소의 마이그레이션에는 없다(표가 이 폴더보다 먼저 만들어졌다). 원격 DB 에 손으로 건
--   "kind = ANY (ARRAY[...])" 꼴 제약이 있으면 같은 이름으로 'editor_music' 을 더해 다시 건다. 없으면 아무것도 하지 않는다(새 제약을 더하지 않는다).
--   다른 칸과 함께 묶인 제약(video_clip_id · idempotency_key 와 kind 를 함께 보는 것)은 건드리지 않는다 — 음악 작업은 그 칸들이 비어 있어 통과한다.
do $$
declare
  c record;
  v_values text[];
begin
  for c in
    select con.conname, pg_get_constraintdef(con.oid) as def
    from pg_constraint con
    where con.conrelid = 'public.generation_jobs'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~ '^CHECK \(\(kind = ANY \(ARRAY\['
  loop
    select array_agg(distinct m[1] order by m[1]) into v_values
    from regexp_matches(c.def, '''([^'']+)''', 'g') as m;
    if not ('editor_music' = any (v_values)) then
      v_values := v_values || 'editor_music'::text;
      execute format('alter table public.generation_jobs drop constraint %I', c.conname);
      execute format('alter table public.generation_jobs add constraint %I check (kind = any (%L::text[])) not valid', c.conname, v_values);
      execute format('alter table public.generation_jobs validate constraint %I', c.conname);
      raise notice 'generation_jobs check % now allows editor_music', c.conname;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
