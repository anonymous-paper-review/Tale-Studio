begin;

-- Atomic response evidence merge: concurrent provider callbacks may patch distinct
-- keys for the same request, so application-side read/merge/write is unsafe.
create or replace function public.patch_generation_job_response_snapshot(
  p_request_id text,
  p_patch jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'response snapshot patch must be a JSON object';
  end if;

  -- Preserve the former helper's malformed stored-value error rather than
  -- silently converting historical non-object snapshots.
  if exists (
    select 1
    from public.generation_jobs
    where request_id = p_request_id
      and response_snapshot is not null
      and jsonb_typeof(response_snapshot) <> 'object'
  ) then
    raise exception 'generation job response snapshot must be a JSON object';
  end if;

  -- An absent request remains a successful no-op, matching the prior update.
  update public.generation_jobs
  set response_snapshot = coalesce(response_snapshot, '{}'::jsonb) || p_patch,
      updated_at = now()
  where request_id = p_request_id;
end;
$$;

revoke all on function public.patch_generation_job_response_snapshot(text, jsonb) from public, anon, authenticated;
grant execute on function public.patch_generation_job_response_snapshot(text, jsonb) to service_role;

commit;
