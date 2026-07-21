begin;

alter table public.video_clips add column if not exists take_number integer;
alter table public.video_clips add column if not exists deleted_at timestamptz;
alter table public.video_clips add column if not exists last_attempt_status text;
alter table public.video_clips add column if not exists last_attempt_error text;
alter table public.video_clips add column if not exists last_attempt_at timestamptz;
update public.video_clips
set take_number = coalesce(take_number, 1),
    last_attempt_status = coalesce(last_attempt_status, status),
    last_attempt_at = coalesce(last_attempt_at, updated_at, created_at)
where take_number is null or last_attempt_status is null or last_attempt_at is null;
alter table public.video_clips alter column take_number set not null;
alter table public.video_clips drop constraint if exists video_clips_take_number_positive;
alter table public.video_clips add constraint video_clips_take_number_positive check (take_number > 0);
alter table public.video_clips drop constraint if exists video_clips_project_id_shot_id_key;
create unique index if not exists video_clips_project_shot_take_key on public.video_clips (project_id, shot_id, take_number);
create unique index if not exists video_clips_one_live_final_per_shot on public.video_clips (project_id, shot_id) where is_final and deleted_at is null;
create index if not exists video_clips_live_success_lookup on public.video_clips (project_id, shot_id, take_number desc, created_at desc, id desc) where deleted_at is null and status = 'completed' and url is not null;

alter table public.generation_jobs add column if not exists video_clip_id uuid references public.video_clips(id) on delete set null;
alter table public.generation_jobs add column if not exists idempotency_key uuid;
create unique index if not exists generation_jobs_shot_video_replay_key on public.generation_jobs (project_id, kind, idempotency_key) where kind = 'shot_video' and idempotency_key is not null;
create index if not exists generation_jobs_video_clip_attempts on public.generation_jobs (video_clip_id, created_at desc) where video_clip_id is not null;

-- Owners may inspect their clips, while mutations pass through service-role RPCs.
drop policy if exists "Owner insert" on public.video_clips;
drop policy if exists "Owner update" on public.video_clips;
drop policy if exists "Owner delete" on public.video_clips;
drop policy if exists "Owners can insert video clips" on public.video_clips;
drop policy if exists "Owners can update video clips" on public.video_clips;
drop policy if exists "Owners can delete video clips" on public.video_clips;
drop policy if exists "Users can insert video clips" on public.video_clips;
drop policy if exists "Users can update video clips" on public.video_clips;
drop policy if exists "Users can delete video clips" on public.video_clips;
drop policy if exists "Owner select" on public.video_clips;
drop policy if exists "Owners can view video clips" on public.video_clips;
create policy "Owner select" on public.video_clips for select using (
  exists (select 1 from public.projects p join public.workspaces w on w.id = p.workspace_id where p.id = video_clips.project_id and w.owner_id = auth.uid())
);

drop function if exists public.reserve_director_video_take(uuid, uuid, text, jsonb, uuid, jsonb);
drop function if exists public.reserve_director_video_take(uuid, text, text, jsonb, uuid, jsonb, uuid, uuid, text, text);
drop function if exists public.reserve_director_video_regeneration(uuid, uuid, text, jsonb, uuid, jsonb);
drop function if exists public.refresh_director_video_projection(uuid, uuid);

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

create or replace function public.reserve_director_video_take(p_project_id uuid, p_shot_id text, p_model text, p_target jsonb, p_idempotency_key uuid, p_input_snapshot jsonb default '{}'::jsonb, p_user_id uuid default null, p_workspace_id uuid default null, p_provider text default null, p_actor text default null, p_take_label text default null, p_override jsonb default '{}'::jsonb, p_canvas_position jsonb default null)
returns table(video_clip_id uuid, job_id uuid, take_number integer, replayed boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_clip public.video_clips%rowtype; v_job uuid; v_take integer; v_existing_model text; v_existing_snapshot jsonb; v_existing_target jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':' || p_shot_id, 0));
  if not exists (select 1 from public.shots where shot_id = p_shot_id and project_id = p_project_id) then raise exception 'shot does not belong to project'; end if;
  select gj.video_clip_id, gj.id, gj.model, gj.input_snapshot, gj.target
  into video_clip_id, job_id, v_existing_model, v_existing_snapshot, v_existing_target
  from public.generation_jobs gj
  where gj.project_id = p_project_id and gj.kind = 'shot_video' and gj.idempotency_key = p_idempotency_key
  limit 1;
  if found then
    if v_existing_target->>'retakeMode' is distinct from 'new_take'
       or v_existing_target->>'writerShotId' is distinct from p_shot_id
       or v_existing_snapshot is distinct from coalesce(p_input_snapshot, '{}'::jsonb) then
      raise exception 'idempotency mismatch';
    end if;
    select vc.take_number into take_number from public.video_clips vc where vc.id = video_clip_id;
    replayed := true;
    return next;
    return;
  end if;
  select coalesce(max(vc.take_number), 0) + 1 into v_take from public.video_clips vc where vc.project_id = p_project_id and vc.shot_id = p_shot_id;
  insert into public.video_clips(project_id, shot_id, take_number, status, last_attempt_status, last_attempt_at, updated_at, take_label, override, canvas_position) values (p_project_id, p_shot_id, v_take, 'pending', 'generating', now(), now(), p_take_label, p_override, p_canvas_position) returning * into v_clip;
  v_job := gen_random_uuid();
  insert into public.generation_jobs(id, project_id, request_id, model, kind, status, target, input_snapshot, video_clip_id, idempotency_key, user_id, workspace_id, provider, actor)
  values (v_job, p_project_id, 'reserved:' || v_job::text, p_model, 'shot_video', 'queued', coalesce(p_target, '{}'::jsonb) || jsonb_build_object('videoClipId', v_clip.id), coalesce(p_input_snapshot, '{}'::jsonb), v_clip.id, p_idempotency_key, p_user_id, p_workspace_id, coalesce(p_provider, 'fal'), coalesce(p_actor, 'ui'));
  video_clip_id := v_clip.id; job_id := v_job; take_number := v_take; replayed := false; return next;
end $$;

create or replace function public.reserve_director_video_regeneration(p_project_id uuid, p_video_clip_id uuid, p_model text, p_target jsonb, p_idempotency_key uuid, p_input_snapshot jsonb default '{}'::jsonb, p_user_id uuid default null, p_workspace_id uuid default null, p_provider text default null, p_actor text default null)
returns table(video_clip_id uuid, job_id uuid, take_number integer, replayed boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_clip public.video_clips%rowtype; v_job uuid; v_existing_model text; v_existing_snapshot jsonb; v_existing_target jsonb; v_shot_id text;
begin
  select shot_id into v_shot_id from public.video_clips where id = p_video_clip_id and project_id = p_project_id;
  if not found then raise exception 'live clip does not belong to project'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':' || v_shot_id, 0));

  select gj.video_clip_id, gj.id, gj.model, gj.input_snapshot, gj.target
  into video_clip_id, job_id, v_existing_model, v_existing_snapshot, v_existing_target
  from public.generation_jobs gj
  where gj.project_id = p_project_id and gj.kind = 'shot_video' and gj.idempotency_key = p_idempotency_key
  limit 1;
  if found then
    if video_clip_id is distinct from p_video_clip_id
       or v_existing_target->>'retakeMode' is distinct from 'regeneration'
       or v_existing_target->>'writerShotId' is distinct from (coalesce(p_target, '{}'::jsonb)->>'writerShotId')
       or v_existing_target->>'videoClipId' is distinct from p_video_clip_id::text
       or v_existing_snapshot is distinct from coalesce(p_input_snapshot, '{}'::jsonb) then
      raise exception 'idempotency mismatch';
    end if;
    select vc.take_number into take_number from public.video_clips vc where vc.id = video_clip_id;
    replayed := true;
    return next;
    return;
  end if;
  select * into v_clip from public.video_clips where id = p_video_clip_id and project_id = p_project_id and deleted_at is null for update;
  if not found then raise exception 'live clip does not belong to project'; end if;
  if exists (select 1 from public.generation_jobs gj where gj.video_clip_id = p_video_clip_id and gj.kind = 'shot_video' and gj.status = 'queued') then raise exception 'clip already has a queued attempt'; end if;
  v_job := gen_random_uuid();
  insert into public.generation_jobs(id, project_id, request_id, model, kind, status, target, input_snapshot, video_clip_id, idempotency_key, user_id, workspace_id, provider, actor)
  values (v_job, p_project_id, 'reserved:' || v_job::text, p_model, 'shot_video', 'queued', coalesce(p_target, '{}'::jsonb) || jsonb_build_object('videoClipId', p_video_clip_id), coalesce(p_input_snapshot, '{}'::jsonb), p_video_clip_id, p_idempotency_key, p_user_id, p_workspace_id, coalesce(p_provider, 'fal'), coalesce(p_actor, 'ui'));
  update public.video_clips set last_attempt_status = 'generating', last_attempt_error = null, last_attempt_at = now(), updated_at = now() where id = p_video_clip_id and deleted_at is null;
  video_clip_id := p_video_clip_id; job_id := v_job; take_number := v_clip.take_number; replayed := false; return next;
end $$;

create or replace function public.set_director_video_final(p_project_id uuid, p_video_clip_id uuid, p_final boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_shot_id text; v_clip public.video_clips%rowtype;
begin
  select shot_id into v_shot_id from public.video_clips where id = p_video_clip_id and project_id = p_project_id;
  if not found then raise exception 'live clip does not belong to project'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':' || v_shot_id, 0));
  select * into v_clip from public.video_clips
  where id = p_video_clip_id and project_id = p_project_id and deleted_at is null and (not p_final or (status = 'completed' and url is not null))
  for update;
  if not found then
    if p_final then raise exception 'live clip with URL does not belong to project'; end if;
    raise exception 'live clip does not belong to project';
  end if;
  if p_final then update public.video_clips set is_final = false, updated_at = now() where project_id = p_project_id and shot_id = v_clip.shot_id and deleted_at is null; end if;
  update public.video_clips set is_final = p_final, updated_at = now() where id = p_video_clip_id and deleted_at is null;
  perform public.refresh_director_video_projection(p_project_id, v_shot_id);
end $$;

create or replace function public.soft_delete_director_video_take(p_project_id uuid, p_video_clip_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_clip public.video_clips%rowtype; v_shot_id text;
begin
  select shot_id into v_shot_id from public.video_clips where id = p_video_clip_id and project_id = p_project_id;
  if not found then raise exception 'live clip does not belong to project'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':' || v_shot_id, 0));

  select * into v_clip from public.video_clips
  where id = p_video_clip_id and project_id = p_project_id and deleted_at is null
  for update;
  if not found then raise exception 'live clip does not belong to project'; end if;
  update public.generation_jobs
  set status = 'failed', error = 'cancelled by delete', last_error = 'cancelled by delete',
      completed_at = now(), updated_at = now()
  where project_id = p_project_id and video_clip_id = p_video_clip_id and kind = 'shot_video' and status = 'queued';
  update public.video_clips set deleted_at = now(), is_final = false, updated_at = now() where id = p_video_clip_id and deleted_at is null;
  perform public.refresh_director_video_projection(p_project_id, v_clip.shot_id);
end $$;
create or replace function public.complete_director_video_attempt(p_project_id uuid, p_job_id uuid, p_video_clip_id uuid, p_result_url text, p_storage_path text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_job public.generation_jobs%rowtype; v_clip public.video_clips%rowtype; v_shot_id text;
begin
  select shot_id into v_shot_id from public.video_clips where id = p_video_clip_id and project_id = p_project_id;
  if not found then raise exception 'linked shot_video clip does not belong to project'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':' || v_shot_id, 0));

  select * into v_clip from public.video_clips
  where id = p_video_clip_id and project_id = p_project_id and deleted_at is null
  for update;
  if not found then raise exception 'linked shot_video clip does not belong to project'; end if;

  select * into v_job from public.generation_jobs
  where id = p_job_id and project_id = p_project_id and kind = 'shot_video' and video_clip_id = p_video_clip_id
  for update;
  if not found then raise exception 'linked shot_video job does not belong to project'; end if;

  if v_job.status = 'completed' then return; end if;
  if v_job.status <> 'queued' then raise exception 'linked shot_video job is not queued'; end if;

  update public.generation_jobs
  set status = 'completed', result_url = p_result_url, error = null, completed_at = now(), updated_at = now()
  where id = p_job_id and status = 'queued';

  update public.video_clips
  set url = p_result_url, storage_path = p_storage_path, status = 'completed',
      last_attempt_status = 'completed', last_attempt_error = null, last_attempt_at = now(), updated_at = now()
  where id = p_video_clip_id and deleted_at is null;

  perform public.refresh_director_video_projection(p_project_id, v_clip.shot_id);
end $$;

create or replace function public.fail_director_video_attempt(p_project_id uuid, p_job_id uuid, p_error text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_job public.generation_jobs%rowtype; v_clip public.video_clips%rowtype; v_error text; v_shot_id text;
begin
  select * into v_job from public.generation_jobs
  where id = p_job_id and project_id = p_project_id and kind = 'shot_video';
  if not found then raise exception 'shot_video job does not belong to project'; end if;
  if v_job.video_clip_id is null or v_job.status <> 'queued' then return; end if;

  select shot_id into v_shot_id from public.video_clips where id = v_job.video_clip_id and project_id = p_project_id;
  if not found then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':' || v_shot_id, 0));

  select * into v_clip from public.video_clips
  where id = v_job.video_clip_id and project_id = p_project_id and deleted_at is null
  for update;
  if not found then return; end if;

  select * into v_job from public.generation_jobs
  where id = p_job_id and project_id = p_project_id and kind = 'shot_video' and video_clip_id = v_clip.id
  for update;
  if not found or v_job.status <> 'queued' then return; end if;
  v_error := left(coalesce(p_error, ''), 1000);

  update public.generation_jobs
  set status = 'failed', error = v_error, last_error = v_error, completed_at = now(), updated_at = now()
  where id = p_job_id and status = 'queued';

  update public.video_clips
  set last_attempt_status = 'failed', last_attempt_error = v_error, last_attempt_at = now(), updated_at = now(),
      status = case when url is null then 'failed' else status end
  where id = v_clip.id and deleted_at is null;
end $$;


revoke all on function public.reserve_director_video_take(uuid, text, text, jsonb, uuid, jsonb, uuid, uuid, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.reserve_director_video_regeneration(uuid, uuid, text, jsonb, uuid, jsonb, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.refresh_director_video_projection(uuid, text) from public, anon, authenticated;
revoke all on function public.set_director_video_final(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.soft_delete_director_video_take(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_director_video_attempt(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.fail_director_video_attempt(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_director_video_take(uuid, text, text, jsonb, uuid, jsonb, uuid, uuid, text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.reserve_director_video_regeneration(uuid, uuid, text, jsonb, uuid, jsonb, uuid, uuid, text, text) to service_role;
grant execute on function public.refresh_director_video_projection(uuid, text) to service_role;
grant execute on function public.set_director_video_final(uuid, uuid, boolean) to service_role;
grant execute on function public.soft_delete_director_video_take(uuid, uuid) to service_role;
grant execute on function public.complete_director_video_attempt(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.fail_director_video_attempt(uuid, uuid, text) to service_role;

commit;
