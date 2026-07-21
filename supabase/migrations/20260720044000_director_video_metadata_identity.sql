begin;

-- Validate caller-provided metadata before canonicalization.  Missing metadata
-- remains compatible with reservations created before 438.
create or replace function public.reserve_director_video_take(p_project_id uuid, p_shot_id text, p_model text, p_target jsonb, p_idempotency_key uuid, p_input_snapshot jsonb default '{}'::jsonb, p_user_id uuid default null, p_workspace_id uuid default null, p_provider text default null, p_actor text default null, p_take_label text default null, p_override jsonb default '{}'::jsonb, p_canvas_position jsonb default null)
returns table(video_clip_id uuid, job_id uuid, take_number integer, replayed boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_clip public.video_clips%rowtype; v_job uuid; v_take integer;
  v_existing_snapshot jsonb; v_existing_target jsonb; v_existing_take_label text;
  v_existing_override jsonb; v_existing_canvas_position jsonb; v_snapshot jsonb;
  v_legacy_snapshot jsonb; v_workspace_id uuid; v_metadata jsonb;
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
  select coalesce(max(vc.take_number), 0) + 1 into v_take from public.video_clips vc where vc.project_id = p_project_id and vc.shot_id = p_shot_id;
  insert into public.video_clips(project_id, shot_id, take_number, status, last_attempt_status, last_attempt_at, updated_at, take_label, override, canvas_position) values (p_project_id, p_shot_id, v_take, 'pending', 'generating', now(), now(), p_take_label, coalesce(p_override, '{}'::jsonb), p_canvas_position) returning * into v_clip;
  v_job := gen_random_uuid();
  insert into public.generation_jobs(id, project_id, request_id, model, kind, status, target, input_snapshot, video_clip_id, idempotency_key, user_id, workspace_id, provider, actor) values (v_job, p_project_id, 'reserved:' || v_job::text, p_model, 'shot_video', 'queued', coalesce(p_target, '{}'::jsonb) || jsonb_build_object('videoClipId', v_clip.id), v_snapshot, v_clip.id, p_idempotency_key, p_user_id, v_workspace_id, coalesce(p_provider, 'fal'), coalesce(p_actor, 'ui'));
  video_clip_id := v_clip.id; job_id := v_job; take_number := v_take; replayed := false; return next;
end $$;

revoke all on function public.reserve_director_video_take(uuid, text, text, jsonb, uuid, jsonb, uuid, uuid, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_director_video_take(uuid, text, text, jsonb, uuid, jsonb, uuid, uuid, text, text, text, jsonb, jsonb) to service_role;
commit;
