-- 시연 계정의 동시 생성 상한 10(2026-10-27 오너: "시연 계정은 동시 생성 제한 10개로 늘려줘").
--
-- generation_capacity_exempt_users 에 per_user_limit 칸을 더한다:
--   · 비어 있음 = 개인 상한 면제(관리자 — 지금 동작 그대로. 옛 서버가 쓴 행도 이 뜻이다)
--   · 숫자 = 그 사용자의 개인 상한(영상 · 그림 각각). 서버가 할당량 면제 시연 계정에 10을 적는다.
-- 바꾸는 곳은 두 함수의 개인 상한 숫자뿐이다(본문은 20260914150000 · 20260909110000 그대로 옮김):
--   · enforce_generation_capacity — 생성 예약 트리거의 개인 축(영상 3 · 그림 6 → 표의 한도가 있으면 그 값)
--   · reserve_director_video_batch_item — 영상 일괄 예약의 개인 상한(3 → 표의 한도가 있으면 그 값)
-- fal 계정 축 · 전체 축은 그대로다 — 시연 계정도 받는다.
-- 배포 순서: 이 마이그레이션(옛 서버와 함께 돌아도 지금 동작) → 서버 코드(칸에 한도를 적는다).
begin;

alter table public.generation_capacity_exempt_users
  add column if not exists per_user_limit integer
  check (per_user_limit is null or per_user_limit > 0);

create or replace function public.enforce_generation_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- 좀비(webhook 유실로 영원히 queued 인 행)가 자리를 영구 점유하지 않도록 서버와 같은 신선도 컷을 쓴다.
  v_cutoff timestamptz := now() - interval '30 minutes';
  v_video boolean;
  v_count integer;
  v_limit integer;
  v_total integer;
  v_key text;
  v_effective_user uuid;
  v_project_workspace uuid;
  v_workspace uuid;
  v_listed boolean;
  v_user_limit integer;
begin
  if new.status <> 'queued' then
    return new;
  end if;
  v_effective_user := new.user_id;

  -- 일반 예약 헬퍼와 같은 소유권 체인(project → workspace.owner)을 따른다. user_id 를
  -- 생략한 옛 RPC도 개인 축을 우회하지 않도록, 해석한 소유자를 행에도 기록한다.
  if v_effective_user is null then
    if new.project_id is not null then
      select p.workspace_id into v_project_workspace
      from public.projects p
      where p.id = new.project_id;
    end if;
    v_workspace := coalesce(new.workspace_id, v_project_workspace);
    if v_workspace is null
       or (v_project_workspace is not null and v_workspace is distinct from v_project_workspace) then
      raise exception 'generation_owner_unresolved';
    end if;
    select w.owner_id into v_effective_user
    from public.workspaces w
    where w.id = v_workspace;
    if v_effective_user is null then
      raise exception 'generation_owner_unresolved';
    end if;
    new.workspace_id := v_workspace;
    new.user_id := v_effective_user;
  end if;

  -- 축마다 따로 잠그면 요청마다 순서가 달라져 교착이 난다. 자리 확보 전체를 하나로 직렬화한다.
  perform pg_advisory_xact_lock(hashtextextended('generation-capacity', 0));

  -- 개인 축 — 기본 영상 3 · 그림 6. generation_capacity_exempt_users 에 있는 사용자는 그 행의 per_user_limit 을
  --   영상 · 그림 각각의 상한으로 쓰고(시연 계정 10, 2026-10-27 오너), 칸이 비면 면제다(관리자 — 운영·QA).
  --   명단 동기화는 서버가 한다(generation-quota.ts syncGenerationCapacityExemption).
  select true, e.per_user_limit into v_listed, v_user_limit
  from public.generation_capacity_exempt_users e
  where e.user_id = v_effective_user;
  if not coalesce(v_listed, false) or v_user_limit is not null then
    v_video := new.kind in ('shot_video', 'shot_previz_video');
    if v_video then
      select count(*) into v_count
      from public.generation_jobs
      where user_id = v_effective_user and status = 'queued'
        and kind in ('shot_video', 'shot_previz_video')
        and created_at >= v_cutoff;
      -- 3/6 의 근거는 generation-quota.ts 의 MAX_QUEUED_*_JOBS_PER_USER 주석(2026-08-26 오너 결정).
      if v_count >= coalesce(v_user_limit, 3) then
        raise exception 'video_user_at_capacity' using detail = v_count::text;
      end if;
    else
      select count(*) into v_count
      from public.generation_jobs
      where user_id = v_effective_user and status = 'queued'
        and kind not in ('shot_video', 'shot_previz_video')
        and created_at >= v_cutoff;
      if v_count >= coalesce(v_user_limit, 6) then
        raise exception 'image_user_at_capacity' using detail = v_count::text;
      end if;
    end if;
  end if;

  -- fal 계정 축 — local 작업은 fal 키를 갖지 않으므로 이 축을 적용하지 않는다.
  if new.provider = 'fal' then
    if new.fal_key_id is null then
      if not exists (select 1 from public.fal_key_limits) then
        raise exception 'fal_key_unavailable';
      end if;

      -- 키를 생략한 예약은 여유가 가장 큰 키를 고른다. 전체 용량 잠금 아래의 한 쿼리라서
      -- 동시 예약 사이에 같은 슬롯을 중복으로 배정하지 않는다.
      select l.key_id, l.max_inflight, count(j.id)::integer
        into v_key, v_limit, v_count
      from public.fal_key_limits l
      left join public.generation_jobs j
        on j.fal_key_id = l.key_id
       and j.status = 'queued'
       and j.created_at >= v_cutoff
      group by l.key_id, l.max_inflight
      having count(j.id) < l.max_inflight
      order by (l.max_inflight - count(j.id)) desc, l.key_id
      limit 1;

      if v_key is null then
        -- null 키도 모든 계정이 찬 경우에는 기존 key_at_capacity 어휘를 유지한다.
        select l.key_id, l.max_inflight, count(j.id)::integer
          into v_key, v_limit, v_count
        from public.fal_key_limits l
        left join public.generation_jobs j
          on j.fal_key_id = l.key_id
         and j.status = 'queued'
         and j.created_at >= v_cutoff
        group by l.key_id, l.max_inflight
        order by (l.max_inflight - count(j.id)) asc, l.key_id
        limit 1;
        raise exception 'key_at_capacity' using detail = v_count::text || '/' || v_limit::text;
      end if;
      new.fal_key_id := v_key;
    else
      -- 명시 키는 표에 없으면 상한을 알 수 없으므로 fail closed 한다.
      select max_inflight into v_limit
      from public.fal_key_limits
      where key_id = new.fal_key_id;
      if not found or v_limit is null then
        raise exception 'fal_key_unknown';
      end if;

      select count(*) into v_count
      from public.generation_jobs
      where fal_key_id = new.fal_key_id and status = 'queued' and created_at >= v_cutoff;
      if v_count >= v_limit then
        -- 여유(max_inflight − 최근 30분 queued)가 가장 큰 다른 계정으로 바꿔 넣는다.
        select l.key_id
          into v_key
        from public.fal_key_limits l
        left join public.generation_jobs j
          on j.fal_key_id = l.key_id
         and j.status = 'queued'
         and j.created_at >= v_cutoff
        where l.key_id <> new.fal_key_id
        group by l.key_id, l.max_inflight
        having count(j.id) < l.max_inflight
        order by (l.max_inflight - count(j.id)) desc, l.key_id
        limit 1;
        if v_key is null then
          raise exception 'key_at_capacity' using detail = v_count::text || '/' || v_limit::text;
        end if;
        new.fal_key_id := v_key;
      end if;
    end if;
  end if;

  -- 전체 축 — 계정 슬롯 합계는 물리 한도다. 관리자도 받는다(면제 대상이 아니다).
  select coalesce(sum(max_inflight), 0) into v_total from public.fal_key_limits;
  if v_total > 0 then
    select count(*) into v_count
    from public.generation_jobs
    where status = 'queued' and created_at >= v_cutoff;
    if v_count >= v_total then
      raise exception 'global_at_capacity' using detail = v_count::text || '/' || v_total::text;
    end if;
  end if;

  return new;
end;
$$;
revoke all on function public.enforce_generation_capacity() from public, anon, authenticated;
grant execute on function public.enforce_generation_capacity() to service_role;

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

revoke all on function public.reserve_director_video_batch_item(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_director_video_batch_item(uuid, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
