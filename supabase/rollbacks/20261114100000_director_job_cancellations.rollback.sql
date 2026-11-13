-- 되돌리기: 20261114100000_director_job_cancellations(화면에서 멈춘 생성 작업, 2026-11-14) — 마이그레이션이 아니다. 사람이 골라 실행한다(개발 DB 먼저 → 운영).
--   이 파일은 supabase/migrations 밖에 둔다 — 그 폴더의 .sql 은 모두 마이그레이션으로 실행된다.
--   순서: (1) 앱을 이 마이그레이션 전 코드로 먼저 되돌린다(새 코드는 cancel_director_jobs · director_job_cancellations 를 쓴다).
--         (2) 아래를 한 번에 실행한다 — 바꾼 함수 다섯을 바꾸기 전 정의(아래 그대로)로 되돌리고, 새 함수 · 새 표를 지운다.
--   남는 것: 없음. 멈춘 작업 표시는 사라지고, 그때 멈춘 작업은 다시 "진행 중"으로 센다(끝나면 종전처럼 지금 그림 · 영상이 된다).
begin;

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

drop function if exists public.cancel_director_jobs(uuid, uuid[], uuid);
drop table if exists public.director_job_cancellations;

delete from supabase_migrations.schema_migrations where version = '20261114100000';

notify pgrst, 'reload schema';
commit;
