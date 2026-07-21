begin;

alter table public.video_clips add column if not exists last_attempt_job_id uuid;

-- Existing linked attempts predate this projection; choose the newest reservation deterministically.
update public.video_clips vc
set last_attempt_job_id = (
  select gj.id
  from public.generation_jobs gj
  where gj.video_clip_id = vc.id
    and gj.project_id = vc.project_id
    and gj.kind = 'shot_video'
  order by gj.created_at desc, gj.id desc
  limit 1
)
where vc.last_attempt_job_id is null
  and exists (
    select 1
    from public.generation_jobs gj
    where gj.video_clip_id = vc.id
      and gj.project_id = vc.project_id
      and gj.kind = 'shot_video'
  );

create index if not exists video_clips_last_attempt_job_id_idx
  on public.video_clips(last_attempt_job_id);
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'video_clips_last_attempt_job_fkey'
      and conrelid = 'public.video_clips'::regclass
  ) then
    alter table public.video_clips
      add constraint video_clips_last_attempt_job_fkey
      foreign key (last_attempt_job_id) references public.generation_jobs(id)
      on delete set null not valid;
  end if;
end $$;
alter table public.video_clips validate constraint video_clips_last_attempt_job_fkey;

-- All linked shot-video inserts, including reservations made outside these RPCs, update the
-- canonical latest-attempt identity in their transaction.
create or replace function public.set_director_video_last_attempt_job_id()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.kind = 'shot_video' and new.video_clip_id is not null then
    update public.video_clips
    set last_attempt_job_id = new.id, updated_at = now()
    where id = new.video_clip_id and project_id = new.project_id;
  end if;
  return new;
end $$;
drop trigger if exists director_video_last_attempt_job_id on public.generation_jobs;
create trigger director_video_last_attempt_job_id
after insert on public.generation_jobs
for each row execute function public.set_director_video_last_attempt_job_id();

create or replace function public.reserve_director_video_take(p_project_id uuid, p_shot_id text, p_model text, p_target jsonb, p_idempotency_key uuid, p_input_snapshot jsonb default '{}'::jsonb, p_user_id uuid default null, p_workspace_id uuid default null, p_provider text default null, p_actor text default null, p_take_label text default null, p_override jsonb default '{}'::jsonb, p_canvas_position jsonb default null)
returns table(video_clip_id uuid, job_id uuid, take_number integer, replayed boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_clip public.video_clips%rowtype; v_job uuid; v_take integer; v_existing_snapshot jsonb; v_existing_target jsonb; v_snapshot jsonb; v_workspace_id uuid;
begin
  if nullif(btrim(p_model), '') is null then raise exception 'requested model must be nonblank'; end if;
  if p_idempotency_key is null then raise exception 'idempotency key is required'; end if;
  if p_input_snapshot is not null and jsonb_typeof(p_input_snapshot) <> 'object' then raise exception 'input snapshot must be a JSON object'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':' || p_shot_id, 0));
  select p.workspace_id into v_workspace_id from public.projects p join public.shots s on s.project_id = p.id where p.id = p_project_id and s.shot_id = p_shot_id;
  if not found then raise exception 'shot does not belong to project'; end if;
  if p_workspace_id is not null and p_workspace_id is distinct from v_workspace_id then raise exception 'workspace does not match project'; end if;
  if coalesce(p_target, '{}'::jsonb)->>'retakeMode' is distinct from 'new_take' or coalesce(p_target, '{}'::jsonb)->>'writerShotId' is distinct from p_shot_id or coalesce(p_target, '{}'::jsonb)->>'workspaceId' is distinct from v_workspace_id::text then raise exception 'new take target does not match project shot'; end if;
  v_snapshot := case when jsonb_typeof(coalesce(p_input_snapshot, '{}'::jsonb)) = 'object' then coalesce(p_input_snapshot, '{}'::jsonb) else '{}'::jsonb end || jsonb_build_object('requestedModel', p_model);
  select gj.video_clip_id, gj.id, gj.input_snapshot, gj.target into video_clip_id, job_id, v_existing_snapshot, v_existing_target from public.generation_jobs gj where gj.project_id = p_project_id and gj.kind = 'shot_video' and gj.idempotency_key = p_idempotency_key limit 1;
  if found then
    if v_existing_target->>'retakeMode' is distinct from 'new_take' or v_existing_target->>'writerShotId' is distinct from p_shot_id or v_existing_snapshot is distinct from v_snapshot or v_existing_snapshot->>'requestedModel' is distinct from p_model then raise exception 'idempotency mismatch'; end if;
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
  if p_input_snapshot is not null and jsonb_typeof(p_input_snapshot) <> 'object' then raise exception 'input snapshot must be a JSON object'; end if;
  select vc.shot_id, p.workspace_id into v_shot_id, v_workspace_id from public.video_clips vc join public.projects p on p.id = vc.project_id where vc.id = p_video_clip_id and vc.project_id = p_project_id;
  if not found then raise exception 'live clip does not belong to project'; end if;
  if p_workspace_id is not null and p_workspace_id is distinct from v_workspace_id then raise exception 'workspace does not match project'; end if;
  if coalesce(p_target, '{}'::jsonb)->>'retakeMode' is distinct from 'regeneration' or coalesce(p_target, '{}'::jsonb)->>'writerShotId' is distinct from v_shot_id or coalesce(p_target, '{}'::jsonb)->>'videoClipId' is distinct from p_video_clip_id::text or coalesce(p_target, '{}'::jsonb)->>'workspaceId' is distinct from v_workspace_id::text then raise exception 'regeneration target does not match project clip'; end if;
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

revoke all on function public.set_director_video_last_attempt_job_id() from public, anon, authenticated;
revoke all on function public.reserve_director_video_take(uuid, text, text, jsonb, uuid, jsonb, uuid, uuid, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.reserve_director_video_regeneration(uuid, uuid, text, jsonb, uuid, jsonb, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.reserve_director_video_take(uuid, text, text, jsonb, uuid, jsonb, uuid, uuid, text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.reserve_director_video_regeneration(uuid, uuid, text, jsonb, uuid, jsonb, uuid, uuid, text, text) to service_role;

commit;
