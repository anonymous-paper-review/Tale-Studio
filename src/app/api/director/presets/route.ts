import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { CameraConfig, CameraPreset, LightingConfig } from '@/types'

type PresetRow = {
  id: string
  name: string
  camera: CameraConfig
  lighting: LightingConfig
  camera_preset: CameraPreset
}

/** snake_case DB row → camelCase API shape */
function toPreset(row: PresetRow) {
  return {
    id: row.id,
    name: row.name,
    camera: row.camera,
    lighting: row.lighting,
    cameraPreset: row.camera_preset,
  }
}

/**
 * IDOR 가드: projectId가 인증 사용자 소유 워크스페이스의 프로젝트인지 검증.
 * 패턴: workspaces.owner_id === user.id → 그 워크스페이스의 projects (project/init과 동일).
 */
async function isProjectOwned(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const { data: workspaces } = await supabaseAdmin
    .from('workspaces')
    .select('id')
    .eq('owner_id', userId)
  const workspaceIds = (workspaces ?? []).map((w) => w.id)
  if (workspaceIds.length === 0) return false

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .in('workspace_id', workspaceIds)
    .maybeSingle()
  return !!project
}

export async function GET(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const projectId = new URL(req.url).searchParams.get('projectId')
    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 },
      )
    }
    if (!(await isProjectOwned(projectId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin
      .from('camera_light_presets')
      .select('id, name, camera, lighting, camera_preset')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      presets: (data as PresetRow[]).map(toPreset),
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[director/presets GET]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectId, name, camera, lighting, cameraPreset } =
      (await req.json()) as {
        projectId?: string
        name?: string
        camera?: CameraConfig
        lighting?: LightingConfig
        cameraPreset?: CameraPreset
      }

    if (!projectId || !name || !camera || !lighting || !cameraPreset) {
      return NextResponse.json(
        {
          error:
            'projectId, name, camera, lighting and cameraPreset are required',
        },
        { status: 400 },
      )
    }
    if (!(await isProjectOwned(projectId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin
      .from('camera_light_presets')
      .insert({
        project_id: projectId,
        name,
        camera,
        lighting,
        camera_preset: cameraPreset,
      })
      .select('id, name, camera, lighting, camera_preset')
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? 'Failed to create preset' },
        { status: 500 },
      )
    }

    return NextResponse.json({ preset: toPreset(data as PresetRow) })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[director/presets POST]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const id = new URL(req.url).searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // 소유권 확인: 프리셋 → project_id → 사용자 소유 검증 후 삭제
    const { data: target } = await supabaseAdmin
      .from('camera_light_presets')
      .select('project_id')
      .eq('id', id)
      .maybeSingle()
    if (!target) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (!(await isProjectOwned(target.project_id as string, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error } = await supabaseAdmin
      .from('camera_light_presets')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[director/presets DELETE]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
