-- #batch-resume (2026-09-09): 처음 고정한 목록·준비된 입력을 서버에 남기고, 중단 후에도
--   같은 요청키로만 이어간다 — 다른 키로 재제출하지 않는다.
--
-- 20260909100000 은 generation_jobs 에 batch_id/batch_total 두 칸만 더해 "몇 개 만들기로 했나"만
--   남겼다. 이 마이그레이션은 그 위에 "무엇을 어떤 순서·어떤 준비된 입력으로 만들기로 했나"를
--   저장하는 두 표와, 서버가 안전하게 이어가는 데 필요한 세 함수를 더한다:
--     director_video_batches       묶음 자체 — 소유자·상태·중단 사유·이어가기 임대(lease).
--     director_video_batch_items   묶음의 각 항목 — id 자체가 그 샷의 고정 요청키(idempotencyKey).
--     create_director_video_batch  처음 요청 시 목록·준비된 입력을 원자적으로 고정한다.
--     claim_director_video_batch   서버 워커가 이어가기 전에 5분 임대를 원자적으로 받는다
--                                   (겹친 이어가기 시도 중 하나만 실제로 낸다).
--     reserve_director_video_batch_item
--                                   항목 하나를 실제로 예약한다 — 배치 상태·임대·소유권을 검사한
--                                   뒤 기존 reserve_director_video_take 를 그대로 호출해 잡을 만들고,
--                                   그 잡에 batch_id/batch_total 을, 항목에 job_id 를 같은 트랜잭션에
--                                   남긴다. 취소된 묶음은 새 잡을 만들지 않고, 같은 항목 재요청은
--                                   reserve_director_video_take 자신의 재생(replay) 판정이 그대로
--                                   먹는다 — 이 함수는 새 판정 로직을 만들지 않는다.
--
-- prepared 는 준비 서비스가 정하는 불투명 JSON 이다 — 이 DB 는 object 인지만 본다.
--
-- 적용: supabase db query --linked 로 문장 개별 실행 (db push 막힘 — 20260813010000 주석 참조).
begin;

-- ── 표 ──────────────────────────────────────────────────────────────────

create table public.director_video_batches (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status text not null default 'running',
  stop_reason text,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint director_video_batches_status_valid
    check (status in ('running', 'cancelled', 'completed', 'paused'))
);
create index director_video_batches_project_idx on public.director_video_batches (project_id);

create table public.director_video_batch_items (
  -- id 자체가 그 샷의 고정 요청키(item.id = idempotencyKey) — 프로세스가 죽어도 다른 키로
  --   재제출하지 않는다는 계약을 컬럼 하나로 표현한다.
  id uuid primary key,
  batch_id uuid not null references public.director_video_batches(id) on delete cascade,
  shot_id text not null,
  "position" integer not null,
  -- 준비된 입력 — 별도 서비스가 구조를 정한다. 이 DB 는 object 인지만 본다(#batch-resume 계약).
  --   이 컬럼은 항목 생성 이후 불변이다 — 아래 submission_response 만 제출 결과를 담는다.
  prepared jsonb not null,
  -- 공유 제출 함수(attach_director_video_provider_request 계열)가 남기는 provider 응답 원문
  --   증표(#batch-resume 이어가기용). 제출 실패 복구를 위해서만 쓴다 — 이 DB 는 object 인지만
  --   본다. null = 아직 제출 시도 없음(또는 아직 provider 응답을 못 받음).
  submission_response jsonb,
  job_id uuid references public.generation_jobs(id) on delete set null,
  status text not null default 'pending',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint director_video_batch_items_status_valid
    check (status in ('pending', 'submitted', 'failed', 'skipped')),
  constraint director_video_batch_items_prepared_object
    check (jsonb_typeof(prepared) = 'object'),
  constraint director_video_batch_items_submission_response_object
    check (submission_response is null or jsonb_typeof(submission_response) = 'object'),
  -- 한 묶음 안에서 같은 샷을 두 항목으로 중복 요청하지 못하게 한다.
  constraint director_video_batch_items_batch_shot_unique unique (batch_id, shot_id)
);
create index director_video_batch_items_batch_idx on public.director_video_batch_items (batch_id, "position");
create index director_video_batch_items_job_idx on public.director_video_batch_items (job_id) where job_id is not null;

-- 소유자 SELECT만 브라우저에 연다 — 쓰기·함수 실행은 전부 service_role 전용(director_video_takes 와
--   같은 소유권 체인 정책, 20260811120000 규약).
alter table public.director_video_batches enable row level security;
alter table public.director_video_batch_items enable row level security;

create policy "Owner select" on public.director_video_batches for select using (
  exists (
    select 1 from public.projects p
    join public.workspaces w on w.id = p.workspace_id
    where p.id = director_video_batches.project_id and w.owner_id = auth.uid()
  )
);
create policy "Owner select" on public.director_video_batch_items for select using (
  exists (
    select 1 from public.director_video_batches b
    join public.projects p on p.id = b.project_id
    join public.workspaces w on w.id = p.workspace_id
    where b.id = director_video_batch_items.batch_id and w.owner_id = auth.uid()
  )
);
revoke all on public.director_video_batches, public.director_video_batch_items from public, anon, authenticated;
grant select on public.director_video_batches, public.director_video_batch_items to authenticated;
grant all on public.director_video_batches, public.director_video_batch_items to service_role;

-- ── create_director_video_batch ────────────────────────────────────────
--
-- 처음 요청한 목록·준비된 입력을 원자적으로 고정한다. p_items = [{id, shot_id, prepared}].
--   같은 p_batch_id 로 재호출되면(같은 주인·프로젝트일 때만) 새로 만들지 않고 같은 id 를
--   그대로 돌려준다 — 제출 재시도가 두 번째 묶음을 만들지 않는다.
create or replace function public.create_director_video_batch(
  p_batch_id uuid,
  p_project_id uuid,
  p_user_id uuid,
  p_items jsonb
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_workspace_id uuid;
  v_owner_id uuid;
  v_existing public.director_video_batches%rowtype;
  v_item jsonb;
  v_count integer;
  v_distinct_ids integer;
  v_distinct_shots integer;
  v_item_id uuid;
  v_shot_id text;
  v_prepared jsonb;
begin
  if p_batch_id is null then raise exception 'batch id is required'; end if;
  if p_project_id is null then raise exception 'project id is required'; end if;
  if p_user_id is null then raise exception 'user id is required'; end if;

  -- 같은 batch id 로 겹쳐 들어온 생성 요청을 직렬화한다(재시도 이중 생성 방지).
  perform pg_advisory_xact_lock(hashtextextended('director-video-batch:create:' || p_batch_id::text, 0));

  select * into v_existing from public.director_video_batches where id = p_batch_id;
  if found then
    if v_existing.project_id is distinct from p_project_id or v_existing.user_id is distinct from p_user_id then
      raise exception 'batch id already used by a different project or user';
    end if;
    return v_existing.id;
  end if;

  select workspace_id into v_workspace_id from public.projects where id = p_project_id;
  if not found then raise exception 'project does not exist'; end if;
  select owner_id into v_owner_id from public.workspaces where id = v_workspace_id;
  if not found or v_owner_id is distinct from p_user_id then
    raise exception 'user does not own the batch project workspace';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'batch items must be a JSON array';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 100 then
    raise exception 'batch must contain between 1 and 100 items';
  end if;

  select count(distinct elem->>'id'), count(distinct elem->>'shot_id')
    into v_distinct_ids, v_distinct_shots
    from jsonb_array_elements(p_items) as elem;
  if v_distinct_ids <> v_count then raise exception 'batch items must have unique id'; end if;
  if v_distinct_shots <> v_count then raise exception 'batch items must have unique shot_id'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'each batch item must be a JSON object'; end if;
    if nullif(v_item->>'id', '') is null then raise exception 'each batch item requires an id'; end if;
    begin
      v_item_id := (v_item->>'id')::uuid;
    exception when others then
      raise exception 'each batch item id must be a UUID';
    end;
    v_shot_id := nullif(v_item->>'shot_id', '');
    if v_shot_id is null then raise exception 'each batch item requires shot_id'; end if;
    v_prepared := v_item->'prepared';
    if jsonb_typeof(v_prepared) is distinct from 'object' then
      raise exception 'batch item prepared input must be a JSON object';
    end if;
    if not exists (select 1 from public.shots where project_id = p_project_id and shot_id = v_shot_id) then
      raise exception 'batch item shot does not belong to project';
    end if;
  end loop;

  insert into public.director_video_batches (id, project_id, user_id, workspace_id, status, created_at, updated_at)
  values (p_batch_id, p_project_id, p_user_id, v_workspace_id, 'running', now(), now());

  insert into public.director_video_batch_items (id, batch_id, shot_id, "position", prepared, status)
  select
    (elem->>'id')::uuid,
    p_batch_id,
    elem->>'shot_id',
    (ord - 1)::integer,
    elem->'prepared',
    'pending'
  from jsonb_array_elements(p_items) with ordinality as t(elem, ord);

  return p_batch_id;
end $$;

revoke all on function public.create_director_video_batch(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_director_video_batch(uuid, uuid, uuid, jsonb) to service_role;

-- ── claim_director_video_batch ─────────────────────────────────────────
--
-- 조건부 UPDATE 하나로 원자적 임대를 준다: active(status='running')이며 lease 가 없거나 만료된
--   행만 5분 임대한다. 겹친 claim 은 먼저 커밋한 쪽만 행을 받고, 뒤에 커밋한 쪽은 그 사이 이미
--   갱신된 lease_expires_at 때문에 WHERE 재평가에서 0행을 받는다 — 별도 advisory lock 없이도
--   UPDATE 자체의 행 잠금으로 배타가 성립한다.
create or replace function public.claim_director_video_batch(
  p_batch_id uuid,
  p_token uuid
) returns setof public.director_video_batches
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_batch_id is null then raise exception 'batch id is required'; end if;
  if p_token is null then raise exception 'lease token is required'; end if;

  return query
    update public.director_video_batches
    set lease_token = p_token,
        lease_expires_at = now() + interval '5 minutes',
        updated_at = now()
    where id = p_batch_id
      and status = 'running'
      and (lease_token is null or lease_expires_at is null or lease_expires_at <= now())
    returning *;
end $$;

revoke all on function public.claim_director_video_batch(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_director_video_batch(uuid, uuid) to service_role;

-- ── reserve_director_video_batch_item ──────────────────────────────────
--
-- 항목 하나를 실제로 예약한다. 배치 행을 FOR UPDATE 로 잠가 취소·임대·소유권을 확인한 뒤,
--   p_args(camelCase, reserveDirectorVideoTake 와 동일 필드)를 배치·항목의 고정 값과 대조하고
--   기존 reserve_director_video_take(13 인자)를 그대로 호출한다 — 재생(replay) 판정은 그 함수
--   자신의 멱등 로직에 맡긴다(같은 요청키 재호출은 같은 잡을 그대로 돌려준다).
--
-- 새 유료 작업을 막는 경계(오너 확정, #batch-resume):
--   · 배치가 running 이 아니면(취소·완료·정지) 예외 — 새 잡을 만들지 않는다.
--   · 이미 제출된 항목(status='submitted')의 재요청은 이 경계 검사 없이 바로 재생 판정으로
--     간다 — 그 사이 다른 큐가 생겨도 "내가 이미 낸 잡"의 정상 조회를 막지 않는다.
--   · 아직 제출 전(status='pending')인 항목만 아래 두 조건을 검사한다:
--     - 같은 샷에 이미 도는(queued) shot_video 시도가 있으면 'batch_shot_busy' — 호출자는 대기.
--     - 같은 샷에 재생 가능한 완성 영상(status=completed, url 있음, 안 지워짐)이 있으면
--       'batch_shot_already_completed' — 호출자는 건너뛴다.
--   · 유저 단위 동시 상한(MAX_QUEUED_VIDEO_JOBS_PER_USER=3, generation-quota.ts 와 동일 값)을
--     advisory lock 으로 직렬화해 세고, queued shot_video/shot_previz_video 합이 3 이상이면
--     'batch_user_at_capacity' — 호출자가 429 로 구분해 안내한다.
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
    --   advisory lock 으로 count-then-submit 경쟁을 직렬화한다(gen-quota-atomic-gate 와 같은 패턴).
    perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':batch-video-capacity', 0));
    select count(*) into v_queued_count
    from public.generation_jobs
    where user_id = v_user_id
      and kind in ('shot_video', 'shot_previz_video')
      and status = 'queued';
    if v_queued_count >= 3 then
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

commit;
