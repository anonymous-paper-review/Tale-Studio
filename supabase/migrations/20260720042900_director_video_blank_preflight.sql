-- Normalize legacy blank media before the retake hardening migration validates nonblank constraints.
-- The guards make this safe to apply late against databases where either supported table
-- has not yet been introduced.
do $$
begin
  if to_regclass('public.video_clips') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'video_clips' and column_name = 'url'
     ) then
    execute $sql$
      update public.video_clips
      set url = null
      where url is not null and btrim(url) = ''
    $sql$;
  end if;

  if to_regclass('public.generation_jobs') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'generation_jobs' and column_name = 'result_url'
     ) then
    execute $sql$
      update public.generation_jobs
      set result_url = null
      where result_url is not null and btrim(result_url) = ''
    $sql$;
  end if;
end $$;
