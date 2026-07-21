begin;

create or replace function public.patch_generation_job_response_snapshot(
  p_request_id text,
  p_patch jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows_updated integer;
begin
  if nullif(btrim(p_request_id), '') is null then
    raise exception 'generation job request ID must be nonblank';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'response snapshot patch must be a JSON object';
  end if;

  if exists (
    select 1
    from public.generation_jobs
    where request_id = p_request_id
      and response_snapshot is not null
      and jsonb_typeof(response_snapshot) <> 'object'
  ) then
    raise exception 'generation job response snapshot must be a JSON object';
  end if;

  update public.generation_jobs
  set response_snapshot = coalesce(response_snapshot, '{}'::jsonb) || p_patch,
      updated_at = now()
  where request_id = p_request_id;
  get diagnostics v_rows_updated = row_count;

  if v_rows_updated = 0 then
    raise exception 'generation job request ID was not found';
  end if;
end;
$$;

revoke all on function public.patch_generation_job_response_snapshot(text, jsonb) from public, anon, authenticated;
grant execute on function public.patch_generation_job_response_snapshot(text, jsonb) to service_role;

commit;
