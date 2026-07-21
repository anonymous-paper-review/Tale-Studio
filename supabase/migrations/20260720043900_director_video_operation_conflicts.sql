begin;

-- Atomically preserve unrelated response_snapshot keys while recording a
-- manual recovery requirement. The predicate is the reserved-job CAS.
create or replace function public.record_director_video_submission_resolution(
  p_project_id uuid, p_job_id uuid, p_provider_status integer,
  p_cause text, p_code text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_updated uuid;
begin
  update public.generation_jobs
  set response_snapshot = jsonb_set(
    case when jsonb_typeof(response_snapshot) = 'object' then response_snapshot else '{}'::jsonb end,
    '{submission_resolution}',
    jsonb_build_object(
      'state', 'manual_recovery_required',
      'provider_status', p_provider_status,
      'cause', p_cause,
      'code', p_code,
      'recorded_at', now()
    ),
    true
  )
  where id = p_job_id and project_id = p_project_id and status = 'queued'
    and request_id = 'reserved:' || p_job_id::text
  returning id into v_updated;
  return v_updated is not null;
end $$;

revoke all on function public.record_director_video_submission_resolution(uuid, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.record_director_video_submission_resolution(uuid, uuid, integer, text, text) to service_role;

commit;
