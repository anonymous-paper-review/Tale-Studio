// generation_jobs 테이블 서버 헬퍼 (FAL 비동기 작업 상태 관리).
//
// 모든 접근은 service-role(supabaseAdmin)로만 — RLS ON + policy 없음이라 클라이언트 직접 접근 불가.
// 프론트는 GET /api/generation-jobs/[id] (소유권 체크) 경유로만 상태를 읽는다.
import { supabaseAdmin } from '@/lib/supabase/admin'

export type GenerationJobKind =
  | 'character_view'
  | 'world_shot'
  | 'shot_storyboard'
  | 'shot_rough_storyboard'
  | 'shot_video'
export type GenerationJobStatus = 'queued' | 'completed' | 'failed'

export interface GenerationJobTarget {
  workspaceId?: string
  // character_view: characters[column] 갱신
  characterId?: string
  view?: string
  column?: string // character_view: view_* / world_shot: wide_shot|establishing_shot
  // world_shot: locations[column] 갱신
  locationId?: string
  // shot_video: shots.video_url / shot_storyboard: shots.storyboard_image (JSONB)
  // shot_rough_storyboard: shots.rough_storyboard (JSONB)
  shotId?: string
  writerShotId?: string
}

export interface GenerationJob {
  id: string
  project_id: string
  request_id: string
  model: string
  kind: GenerationJobKind
  status: GenerationJobStatus
  target: GenerationJobTarget
  result_url: string | null
  error: string | null
}

const COLUMNS =
  'id, project_id, request_id, model, kind, status, target, result_url, error'

export async function createGenerationJob(input: {
  projectId: string
  requestId: string
  model: string
  kind: GenerationJobKind
  target: GenerationJobTarget
}): Promise<GenerationJob> {
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .insert({
      project_id: input.projectId,
      request_id: input.requestId,
      model: input.model,
      kind: input.kind,
      target: input.target,
      status: 'queued',
    })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return data as GenerationJob
}

export async function getGenerationJobById(
  id: string,
): Promise<GenerationJob | null> {
  const { data } = await supabaseAdmin
    .from('generation_jobs')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle()
  return (data as GenerationJob | null) ?? null
}

export async function getGenerationJobByRequestId(
  requestId: string,
): Promise<GenerationJob | null> {
  const { data } = await supabaseAdmin
    .from('generation_jobs')
    .select(COLUMNS)
    .eq('request_id', requestId)
    .maybeSingle()
  return (data as GenerationJob | null) ?? null
}

export async function completeGenerationJob(
  id: string,
  resultUrl: string,
): Promise<void> {
  // CAS: queued일 때만 완료로 전이 — 동시/지연 webhook이 터미널 상태를 덮어쓰지 못하게.
  await supabaseAdmin
    .from('generation_jobs')
    .update({
      status: 'completed',
      result_url: resultUrl,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'queued')
}

export async function failGenerationJob(
  id: string,
  message: string,
): Promise<void> {
  // CAS: queued일 때만 실패로 전이 — 이미 완료된 작업을 늦은 ERROR webhook이 덮어쓰지 못하게.
  await supabaseAdmin
    .from('generation_jobs')
    .update({
      status: 'failed',
      error: message.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'queued')
}

/**
 * 유저가 현재 in-flight(queued)로 보유한 생성 작업 수 (chat-proactive-copilot Phase 3 — 멀티유저 쿼터).
 *   generation_jobs 에 user_id 컬럼이 없어 workspace→project 2-hop 으로 유저 소유 project 를 모은 뒤 집계.
 *   단일 FAL_KEY 동시 풀(기본 10)을 한 유저가 독점하지 못하게 앱 레이어에서 공정 분배하는 가드의 기반.
 *   참고: fal 은 동시 한도 초과분을 '거부'가 아니라 큐 대기시키므로 이 쿼터는 'UX 보호'(대기 폭주 방지)용.
 */
export async function countQueuedJobsByUser(userId: string): Promise<number> {
  // 1) 유저 소유 workspace
  const { data: workspaces } = await supabaseAdmin
    .from('workspaces')
    .select('id')
    .eq('owner_id', userId)
  const workspaceIds = (workspaces ?? []).map((w) => w.id as string)
  if (workspaceIds.length === 0) return 0

  // 2) 그 workspace 들의 project
  const { data: projects } = await supabaseAdmin
    .from('projects')
    .select('id')
    .in('workspace_id', workspaceIds)
  const projectIds = (projects ?? []).map((p) => p.id as string)
  if (projectIds.length === 0) return 0

  // 3) queued 작업 수
  const { count } = await supabaseAdmin
    .from('generation_jobs')
    .select('id', { count: 'exact', head: true })
    .in('project_id', projectIds)
    .eq('status', 'queued')
  return count ?? 0
}

/** project → workspace.owner_id == userId 소유권 확인 (인증 polling 라우트에서 사용). */
export async function userOwnsProject(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('workspace_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project?.workspace_id) return false
  const { data: ws } = await supabaseAdmin
    .from('workspaces')
    .select('owner_id')
    .eq('id', project.workspace_id)
    .maybeSingle()
  return !!ws && ws.owner_id === userId
}
