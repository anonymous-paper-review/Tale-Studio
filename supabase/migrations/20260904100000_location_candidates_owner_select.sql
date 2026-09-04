-- 배경 후보 히스토리(location_image_candidates)를 브라우저가 직접 읽는다 — 약속 B4(2026-09-04).
--   stores/artist-store.ts 가 캐릭터 후보(character_image_candidates)와 같은 방식으로
--   createClient()(anon+세션)로 .eq('project_id', projectId) SELECT 한다 → 소유자 체인 정책.
--   쓰기는 finalize.ts / select-location-candidate 라우트의 service_role 전용이라 SELECT 만 연다.
--   (20260811120000 에서 RLS 만 켜고 정책이 없어 브라우저 읽기가 0행이었다.)
drop policy if exists "Owner select" on public.location_image_candidates;
create policy "Owner select" on public.location_image_candidates
  for select
  using (
    project_id in (
      select p.id
      from public.projects p
      join public.workspaces w on w.id = p.workspace_id
      where w.owner_id = auth.uid()
    )
  );
