begin;

-- 프로젝트 생애주기 RPC (#project-lifecycle-rpc 2026-09-01)
--
-- 배경(실측 2026-08-31): 프로젝트 삭제가 왕복 18회(소유권 2 + FK 해제 1 + 자식 14 + 본체 1)를
-- 순차 실행해 빈 프로젝트도 2.5초+, 생성도 카운트→삽입이 순차라 왕복이 낭비됐다.
-- 왕복당 90~300ms(로컬→Supabase ap-southeast-1). 두 흐름을 각각 함수 하나로 원자화한다.
--
-- 삭제 순서 근거는 기존 라우트(src/app/api/project/[id]/route.ts)와 동일:
--   projects.last_writer_run_id → writer_runs FK 를 먼저 끊고, leaf 자식부터 지운 뒤
--   locations(→writer_runs FK) 다음에 writer_runs, 마지막에 projects.
--   chat_traces·writer_observability_events·props·character_appearances 는
--   projects/characters cascade FK 라 명시 삭제가 필요 없다.
--   Storage 파일은 기존과 동일하게 남긴다(경로가 projectId 기반이라 재사용 충돌 없음).

-- ── 생성: 슬롯 카운트 + 삽입을 한 트랜잭션으로 ──
-- 워크스페이스 행 잠금으로 동시 생성이 카운트 게이트를 우회하는 경쟁도 함께 막는다
-- (기존 라우트는 count 와 insert 사이가 비원자였다).
-- p_slot_limit null = 무제한(관리자). 요금제→한도 매핑은 TS(plan-limits.ts)가 진실원이라
-- 라우트가 계산해 넘긴다.
create or replace function public.create_project_slotted(
  p_project_id uuid,
  p_workspace_id uuid,
  p_title text,
  p_locale text,
  p_locale_locked boolean,
  p_reference_project_id uuid,
  p_slot_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_project public.projects%rowtype;
begin
  perform 1 from public.workspaces where id = p_workspace_id for update;
  if not found then
    return jsonb_build_object('status', 'workspace_not_found');
  end if;

  if p_slot_limit is not null then
    select count(*) into v_count from public.projects where workspace_id = p_workspace_id;
    if v_count >= p_slot_limit then
      return jsonb_build_object('status', 'slot_limit', 'count', v_count);
    end if;
  end if;

  insert into public.projects (id, workspace_id, title, locale, locale_locked, reference_project_id)
  values (p_project_id, p_workspace_id, p_title, p_locale, p_locale_locked, p_reference_project_id)
  returning * into v_project;

  return jsonb_build_object('status', 'ok', 'project', to_jsonb(v_project));
end;
$$;

revoke all on function public.create_project_slotted(uuid, uuid, text, text, boolean, uuid, integer) from public, anon, authenticated;
grant execute on function public.create_project_slotted(uuid, uuid, text, text, boolean, uuid, integer) to service_role;

-- ── 삭제: 소유권 확인 + FK-safe 전체 삭제를 한 트랜잭션으로 ──
-- 반환: 'not_found' | 'forbidden' | 'ok'. 함수 본문이 단일 트랜잭션이라
-- 중간 실패 시 부분 삭제가 남지 않는다(기존 라우트의 순차 삭제는 남았다).
create or replace function public.delete_project_deep(
  p_project_id uuid,
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_owner_id uuid;
begin
  select workspace_id into v_workspace_id from public.projects where id = p_project_id;
  if not found then
    return 'not_found';
  end if;

  select owner_id into v_owner_id from public.workspaces where id = v_workspace_id;
  if not found or v_owner_id is distinct from p_user_id then
    return 'forbidden';
  end if;

  update public.projects set last_writer_run_id = null where id = p_project_id;

  delete from public.character_image_candidates where project_id = p_project_id;
  delete from public.location_image_candidates where project_id = p_project_id;
  delete from public.editor_states where project_id = p_project_id;
  delete from public.video_clips where project_id = p_project_id;
  delete from public.subtext_notes where project_id = p_project_id;
  delete from public.generation_jobs where project_id = p_project_id;
  delete from public.camera_light_presets where project_id = p_project_id;
  delete from public.shots where project_id = p_project_id;
  delete from public.scenes where project_id = p_project_id;
  delete from public.locations where project_id = p_project_id;
  delete from public.character_relationships where project_id = p_project_id;
  delete from public.characters where project_id = p_project_id;
  delete from public.writer_runs where project_id = p_project_id;
  delete from public.messages where project_id = p_project_id;

  delete from public.projects where id = p_project_id;
  return 'ok';
end;
$$;

revoke all on function public.delete_project_deep(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_project_deep(uuid, uuid) to service_role;

commit;
