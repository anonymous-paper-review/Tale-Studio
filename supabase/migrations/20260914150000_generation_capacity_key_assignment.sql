-- 예약 행의 fal 키를 DB가 원자적으로 확정한다.
--
-- 20260914110000 은 이미 dev 에 적용되어 있으므로 그 파일은 고치지 않는다. 이 후속 파일은
-- 같은 트리거 함수만 교체한다:
--   · fal + fal_key_id null: 여유(max_inflight - 최근 30분 queued)가 가장 큰 키를 기록한다.
--   · fal + 알려진 키가 가득 참: 다른 여유 키로 재배정한다.
--   · fal + 설정표가 비었거나 명시 키가 없음: 추측하지 않고 명시 오류로 거절한다.
-- local 은 fal 키를 배정·검사하지 않는다. 개인/전체 축의 기존 정책은 유지한다.
begin;

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

  -- 개인 축 — 관리자(운영·QA)는 면제. 명단 동기화는 서버가 한다(generation_capacity_exempt_users).
  if not exists (select 1 from public.generation_capacity_exempt_users where user_id = v_effective_user) then
    v_video := new.kind in ('shot_video', 'shot_previz_video');
    if v_video then
      select count(*) into v_count
      from public.generation_jobs
      where user_id = v_effective_user and status = 'queued'
        and kind in ('shot_video', 'shot_previz_video')
        and created_at >= v_cutoff;
      -- 3/6 의 근거는 generation-quota.ts 의 MAX_QUEUED_*_JOBS_PER_USER 주석(2026-08-26 오너 결정).
      if v_count >= 3 then
        raise exception 'video_user_at_capacity' using detail = v_count::text;
      end if;
    else
      select count(*) into v_count
      from public.generation_jobs
      where user_id = v_effective_user and status = 'queued'
        and kind not in ('shot_video', 'shot_previz_video')
        and created_at >= v_cutoff;
      if v_count >= 6 then
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

notify pgrst, 'reload schema';
commit;
