-- 같은 샷의 실사 이미지는 개별/일괄/다른 탭에서 동시에 요청해도 한 작업만 접수한다.
-- 기존 queued 행은 그대로 보존한다. 완료·실패·취소된 작업 이후에는 다시 생성할 수 있다.
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

-- 같은 요청은 용량이 가득 찼어도 기존 작업을 돌려주도록 용량 검사보다 먼저 실행한다.
create trigger generation_jobs_0_storyboard_singleflight
before insert or update of status, kind, target on public.generation_jobs
for each row execute function public.guard_storyboard_singleflight();

revoke all on function public.guard_storyboard_singleflight() from public, anon, authenticated;
grant execute on function public.guard_storyboard_singleflight() to service_role;
