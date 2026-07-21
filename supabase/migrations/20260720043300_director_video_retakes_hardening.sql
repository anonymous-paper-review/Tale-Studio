begin;

-- Keep deployed legacy rows readable while rejecting blank media on all future writes.
alter table public.video_clips add constraint video_clips_url_nonblank check (url is null or btrim(url) <> '') not valid;
alter table public.generation_jobs add constraint generation_jobs_result_url_nonblank check (result_url is null or btrim(result_url) <> '') not valid;
alter table public.generation_jobs add constraint generation_jobs_video_clip_kind check (video_clip_id is null or kind = 'shot_video') not valid;
alter table public.generation_jobs add constraint generation_jobs_idempotency_kind check (idempotency_key is null or kind = 'shot_video') not valid;
alter table public.generation_jobs add constraint generation_jobs_linked_video_replay check (kind <> 'shot_video' or video_clip_id is null or idempotency_key is not null) not valid;
alter table public.generation_jobs add constraint generation_jobs_linked_video_requested_model check (kind <> 'shot_video' or video_clip_id is null or nullif(btrim(input_snapshot->>'requestedModel'), '') is not null) not valid;
alter table public.video_clips add constraint video_clips_id_project_id_key unique (id, project_id);
alter table public.generation_jobs drop constraint if exists generation_jobs_video_clip_id_fkey;
alter table public.generation_jobs add constraint generation_jobs_video_clip_project_fkey foreign key (video_clip_id, project_id) references public.video_clips(id, project_id) on delete no action deferrable initially deferred not valid;

-- The requested model is an immutable reservation/replay fingerprint; provider attachment may record a
-- different provider model without changing the requested model.
update public.generation_jobs
set input_snapshot = case
  when jsonb_typeof(coalesce(input_snapshot, '{}'::jsonb)) = 'object'
    then jsonb_set(coalesce(input_snapshot, '{}'::jsonb), '{requestedModel}', to_jsonb(coalesce(input_snapshot->>'resolved_model_key', model)), true)
  else jsonb_build_object('requestedModel', coalesce(input_snapshot->>'resolved_model_key', model))
end
where kind = 'shot_video' and (input_snapshot->>'requestedModel') is distinct from coalesce(input_snapshot->>'resolved_model_key', model);

alter table public.video_clips validate constraint video_clips_url_nonblank;
alter table public.generation_jobs validate constraint generation_jobs_result_url_nonblank;
alter table public.generation_jobs validate constraint generation_jobs_video_clip_kind;
alter table public.generation_jobs validate constraint generation_jobs_idempotency_kind;
alter table public.generation_jobs validate constraint generation_jobs_linked_video_replay;
alter table public.generation_jobs validate constraint generation_jobs_linked_video_requested_model;
alter table public.generation_jobs validate constraint generation_jobs_video_clip_project_fkey;

create or replace function public.director_video_requested_model_immutable()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.kind = 'shot_video'
     and old.input_snapshot->>'requestedModel' is distinct from new.input_snapshot->>'requestedModel' then
    raise exception 'requestedModel is immutable';
  end if;
  return new;
end $$;
drop trigger if exists director_video_requested_model_immutable on public.generation_jobs;
create trigger director_video_requested_model_immutable before update on public.generation_jobs
for each row execute function public.director_video_requested_model_immutable();

create or replace function public.reserve_director_video_take(p_project_id uuid, p_shot_id text, p_model text, p_target jsonb, p_idempotency_key uuid, p_input_snapshot jsonb default '{}'::jsonb, p_user_id uuid default null, p_workspace_id uuid default null, p_provider text default null, p_actor text default null, p_take_label text default null, p_override jsonb default '{}'::jsonb, p_canvas_position jsonb default null)
returns table(video_clip_id uuid, job_id uuid, take_number integer, replayed boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_clip public.video_clips%rowtype; v_job uuid; v_take integer; v_existing_snapshot jsonb; v_existing_target jsonb; v_snapshot jsonb; v_workspace_id uuid;
begin
  if nullif(btrim(p_model), '') is null then raise exception 'requested model must be nonblank'; end if;
  if p_idempotency_key is null then raise exception 'idempotency key is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':' || p_shot_id, 0));
  select p.workspace_id into v_workspace_id
  from public.projects p
  join public.shots s on s.project_id = p.id
  where p.id = p_project_id and s.shot_id = p_shot_id;
  if not found then raise exception 'shot does not belong to project'; end if;
  if p_workspace_id is not null and p_workspace_id is distinct from v_workspace_id then
    raise exception 'workspace does not match project';
  end if;
  if coalesce(p_target, '{}'::jsonb)->>'retakeMode' is distinct from 'new_take'
     or coalesce(p_target, '{}'::jsonb)->>'writerShotId' is distinct from p_shot_id
     or coalesce(p_target, '{}'::jsonb)->>'workspaceId' is distinct from v_workspace_id::text then
    raise exception 'new take target does not match project shot';
  end if;
  v_snapshot := case when jsonb_typeof(coalesce(p_input_snapshot, '{}'::jsonb)) = 'object' then coalesce(p_input_snapshot, '{}'::jsonb) else '{}'::jsonb end || jsonb_build_object('requestedModel', p_model);
  select gj.video_clip_id, gj.id, gj.input_snapshot, gj.target into video_clip_id, job_id, v_existing_snapshot, v_existing_target
  from public.generation_jobs gj where gj.project_id = p_project_id and gj.kind = 'shot_video' and gj.idempotency_key = p_idempotency_key limit 1;
  if found then
    if v_existing_target->>'retakeMode' is distinct from 'new_take' or v_existing_target->>'writerShotId' is distinct from p_shot_id
       or v_existing_snapshot is distinct from v_snapshot or v_existing_snapshot->>'requestedModel' is distinct from p_model then raise exception 'idempotency mismatch'; end if;
    select vc.take_number into take_number from public.video_clips vc where vc.id = video_clip_id and vc.project_id = p_project_id;
    if take_number is null then raise exception 'reserved shot_video job has malformed clip linkage'; end if;
    replayed := true; return next; return;
  end if;
  select coalesce(max(vc.take_number), 0) + 1 into v_take from public.video_clips vc where vc.project_id = p_project_id and vc.shot_id = p_shot_id;
  insert into public.video_clips(project_id, shot_id, take_number, status, last_attempt_status, last_attempt_at, updated_at, take_label, override, canvas_position) values (p_project_id, p_shot_id, v_take, 'pending', 'generating', now(), now(), p_take_label, p_override, p_canvas_position) returning * into v_clip;
  v_job := gen_random_uuid();
  insert into public.generation_jobs(id, project_id, request_id, model, kind, status, target, input_snapshot, video_clip_id, idempotency_key, user_id, workspace_id, provider, actor) values (v_job, p_project_id, 'reserved:' || v_job::text, p_model, 'shot_video', 'queued', coalesce(p_target, '{}'::jsonb) || jsonb_build_object('videoClipId', v_clip.id), v_snapshot, v_clip.id, p_idempotency_key, p_user_id, v_workspace_id, coalesce(p_provider, 'fal'), coalesce(p_actor, 'ui'));
  video_clip_id := v_clip.id; job_id := v_job; take_number := v_take; replayed := false; return next;
end $$;

create or replace function public.reserve_director_video_regeneration(p_project_id uuid, p_video_clip_id uuid, p_model text, p_target jsonb, p_idempotency_key uuid, p_input_snapshot jsonb default '{}'::jsonb, p_user_id uuid default null, p_workspace_id uuid default null, p_provider text default null, p_actor text default null)
returns table(video_clip_id uuid, job_id uuid, take_number integer, replayed boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_clip public.video_clips%rowtype; v_job uuid; v_existing_snapshot jsonb; v_existing_target jsonb; v_shot_id text; v_snapshot jsonb; v_workspace_id uuid;
begin
  if nullif(btrim(p_model), '') is null then raise exception 'requested model must be nonblank'; end if;
  if p_idempotency_key is null then raise exception 'idempotency key is required'; end if;
  select vc.shot_id, p.workspace_id into v_shot_id, v_workspace_id
  from public.video_clips vc
  join public.projects p on p.id = vc.project_id
  where vc.id = p_video_clip_id and vc.project_id = p_project_id;
  if not found then raise exception 'live clip does not belong to project'; end if;
  if p_workspace_id is not null and p_workspace_id is distinct from v_workspace_id then
    raise exception 'workspace does not match project';
  end if;
  if coalesce(p_target, '{}'::jsonb)->>'retakeMode' is distinct from 'regeneration'
     or coalesce(p_target, '{}'::jsonb)->>'writerShotId' is distinct from v_shot_id
     or coalesce(p_target, '{}'::jsonb)->>'videoClipId' is distinct from p_video_clip_id::text
     or coalesce(p_target, '{}'::jsonb)->>'workspaceId' is distinct from v_workspace_id::text then
    raise exception 'regeneration target does not match project clip';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':' || v_shot_id, 0));
  v_snapshot := case when jsonb_typeof(coalesce(p_input_snapshot, '{}'::jsonb)) = 'object' then coalesce(p_input_snapshot, '{}'::jsonb) else '{}'::jsonb end || jsonb_build_object('requestedModel', p_model);
  select gj.video_clip_id, gj.id, gj.input_snapshot, gj.target into video_clip_id, job_id, v_existing_snapshot, v_existing_target from public.generation_jobs gj where gj.project_id = p_project_id and gj.kind = 'shot_video' and gj.idempotency_key = p_idempotency_key limit 1;
  if found then
    if video_clip_id is distinct from p_video_clip_id or v_existing_target->>'retakeMode' is distinct from 'regeneration' or v_existing_target->>'writerShotId' is distinct from (coalesce(p_target, '{}'::jsonb)->>'writerShotId') or v_existing_target->>'videoClipId' is distinct from p_video_clip_id::text or v_existing_snapshot is distinct from v_snapshot or v_existing_snapshot->>'requestedModel' is distinct from p_model then raise exception 'idempotency mismatch'; end if;
    select vc.take_number into take_number from public.video_clips vc where vc.id = video_clip_id and vc.project_id = p_project_id;
    if take_number is null then raise exception 'reserved shot_video job has malformed clip linkage'; end if;
    replayed := true; return next; return;
  end if;
  select * into v_clip from public.video_clips where id = p_video_clip_id and project_id = p_project_id and deleted_at is null for update;
  if not found then raise exception 'live clip does not belong to project'; end if;
  if exists (select 1 from public.generation_jobs gj where gj.video_clip_id = p_video_clip_id and gj.kind = 'shot_video' and gj.status = 'queued') then raise exception 'clip already has a queued attempt'; end if;
  v_job := gen_random_uuid();
  insert into public.generation_jobs(id, project_id, request_id, model, kind, status, target, input_snapshot, video_clip_id, idempotency_key, user_id, workspace_id, provider, actor) values (v_job, p_project_id, 'reserved:' || v_job::text, p_model, 'shot_video', 'queued', coalesce(p_target, '{}'::jsonb) || jsonb_build_object('videoClipId', p_video_clip_id), v_snapshot, p_video_clip_id, p_idempotency_key, p_user_id, v_workspace_id, coalesce(p_provider, 'fal'), coalesce(p_actor, 'ui'));
  update public.video_clips set last_attempt_status = 'generating', last_attempt_error = null, last_attempt_at = now(), updated_at = now() where id = p_video_clip_id and deleted_at is null;
  video_clip_id := p_video_clip_id; job_id := v_job; take_number := v_clip.take_number; replayed := false; return next;
end $$;

create or replace function public.attach_director_video_provider_request(p_project_id uuid, p_job_id uuid, p_provider_request_id text, p_provider text default null, p_model text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_job public.generation_jobs%rowtype; v_clip public.video_clips%rowtype; v_shot_id text;
begin
  if nullif(btrim(p_provider_request_id), '') is null then raise exception 'provider request id must be nonblank'; end if;
  if p_provider is not null and nullif(btrim(p_provider), '') is null then raise exception 'provider must be nonblank'; end if;
  if p_model is not null and nullif(btrim(p_model), '') is null then raise exception 'provider model must be nonblank'; end if;
  select vc.shot_id into v_shot_id from public.generation_jobs gj join public.video_clips vc on vc.id = gj.video_clip_id and vc.project_id = gj.project_id where gj.id = p_job_id and gj.project_id = p_project_id and gj.kind = 'shot_video';
  if not found then raise exception 'reserved shot_video job has malformed clip linkage'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':' || v_shot_id, 0));
  select * into v_job from public.generation_jobs where id = p_job_id and project_id = p_project_id and kind = 'shot_video' for update;
  if not found or v_job.video_clip_id is null or v_job.status <> 'queued' or v_job.request_id not like 'reserved:%' then raise exception 'reserved queued video job does not belong to project'; end if;
  select * into v_clip from public.video_clips where id = v_job.video_clip_id and project_id = p_project_id and deleted_at is null for update;
  if not found then raise exception 'reserved shot_video job has malformed clip linkage'; end if;
  update public.generation_jobs set request_id = p_provider_request_id, submitted_at = now(), attempts = 1, updated_at = now(), provider = coalesce(p_provider, provider), model = coalesce(p_model, model) where id = p_job_id and status = 'queued';
end $$;

create or replace function public.complete_director_video_attempt(p_project_id uuid, p_job_id uuid, p_video_clip_id uuid, p_result_url text, p_storage_path text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_job public.generation_jobs%rowtype; v_clip public.video_clips%rowtype; v_shot_id text; v_workspace_id uuid;
begin
  if nullif(btrim(p_result_url), '') is null then raise exception 'video result URL must be nonblank'; end if;
  select vc.shot_id, p.workspace_id into v_shot_id, v_workspace_id
  from public.video_clips vc
  join public.projects p on p.id = vc.project_id
  where vc.id = p_video_clip_id and vc.project_id = p_project_id;
  if not found then raise exception 'linked shot_video clip does not belong to project'; end if;
  if nullif(btrim(p_storage_path), '') is null
     or p_storage_path !~ ('^' || v_workspace_id::text || '/' || p_project_id::text || '/videos/' || p_video_clip_id::text || '/' || p_job_id::text || '[.]mp4$') then
    raise exception 'video storage path does not match current job';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':' || v_shot_id, 0));
  select * into v_clip from public.video_clips where id = p_video_clip_id and project_id = p_project_id and deleted_at is null for update;
  if not found then raise exception 'linked shot_video clip does not belong to project'; end if;
  select * into v_job from public.generation_jobs where id = p_job_id and project_id = p_project_id and kind = 'shot_video' and video_clip_id = p_video_clip_id for update;
  if not found then raise exception 'linked shot_video job does not belong to project'; end if;
  if v_job.status = 'completed' then
    if v_job.result_url is distinct from p_result_url
       or v_clip.url is distinct from p_result_url
       or v_clip.storage_path is distinct from p_storage_path then
      raise exception 'completed video attempt replay mismatch';
    end if;
    return;
  end if;
  if v_job.status <> 'queued' then raise exception 'linked shot_video job is not queued'; end if;
  update public.generation_jobs set status = 'completed', result_url = p_result_url, error = null, completed_at = now(), updated_at = now() where id = p_job_id and status = 'queued';
  update public.video_clips set url = p_result_url, storage_path = p_storage_path, thumbnail_path = null, thumbnail_url = null, status = 'completed', last_attempt_status = 'completed', last_attempt_error = null, last_attempt_at = now(), updated_at = now() where id = p_video_clip_id and deleted_at is null;
  perform public.refresh_director_video_projection(p_project_id, v_clip.shot_id);
end $$;

create or replace function public.fail_director_video_attempt(p_project_id uuid, p_job_id uuid, p_error text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_job public.generation_jobs%rowtype; v_clip public.video_clips%rowtype; v_error text; v_shot_id text;
begin
  select * into v_job from public.generation_jobs where id = p_job_id and project_id = p_project_id and kind = 'shot_video';
  if not found then raise exception 'shot_video job does not belong to project'; end if;
  if v_job.status <> 'queued' then return; end if;
  if v_job.video_clip_id is null then raise exception 'linked shot_video job has malformed clip linkage'; end if;
  select shot_id into v_shot_id from public.video_clips where id = v_job.video_clip_id and project_id = p_project_id;
  if not found then raise exception 'linked shot_video job has malformed clip linkage'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':' || v_shot_id, 0));
  select * into v_job from public.generation_jobs where id = p_job_id and project_id = p_project_id and kind = 'shot_video' for update;
  if not found or v_job.video_clip_id is null then raise exception 'linked shot_video job has malformed clip linkage'; end if;
  if v_job.status <> 'queued' then return; end if;
  select * into v_clip from public.video_clips where id = v_job.video_clip_id and project_id = p_project_id for update;
  if not found then raise exception 'linked shot_video job has malformed clip linkage'; end if;
  v_error := left(coalesce(p_error, ''), 1000);
  update public.generation_jobs set status = 'failed', error = v_error, last_error = v_error, completed_at = now(), updated_at = now() where id = p_job_id and status = 'queued';
  if v_clip.deleted_at is null then
    update public.video_clips set last_attempt_status = 'failed', last_attempt_error = v_error, last_attempt_at = now(), updated_at = now(), status = case when url is null then 'failed' else status end where id = v_clip.id and deleted_at is null;
  end if;
end $$;

revoke all on function public.director_video_requested_model_immutable() from public, anon, authenticated;
revoke all on function public.attach_director_video_provider_request(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.reserve_director_video_take(uuid, text, text, jsonb, uuid, jsonb, uuid, uuid, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.reserve_director_video_regeneration(uuid, uuid, text, jsonb, uuid, jsonb, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.complete_director_video_attempt(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.fail_director_video_attempt(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.attach_director_video_provider_request(uuid, uuid, text, text, text) to service_role;
grant execute on function public.reserve_director_video_take(uuid, text, text, jsonb, uuid, jsonb, uuid, uuid, text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.reserve_director_video_regeneration(uuid, uuid, text, jsonb, uuid, jsonb, uuid, uuid, text, text) to service_role;
grant execute on function public.complete_director_video_attempt(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.fail_director_video_attempt(uuid, uuid, text) to service_role;

commit;
