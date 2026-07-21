begin;

-- Preserve legacy rows while ensuring every linked video reservation has a JSON object snapshot.
-- requestedModel is retained as the immutable reservation fingerprint introduced by 43300.
update public.generation_jobs
set input_snapshot = jsonb_build_object(
  'legacyInputSnapshot', input_snapshot,
  'requestedModel', coalesce(nullif(btrim(model), ''), 'legacy-unknown')
)
where kind = 'shot_video'
  and video_clip_id is not null
  and jsonb_typeof(coalesce(input_snapshot, 'null'::jsonb)) <> 'object';

-- Failed terminal jobs must retain an actionable error. Existing rows are given explicit
-- provenance rather than being dropped or silently rewritten as a different terminal state.
update public.generation_jobs
set error = coalesce(nullif(btrim(error), ''), nullif(btrim(last_error), ''), 'legacy failure without provider evidence'),
    last_error = coalesce(nullif(btrim(error), ''), nullif(btrim(last_error), ''), 'legacy failure without provider evidence')
where kind = 'shot_video'
  and video_clip_id is not null
  and status = 'failed'
  and (nullif(btrim(error), '') is null or nullif(btrim(last_error), '') is null);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'generation_jobs_linked_video_input_snapshot_object' and conrelid = 'public.generation_jobs'::regclass) then
    alter table public.generation_jobs add constraint generation_jobs_linked_video_input_snapshot_object
      check (kind <> 'shot_video' or video_clip_id is null or coalesce(jsonb_typeof(input_snapshot) = 'object', false)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'generation_jobs_linked_video_failed_error_evidence' and conrelid = 'public.generation_jobs'::regclass) then
    alter table public.generation_jobs add constraint generation_jobs_linked_video_failed_error_evidence
      check (kind <> 'shot_video' or video_clip_id is null or status <> 'failed' or nullif(btrim(error), '') is not null) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'generation_jobs_linked_video_failed_last_error_evidence' and conrelid = 'public.generation_jobs'::regclass) then
    alter table public.generation_jobs add constraint generation_jobs_linked_video_failed_last_error_evidence
      check (kind <> 'shot_video' or video_clip_id is null or status <> 'failed' or nullif(btrim(last_error), '') is not null) not valid;
  end if;
end $$;

alter table public.generation_jobs validate constraint generation_jobs_linked_video_input_snapshot_object;
alter table public.generation_jobs validate constraint generation_jobs_linked_video_failed_error_evidence;
alter table public.generation_jobs validate constraint generation_jobs_linked_video_failed_last_error_evidence;

-- SECURITY DEFINER mutation endpoints remain server-only after replacement migrations.
revoke all on function public.attach_director_video_provider_request(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.reserve_director_video_take(uuid, text, text, jsonb, uuid, jsonb, uuid, uuid, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.reserve_director_video_regeneration(uuid, uuid, text, jsonb, uuid, jsonb, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.complete_director_video_attempt(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.fail_director_video_attempt(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.attach_director_video_provider_request(uuid, uuid, text, text, text) to service_role;
grant execute on function public.reserve_director_video_take(uuid, text, text, jsonb, uuid, jsonb, uuid, uuid, text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.reserve_director_video_regeneration(uuid, uuid, text, jsonb, uuid, jsonb, uuid, uuid, text, text) to service_role;
grant execute on function public.complete_director_video_attempt(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.fail_director_video_attempt(uuid, uuid, text) to service_role;

commit;
