-- 러프는 외부 접수 전에 샷을 원자적으로 선점한다. 새 표·열·시간 상한은 추가하지 않는다.
begin;

create or replace function public.reserve_rough_storyboard_grid(
  p_project_id uuid,
  p_workspace_id uuid,
  p_user_id uuid,
  p_shot_ids text[],
  p_grid_variant text,
  p_model text,
  p_input_snapshot jsonb,
  p_force boolean default false
)
returns table(job_id uuid, shot_ids text[], state text, confirmation_pending boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace uuid;
  v_owner uuid;
  v_job uuid;
  v_existing record;
  v_overlap text[];
  v_existing_found boolean := false;
  v_completed text[];
  v_count integer;
begin
  if p_user_id is null or p_shot_ids is null or cardinality(p_shot_ids) = 0
    or cardinality(p_shot_ids) > 4 or p_grid_variant is null or p_grid_variant not in ('grid4', 'strip1')
    or (p_grid_variant = 'strip1' and cardinality(p_shot_ids) <> 1)
    or p_model is null or btrim(p_model) = ''
    or jsonb_typeof(p_input_snapshot) is distinct from 'object'
    or coalesce(p_input_snapshot->>'prompt', '') = '' then
    raise exception 'invalid rough reservation input';
  end if;
  select p.workspace_id, w.owner_id into v_workspace, v_owner
    from public.projects p join public.workspaces w on w.id = p.workspace_id
    where p.id = p_project_id;
  if not found or v_workspace is distinct from p_workspace_id or v_owner is distinct from p_user_id then
    raise exception 'rough reservation project access denied';
  end if;

  -- 같은 프로젝트의 겹치는 그리드도 직렬화한다. 서로 다른 씬/라운드의 부분 겹침을 놓치지 않는다.
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':rough-reservation', 0));
  select count(*) into v_count from public.shots s
    where s.project_id = p_project_id and s.shot_id = any(p_shot_ids)
      and btrim(coalesce(s.action_description, '')) <> '';
  if v_count <> cardinality(p_shot_ids) then raise exception 'rough shots do not belong to project or have no story'; end if;

  -- 시간만으로 예약을 무시하지 않는다. 접수 응답이 유실된 작업도 이 선점의 소유자다.
  for v_existing in
    select gj.id, gj.target, gj.request_id from public.generation_jobs gj
    where gj.project_id = p_project_id and gj.kind = 'shot_rough_storyboard' and gj.status = 'queued'
      and ((gj.target->'writerShotIds') ?| p_shot_ids or gj.target->>'writerShotId' = any(p_shot_ids))
    order by gj.created_at, gj.id
  loop
    select array_agg(requested.id) into v_overlap
      from unnest(p_shot_ids) as requested(id)
      where (v_existing.target->'writerShotIds') ? requested.id or v_existing.target->>'writerShotId' = requested.id;
    job_id := v_existing.id; shot_ids := v_overlap; state := 'existing';
    confirmation_pending := v_existing.request_id like 'reserved:%'; return next;
    v_existing_found := true;
  end loop;
  if v_existing_found then return; end if;

  -- 처음의 후보 조회 뒤 다른 요청이 완료했을 수 있다. 자동 채움은 완료 이미지를 덮지 않는다.
  if not coalesce(p_force, false) then
    select array_agg(s.shot_id) into v_completed from public.shots s
      where s.project_id = p_project_id and s.shot_id = any(p_shot_ids) and s.rough_storyboard is not null;
    if cardinality(v_completed) > 0 then
      job_id := null; shot_ids := v_completed; state := 'exists'; confirmation_pending := false; return next; return;
    end if;
  end if;

  v_job := gen_random_uuid();
  insert into public.generation_jobs(id, project_id, request_id, model, kind, status, target, input_snapshot,
    user_id, workspace_id, provider, actor, attempts)
  values(v_job, p_project_id, 'reserved:' || v_job::text, p_model, 'shot_rough_storyboard', 'queued',
    jsonb_build_object('workspaceId', v_workspace, 'writerShotIds', to_jsonb(p_shot_ids), 'gridVariant', p_grid_variant),
    p_input_snapshot || jsonb_build_object('rough_submit_state', 'reserved'), p_user_id, v_workspace, 'fal', 'ui', 0);
  job_id := v_job; shot_ids := p_shot_ids; state := 'reserved'; confirmation_pending := false; return next;
end;
$$;

revoke all on function public.reserve_rough_storyboard_grid(uuid, uuid, uuid, text[], text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.reserve_rough_storyboard_grid(uuid, uuid, uuid, text[], text, text, jsonb, boolean) to service_role;
commit;
