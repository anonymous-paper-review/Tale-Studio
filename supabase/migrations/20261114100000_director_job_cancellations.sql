-- 화면에서 멈춘 생성 작업(디자이너 11/13 · 오너 2026-11-14 7번 · 리드 C): "아직 보내지 않은 것만 멈추고 이미 생성이 진행 중인 것들은 UI로는
--   취소된걸로 보이게 해서 유저가 수정해서 다시 생성 요청할 수 있게 해줘. (테이크는 차감되고 백그라운드에서 끝나면 히스토리로 보여줄 수 있게 해줘.)"
--   fal 에는 취소가 없어 작업은 끝까지 돈다 — 그래서 작업 표(generation_jobs)는 그대로 두고(상태 · 자리 · 늦은 결과 받기 그대로),
--   "화면에서 멈춤"만 새 표 하나에 적는다. 오너 결정(2026-10-28 Artist 버전 때): 새 표만 더하고 기존 표에는 칸을 더하지 않는다.
--   - 같은 샷 하나만 검사(이미지 트리거 · 영상 예약 셋)는 멈춘 작업을 세지 않는다 → 그 샷을 바로 다시 요청할 수 있다.
--   - 동시 생성 자리 검사(enforce_generation_capacity)는 바꾸지 않는다 → 멈춘 작업도 끝날 때까지 자리를 차지한다(리드 c).
--   - shots.video_url 투영 · 영상 일괄의 "이미 다 만든 샷" 검사는 멈춘 Take 를 ★ 로 고르지 않은 한 세지 않는다 → 늦게 끝나도 기록(Take 목록)에만 있다.
--   - 함수 서명은 그대로라 옛 호출은 그대로 돈다(다른 세션도 개발 DB 를 같이 쓴다). 늦은 이미지는 finalize 가 버전 목록에만 넣는다(TS).
--   약속: tests/ops/director-job-cancellations-migration.test.ts · tests/director/job-cancel.test.ts
--   되돌리기: supabase/rollbacks/20261114100000_director_job_cancellations.rollback.sql(이 폴더 밖 — 이 폴더의 .sql 은 모두 마이그레이션으로 실행된다).
begin;

create table public.director_job_cancellations (
  job_id uuid primary key references public.generation_jobs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  video_clip_id uuid references public.video_clips(id) on delete cascade,
  -- 그 작업이 그리던 샷(Writer 샷 id) — 4샷 한 장이면 넷, 영상이면 하나.
  writer_shot_ids text[] not null default '{}',
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz not null default now()
);
create index director_job_cancellations_project_idx on public.director_job_cancellations (project_id, cancelled_at desc);
create index director_job_cancellations_clip_idx on public.director_job_cancellations (video_clip_id) where video_clip_id is not null;

comment on table public.director_job_cancellations is
  '화면에서 멈춘 생성 작업(2026-11-14 오너 7번): 작업은 fal 에서 끝까지 돌고 Take 는 돌려주지 않는다. 같은 샷 하나만 검사 · 영상 투영 · 넘기기 고르기가 이 표를 보고 뺀다.';

-- 읽기는 video_clips 와 같은 범위(작업 공간 주인), 쓰기는 service role 만(cancel_director_jobs).
alter table public.director_job_cancellations enable row level security;
create policy "Owner select" on public.director_job_cancellations for select using (
  exists (select 1 from public.projects p join public.workspaces w on w.id = p.workspace_id where p.id = director_job_cancellations.project_id and w.owner_id = auth.uid())
);

-- 멈추기: 그 프로젝트에서 아직 도는(queued) 이미지 · 영상 작업만 적는다. 다시 불러도 같은 결과(이미 멈춘 것은 그대로 돌려준다).
create or replace function public.cancel_director_jobs(p_project_id uuid, p_job_ids uuid[], p_user_id uuid default null)
returns table(job_id uuid, kind text, writer_shot_ids text[], video_clip_id uuid, cancelled_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_project_id is null then raise exception 'project id is required'; end if;
  insert into public.director_job_cancellations as dc (job_id, project_id, video_clip_id, writer_shot_ids, cancelled_by)
  select gj.id, gj.project_id, gj.video_clip_id,
    coalesce(array(
      select distinct s from (
        select nullif(gj.target->>'writerShotId', '') as s
        union all
        select jsonb_array_elements_text(case when jsonb_typeof(gj.target->'writerShotIds') = 'array' then gj.target->'writerShotIds' else '[]'::jsonb end)
      ) shots where s is not null
    ), '{}'::text[]),
    p_user_id
  from public.generation_jobs gj
  where gj.project_id = p_project_id
    and gj.id = any(coalesce(p_job_ids, '{}'::uuid[]))
    and gj.status = 'queued'
    and gj.kind in ('shot_storyboard', 'storyboard_real_grid', 'shot_video')
  on conflict on constraint director_job_cancellations_pkey do nothing;
  return query
    select dc.job_id, gj.kind::text, dc.writer_shot_ids, dc.video_clip_id, dc.cancelled_at
    from public.director_job_cancellations dc join public.generation_jobs gj on gj.id = dc.job_id
    where dc.project_id = p_project_id and dc.job_id = any(coalesce(p_job_ids, '{}'::uuid[]));
end $$;
revoke all on function public.cancel_director_jobs(uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.cancel_director_jobs(uuid, uuid[], uuid) to service_role;

-- ─── 같은 샷 하나만 · 투영: 멈춘 작업을 세지 않게(아래는 지금 정의 그대로 + 멈춤 조건 한 줄) ───

create or replace function public.guard_storyboard_singleflight()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_shots text[];
  v_existing uuid;
begin
  if new.status <> 'queued' or new.kind not in ('shot_storyboard', 'storyboard_real_grid') then
    return new;
  end if;
  select array_agg(distinct shot_id) into v_shots from (
    select nullif(new.target->>'writerShotId', '') as shot_id
    union all
    select jsonb_array_elements_text(case when jsonb_typeof(new.target->'writerShotIds') = 'array'
      then new.target->'writerShotIds' else '[]'::jsonb end)
  ) shots where shot_id is not null;
  if coalesce(cardinality(v_shots), 0) = 0 then return new; end if;

  -- 자리 확보 트리거와 같은 잠금/순서를 사용한다. 조회와 예약 사이에 다른 삽입이 끼어들지 않는다.
  perform pg_advisory_xact_lock(hashtextextended('generation-capacity', 0));
  select j.id into v_existing from public.generation_jobs j
  where j.project_id = new.project_id and j.id <> new.id and j.status = 'queued'
    and not exists (select 1 from public.director_job_cancellations dc where dc.job_id = j.id)
    and j.kind in ('shot_storyboard', 'storyboard_real_grid')
    and (j.target->>'writerShotId' = any(v_shots) or (j.target->'writerShotIds') ?| v_shots)
  order by j.id limit 1;
  if found then
    raise exception 'storyboard_already_generating' using detail = v_existing::text;
  end if;
  return new;
end;
$$;

create or replace function public.reserve_director_video_take(p_project_id uuid, p_shot_id text, p_model text, p_target jsonb, p_idempotency_key uuid, p_input_snapshot jsonb default '{}'::jsonb, p_user_id uuid default null, p_workspace_id uuid default null, p_provider text default null, p_actor text default null, p_take_label text default null, p_override jsonb default '{}'::jsonb, p_canvas_position jsonb default null)
returns table(video_clip_id uuid, job_id uuid, take_number integer, replayed boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_clip public.video_clips%rowtype; v_job uuid; v_take integer;
  v_existing_snapshot jsonb; v_existing_target jsonb; v_existing_take_label text;
  v_existing_override jsonb; v_existing_canvas_position jsonb; v_snapshot jsonb;
  v_legacy_snapshot jsonb; v_workspace_id uuid; v_metadata jsonb; v_active_job uuid;
begin
  if nullif(btrim(p_model), '') is null then raise exception 'requested model must be nonblank'; end if;
  if p_idempotency_key is null then raise exception 'idempotency key is required'; end if;
  if p_input_snapshot is not null and jsonb_typeof(p_input_snapshot) <> 'object' then raise exception 'input snapshot must be a JSON object'; end if;
  v_metadata := jsonb_build_object('take_label', p_take_label, 'override', coalesce(p_override, '{}'::jsonb), 'canvas_position', p_canvas_position);
  if p_input_snapshot ? 'new_take_metadata' and p_input_snapshot->'new_take_metadata' is distinct from v_metadata then
    raise exception 'new take metadata does not match immutable input snapshot';
  end if;
  v_snapshot := coalesce(p_input_snapshot, '{}'::jsonb) || jsonb_build_object('requestedModel', p_model, 'new_take_metadata', v_metadata);

  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':new-take:' || p_idempotency_key::text, 0));
  select p.workspace_id into v_workspace_id from public.projects p join public.shots s on s.project_id = p.id where p.id = p_project_id and s.shot_id = p_shot_id;
  if not found then raise exception 'shot does not belong to project'; end if;
  if p_workspace_id is not null and p_workspace_id is distinct from v_workspace_id then raise exception 'workspace does not match project'; end if;
  if coalesce(p_target, '{}'::jsonb)->>'retakeMode' is distinct from 'new_take' or coalesce(p_target, '{}'::jsonb)->>'writerShotId' is distinct from p_shot_id or coalesce(p_target, '{}'::jsonb)->>'workspaceId' is distinct from v_workspace_id::text then raise exception 'new take target does not match project shot'; end if;

  select gj.video_clip_id, gj.id, gj.input_snapshot, gj.target, vc.take_label, vc.override, vc.canvas_position
    into video_clip_id, job_id, v_existing_snapshot, v_existing_target, v_existing_take_label, v_existing_override, v_existing_canvas_position
    from public.generation_jobs gj join public.video_clips vc on vc.id = gj.video_clip_id and vc.project_id = gj.project_id
    where gj.project_id = p_project_id and gj.kind = 'shot_video' and gj.idempotency_key = p_idempotency_key and gj.target->>'retakeMode' = 'new_take' limit 1;
  if found then
    v_legacy_snapshot := v_snapshot - 'new_take_metadata';
    if v_existing_target->>'writerShotId' is distinct from p_shot_id
      or (case when v_existing_snapshot ? 'new_take_metadata' then v_existing_snapshot else v_existing_snapshot || jsonb_build_object('new_take_metadata', v_metadata) end) is distinct from v_snapshot
      or (not (v_existing_snapshot ? 'new_take_metadata') and v_existing_snapshot is distinct from v_legacy_snapshot)
      or v_existing_take_label is distinct from p_take_label or v_existing_override is distinct from coalesce(p_override, '{}'::jsonb) or v_existing_canvas_position is distinct from p_canvas_position then raise exception 'idempotency mismatch'; end if;
    select vc.take_number into take_number from public.video_clips vc where vc.id = video_clip_id and vc.project_id = p_project_id;
    if take_number is null then raise exception 'reserved shot_video job has malformed clip linkage'; end if;
    replayed := true; return next; return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':shot:' || p_shot_id, 0));
  select gj.id into v_active_job
    from public.generation_jobs gj
    where gj.project_id = p_project_id and gj.kind = 'shot_video' and gj.status = 'queued'
      and not exists (select 1 from public.director_job_cancellations dc where dc.job_id = gj.id)
      and (
        gj.target->>'writerShotId' = p_shot_id
        or gj.target->>'shotId' = p_shot_id
        or exists (
          select 1 from public.video_clips vc
          where vc.id = gj.video_clip_id and vc.project_id = p_project_id and vc.shot_id = p_shot_id
        )
      )
    order by gj.created_at, gj.id limit 1;
  if found then
    raise exception 'director_video_shot_busy' using detail = v_active_job::text;
  end if;
  select coalesce(max(vc.take_number), 0) + 1 into v_take from public.video_clips vc where vc.project_id = p_project_id and vc.shot_id = p_shot_id;
  insert into public.video_clips(project_id, shot_id, take_number, status, last_attempt_status, last_attempt_at, updated_at, take_label, override, canvas_position) values (p_project_id, p_shot_id, v_take, 'pending', 'generating', now(), now(), p_take_label, coalesce(p_override, '{}'::jsonb), p_canvas_position) returning * into v_clip;
  v_job := gen_random_uuid();
  insert into public.generation_jobs(id, project_id, request_id, model, kind, status, target, input_snapshot, video_clip_id, idempotency_key, user_id, workspace_id, provider, actor) values (v_job, p_project_id, 'reserved:' || v_job::text, p_model, 'shot_video', 'queued', coalesce(p_target, '{}'::jsonb) || jsonb_build_object('videoClipId', v_clip.id), v_snapshot, v_clip.id, p_idempotency_key, p_user_id, v_workspace_id, coalesce(p_provider, 'fal'), coalesce(p_actor, 'ui'));
  video_clip_id := v_clip.id; job_id := v_job; take_number := v_take; replayed := false; return next;
end $$;

create or replace function public.reserve_director_video_regeneration(p_project_id uuid, p_video_clip_id uuid, p_model text, p_target jsonb, p_idempotency_key uuid, p_input_snapshot jsonb default '{}'::jsonb, p_user_id uuid default null, p_workspace_id uuid default null, p_provider text default null, p_actor text default null)
returns table(video_clip_id uuid, job_id uuid, take_number integer, replayed boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_clip public.video_clips%rowtype; v_job uuid; v_existing_snapshot jsonb; v_existing_target jsonb; v_shot_id text; v_snapshot jsonb; v_workspace_id uuid; v_active_job uuid;
begin
  if nullif(btrim(p_model), '') is null then raise exception 'requested model must be nonblank'; end if;
  if p_idempotency_key is null then raise exception 'idempotency key is required'; end if;
  if p_input_snapshot is not null and jsonb_typeof(p_input_snapshot) <> 'object' then raise exception 'input snapshot must be a JSON object'; end if;
  select vc.shot_id, p.workspace_id into v_shot_id, v_workspace_id from public.video_clips vc join public.projects p on p.id = vc.project_id where vc.id = p_video_clip_id and vc.project_id = p_project_id;
  if not found then raise exception 'live clip does not belong to project'; end if;
  if p_workspace_id is not null and p_workspace_id is distinct from v_workspace_id then raise exception 'workspace does not match project'; end if;
  if coalesce(p_target, '{}'::jsonb)->>'retakeMode' is distinct from 'regeneration' or coalesce(p_target, '{}'::jsonb)->>'writerShotId' is distinct from v_shot_id or coalesce(p_target, '{}'::jsonb)->>'videoClipId' is distinct from p_video_clip_id::text or coalesce(p_target, '{}'::jsonb)->>'workspaceId' is distinct from v_workspace_id::text then raise exception 'regeneration target does not match project clip'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':shot:' || v_shot_id, 0));
  v_snapshot := case when jsonb_typeof(coalesce(p_input_snapshot, '{}'::jsonb)) = 'object' then coalesce(p_input_snapshot, '{}'::jsonb) else '{}'::jsonb end || jsonb_build_object('requestedModel', p_model);
  select gj.video_clip_id, gj.id, gj.input_snapshot, gj.target into video_clip_id, job_id, v_existing_snapshot, v_existing_target from public.generation_jobs gj where gj.project_id = p_project_id and gj.kind = 'shot_video' and gj.video_clip_id = p_video_clip_id and gj.idempotency_key = p_idempotency_key limit 1;
  if found then
    if v_existing_target->>'retakeMode' is distinct from 'regeneration' or v_existing_target->>'writerShotId' is distinct from (coalesce(p_target, '{}'::jsonb)->>'writerShotId') or v_existing_target->>'videoClipId' is distinct from p_video_clip_id::text or v_existing_snapshot is distinct from v_snapshot or v_existing_snapshot->>'requestedModel' is distinct from p_model then raise exception 'idempotency mismatch'; end if;
    select vc.take_number into take_number from public.video_clips vc where vc.id = video_clip_id and vc.project_id = p_project_id;
    if take_number is null then raise exception 'reserved shot_video job has malformed clip linkage'; end if;
    replayed := true; return next; return;
  end if;
  select * into v_clip from public.video_clips where id = p_video_clip_id and project_id = p_project_id and deleted_at is null for update;
  if not found then raise exception 'live clip does not belong to project'; end if;
  if exists (select 1 from public.generation_jobs gj where gj.video_clip_id = p_video_clip_id and gj.kind = 'shot_video' and gj.status = 'queued') then raise exception 'clip already has a queued attempt'; end if;
  select gj.id into v_active_job
    from public.generation_jobs gj
    where gj.project_id = p_project_id and gj.kind = 'shot_video' and gj.status = 'queued'
      and not exists (select 1 from public.director_job_cancellations dc where dc.job_id = gj.id)
      and (
        gj.target->>'writerShotId' = v_shot_id
        or gj.target->>'shotId' = v_shot_id
        or exists (
          select 1 from public.video_clips vc
          where vc.id = gj.video_clip_id and vc.project_id = p_project_id and vc.shot_id = v_shot_id
        )
      )
    order by gj.created_at, gj.id limit 1;
  if found then
    raise exception 'director_video_shot_busy' using detail = v_active_job::text;
  end if;
  v_job := gen_random_uuid();
  insert into public.generation_jobs(id, project_id, request_id, model, kind, status, target, input_snapshot, video_clip_id, idempotency_key, user_id, workspace_id, provider, actor) values (v_job, p_project_id, 'reserved:' || v_job::text, p_model, 'shot_video', 'queued', coalesce(p_target, '{}'::jsonb) || jsonb_build_object('videoClipId', p_video_clip_id), v_snapshot, p_video_clip_id, p_idempotency_key, p_user_id, v_workspace_id, coalesce(p_provider, 'fal'), coalesce(p_actor, 'ui'));
  update public.video_clips set last_attempt_status = 'generating', last_attempt_error = null, last_attempt_at = now(), updated_at = now() where id = p_video_clip_id and deleted_at is null;
  video_clip_id := p_video_clip_id; job_id := v_job; take_number := v_clip.take_number; replayed := false; return next;
end $$;

create or replace function public.reserve_director_video_batch_item(
  p_item_id uuid,
  p_lease_token uuid,
  p_args jsonb
) returns table(video_clip_id uuid, job_id uuid, take_number integer, replayed boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_item public.director_video_batch_items%rowtype;
  v_batch public.director_video_batches%rowtype;
  v_project_id uuid;
  v_user_id uuid;
  v_workspace_id uuid;
  v_shot_id text;
  v_idempotency_key uuid;
  v_queued_count integer;
  v_batch_limit integer;
  v_current_workspace uuid;
  v_current_owner uuid;
  v_reservation record;
begin
  if p_item_id is null then raise exception 'batch item id is required'; end if;
  if p_lease_token is null then raise exception 'lease token is required'; end if;
  if p_args is null or jsonb_typeof(p_args) <> 'object' then
    raise exception 'batch item reservation args must be a JSON object';
  end if;

  select * into v_item from public.director_video_batch_items where id = p_item_id for update;
  if not found then raise exception 'batch item not found'; end if;

  select * into v_batch from public.director_video_batches where id = v_item.batch_id for update;
  if not found then raise exception 'batch not found for item'; end if;

  v_project_id := v_batch.project_id;
  v_user_id := v_batch.user_id;
  v_workspace_id := v_batch.workspace_id;

  select p.workspace_id, w.owner_id into v_current_workspace, v_current_owner
  from public.projects p join public.workspaces w on w.id = p.workspace_id
  where p.id = v_project_id
  for share of p, w;
  if not found or v_current_workspace is distinct from v_workspace_id
     or v_current_owner is distinct from v_user_id then
    raise exception 'user no longer owns the batch project workspace';
  end if;

  if nullif(p_args->>'projectId', '') is null or (p_args->>'projectId')::uuid is distinct from v_project_id then
    raise exception 'batch item reservation project does not match batch';
  end if;
  if nullif(p_args->>'userId', '') is null or (p_args->>'userId')::uuid is distinct from v_user_id then
    raise exception 'batch item reservation user does not match batch';
  end if;
  if p_args ? 'workspaceId' and p_args->>'workspaceId' is not null
     and (p_args->>'workspaceId')::uuid is distinct from v_workspace_id then
    raise exception 'batch item reservation workspace does not match batch';
  end if;
  if nullif(p_args->>'shotId', '') is null or (p_args->>'shotId') is distinct from v_item.shot_id then
    raise exception 'batch item reservation shot does not match item';
  end if;
  -- item.id 는 그 샷의 고정 요청키다 — 다른 키로 재제출하지 않는다는 계약을 여기서 강제한다.
  if nullif(p_args->>'idempotencyKey', '') is null or (p_args->>'idempotencyKey')::uuid is distinct from v_item.id then
    raise exception 'batch item reservation key does not match item';
  end if;

  v_shot_id := v_item.shot_id;
  v_idempotency_key := v_item.id;

  -- 기존 reserve_director_video_take 와 같은 순서로 잠근다: 요청키 잠금 → 샷 잠금.
  --   같은 트랜잭션 안에서 reserve_director_video_take 가 다시 잡아도 재진입 가능(no-op).
  perform pg_advisory_xact_lock(hashtextextended(v_project_id::text || ':new-take:' || v_idempotency_key::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_project_id::text || ':shot:' || v_shot_id, 0));

  if v_item.status = 'pending' then
    if v_batch.status <> 'running' then
      raise exception 'batch is not running';
    end if;
    if v_batch.lease_token is null
       or v_batch.lease_token is distinct from p_lease_token
       or v_batch.lease_expires_at is null
       or v_batch.lease_expires_at <= now() then
      raise exception 'batch lease is invalid or expired';
    end if;
    -- 이 항목은 아직 잡을 낸 적이 없다 — 새 유료 작업을 만들기 전, 그 사이 다른 경로가
    --   이미 이 샷을 채우지 않았는지 확인한다.
    if exists (
      select 1 from public.generation_jobs gj
      where gj.project_id = v_project_id
        and gj.kind = 'shot_video'
        and gj.status = 'queued'
        and not exists (select 1 from public.director_job_cancellations dc where dc.job_id = gj.id)
        and (
          gj.target->>'writerShotId' = v_shot_id
          or exists (
            select 1 from public.video_clips vc
            where vc.id = gj.video_clip_id and vc.project_id = v_project_id and vc.shot_id = v_shot_id
          )
        )
    ) then
      raise exception 'batch_shot_busy';
    end if;
    if exists (
      select 1 from public.video_clips vc
      where vc.project_id = v_project_id
        and vc.shot_id = v_shot_id
        and vc.deleted_at is null
        and vc.status = 'completed'
        and vc.url is not null
        and btrim(vc.url) <> ''
        and (vc.is_final or not exists (select 1 from public.director_job_cancellations dc where dc.job_id = vc.last_attempt_job_id))
    ) then
      raise exception 'batch_shot_already_completed';
    end if;

    -- 유저 단위 동시 상한 — MAX_QUEUED_VIDEO_JOBS_PER_USER(generation-quota.ts)와 같은 값(3).
    --   시연 계정은 generation_capacity_exempt_users.per_user_limit(10, 2026-10-27 오너)을 쓴다.
    --   관리자 행(칸 비어 있음)은 지금처럼 3이다 — 일괄의 개인 상한은 관리자도 받아 왔다.
    --   advisory lock 으로 count-then-submit 경쟁을 직렬화한다(gen-quota-atomic-gate 와 같은 패턴).
    perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':batch-video-capacity', 0));
    select count(*) into v_queued_count
    from public.generation_jobs
    where user_id = v_user_id
      and kind in ('shot_video', 'shot_previz_video')
      and status = 'queued';
    select e.per_user_limit into v_batch_limit
    from public.generation_capacity_exempt_users e
    where e.user_id = v_user_id;
    if v_queued_count >= coalesce(v_batch_limit, 3) then
      raise exception 'batch_user_at_capacity';
    end if;
  elsif v_item.status <> 'submitted' then
    raise exception 'batch item is not reservable in its current status';
  else
    -- 중단한 뒤에도 이미 접수한 작업은 조회·연결 복구한다. 사라진 작업을 새로 만들지는 않는다.
    perform 1 from public.generation_jobs
    where id = v_item.job_id and project_id = v_project_id and idempotency_key = v_idempotency_key
    for share;
    if not found then raise exception 'recorded batch job is missing'; end if;
  end if;

  select * into v_reservation from public.reserve_director_video_take(
    v_project_id,
    v_shot_id,
    p_args->>'model',
    coalesce(p_args->'target', '{}'::jsonb),
    v_idempotency_key,
    coalesce(p_args->'inputSnapshot', '{}'::jsonb),
    v_user_id,
    v_workspace_id,
    nullif(p_args->>'provider', ''),
    nullif(p_args->>'actor', ''),
    nullif(p_args->>'takeLabel', ''),
    coalesce(p_args->'override', '{}'::jsonb),
    nullif(p_args->'canvasPosition', 'null'::jsonb)
  );

  update public.generation_jobs
  set batch_id = v_batch.id,
      batch_total = (select count(*) from public.director_video_batch_items where batch_id = v_batch.id),
      updated_at = now()
  where id = v_reservation.job_id;

  update public.director_video_batch_items
  set job_id = v_reservation.job_id, status = 'submitted', error = null, updated_at = now()
  where id = v_item.id;

  video_clip_id := v_reservation.video_clip_id;
  job_id := v_reservation.job_id;
  take_number := v_reservation.take_number;
  replayed := v_reservation.replayed;
  return next;
end $$;

create or replace function public.refresh_director_video_projection(p_project_id uuid, p_shot_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_url text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':' || p_shot_id, 0));
  select vc.url into v_url from public.video_clips vc
  where vc.project_id = p_project_id and vc.shot_id = p_shot_id and vc.deleted_at is null and vc.status = 'completed' and vc.url is not null
    and (vc.is_final or not exists (select 1 from public.director_job_cancellations dc where dc.job_id = vc.last_attempt_job_id))
  order by (vc.is_final) desc, vc.take_number desc, vc.created_at desc, vc.id desc limit 1;
  update public.shots set video_url = v_url where shot_id = p_shot_id and project_id = p_project_id;
end $$;

revoke all on function public.guard_storyboard_singleflight() from public, anon, authenticated;
grant execute on function public.guard_storyboard_singleflight() to service_role;
revoke all on function public.reserve_director_video_take(uuid, text, text, jsonb, uuid, jsonb, uuid, uuid, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_director_video_take(uuid, text, text, jsonb, uuid, jsonb, uuid, uuid, text, text, text, jsonb, jsonb) to service_role;
revoke all on function public.reserve_director_video_regeneration(uuid, uuid, text, jsonb, uuid, jsonb, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.reserve_director_video_regeneration(uuid, uuid, text, jsonb, uuid, jsonb, uuid, uuid, text, text) to service_role;
revoke all on function public.reserve_director_video_batch_item(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_director_video_batch_item(uuid, uuid, jsonb) to service_role;
revoke all on function public.refresh_director_video_projection(uuid, text) from public, anon, authenticated;
grant execute on function public.refresh_director_video_projection(uuid, text) to service_role;

notify pgrst, 'reload schema';
commit;
