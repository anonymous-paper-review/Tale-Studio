// Director 진입 시 camera/lighting 자동 채움(Option B) — writer_runs.state->shotDesign 에서
//   6축 camera_config/lighting_config 를 복원해 main shot_id 로 색인해 돌려준다.
//   persist 가 DEFAULT 로 평탄화한 값을, Director sync 가 "DB가 DEFAULT일 때만" 이 값으로 대체한다.
//   읽기 전용. shotDesign 원본은 rough-storyboard 와 동일하게 state JSONB 에서 회수한다.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/auth'
import { writerShotIdToMain } from '@/lib/writer/adapters'
import {
  cameraConfigFromShotDesign,
  lightingConfigFromShotDesign,
} from '@/lib/writer/shot-config-from-design'
import type { ShotDesign } from '@/lib/writer/types/pipeline'
import type { CameraConfig, LightingConfig } from '@/types/shot'

export const runtime = 'nodejs'

const BodySchema = z.object({ projectId: z.string().uuid() })

export async function POST(req: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  const { projectId } = parsed.data

  // 프로젝트 존재 확인 (service-role read — rough-storyboard 와 동일 게이트).
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const configs: Record<
    string,
    { camera_config: CameraConfig; lighting_config: LightingConfig }
  > = {}
  try {
    const { data: runs } = await supabaseAdmin
      .from('writer_runs')
      .select('status, shotDesign:state->shotDesign')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(5)
    const rows = (runs ?? []) as Array<{ status: string; shotDesign: unknown }>
    const row =
      rows.find((r) => r.status === 'completed' && Array.isArray(r.shotDesign)) ??
      rows.find((r) => Array.isArray(r.shotDesign))
    if (row) {
      for (const d of row.shotDesign as ShotDesign[]) {
        const writerShotId = d?.static_spec?.shot_id ?? d?.intent?.shot_id
        const writerSceneId = d?.intent?.scene_id
        if (!writerShotId || !writerSceneId) continue
        configs[writerShotIdToMain(writerShotId, writerSceneId)] = {
          camera_config: cameraConfigFromShotDesign(d),
          lighting_config: lightingConfigFromShotDesign(d),
        }
      }
    }
  } catch (e) {
    console.error('[writer/shot-configs] state->shotDesign load failed:', e)
  }

  return NextResponse.json({ configs })
}
