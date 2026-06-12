// Supabase PostgREST 읽기 전용 fetch (zero-dep)
import type { Env } from './env.ts';
import { requireEnv } from './env.ts';
import type { DbProject, DbScene, DbShot } from './types.ts';

async function pg<T>(env: Env, pathAndQuery: string): Promise<T> {
  const base = requireEnv(env, 'NEXT_PUBLIC_SUPABASE_URL');
  const key = requireEnv(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${base}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PostgREST ${res.status} ${pathAndQuery.split('?')[0]}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchProject(env: Env, projectId: string): Promise<DbProject> {
  const rows = await pg<DbProject[]>(env, `projects?id=eq.${projectId}&select=id,title,story_text`);
  if (!rows.length) throw new Error(`project ${projectId} 없음`);
  return rows[0];
}

export async function fetchScenes(env: Env, projectId: string): Promise<DbScene[]> {
  return pg<DbScene[]>(
    env,
    `scenes?project_id=eq.${projectId}&select=scene_id,narrative_summary,original_text_quote,mood,characters_present,sort_order&order=sort_order.asc`,
  );
}

export async function fetchShots(env: Env, projectId: string): Promise<DbShot[]> {
  return pg<DbShot[]>(
    env,
    `shots?project_id=eq.${projectId}&select=shot_id,scene_id,shot_type,action_description,characters,duration_seconds,sort_order&order=scene_id.asc,sort_order.asc`,
  );
}
