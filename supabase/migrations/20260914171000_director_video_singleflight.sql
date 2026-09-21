-- 같은 샷의 영상은 새 테이크·기존 영상 재생성·일괄 생성 중 하나만 접수한다.
-- 같은 요청키의 재전송은 입력 일치 검증 후 기존 작업을 그대로 돌려준다.
-- 다른 요청키가 진행 중인 샷을 다시 요청하면 명확한 busy 오류와 기존 작업 ID를 돌려준다.
-- 잠금 순서는 기존 일괄 예약과 같다: 요청키(새 테이크만) → 샷 → 용량.
-- 재생성도 같은 샷 잠금을 사용하되 같은 클립의 기존 거절 문구는 유지한다.
begin;

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

revoke all on function public.reserve_director_video_take(uuid, text, text, jsonb, uuid, jsonb, uuid, uuid, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.reserve_director_video_regeneration(uuid, uuid, text, jsonb, uuid, jsonb, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.reserve_director_video_take(uuid, text, text, jsonb, uuid, jsonb, uuid, uuid, text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.reserve_director_video_regeneration(uuid, uuid, text, jsonb, uuid, jsonb, uuid, uuid, text, text) to service_role;

notify pgrst, 'reload schema';
commit;
