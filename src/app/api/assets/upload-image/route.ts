import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const form = await req.formData()
    const projectId = form.get('projectId') as string
    const type = form.get('type') as string
    const entityId = form.get('entityId') as string
    const field = form.get('field') as string
    const file = form.get('file') as File | null

    if (!projectId || !type || !entityId || !field || !file) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      )
    }

    const mimeType = file.type || 'image/png'
    const extension = mimeType.split('/')[1] ?? 'png'
    const buffer = Buffer.from(await file.arrayBuffer())

    // 2. Get workspace_id from project
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('workspace_id')
      .eq('id', projectId)
      .single()

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 },
      )
    }

    // 3. Upload to Storage
    const path = `${project.workspace_id}/${projectId}/${type}s/${entityId}_${field}.${extension}`
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('media')
      .upload(path, buffer, { contentType: mimeType, upsert: true })

    if (uploadErr) throw uploadErr

    // 4. Get public URL
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from('media').getPublicUrl(path)

    // 5. Update DB row
    if (type === 'video') {
      // video_clips 는 id(uuid) 기준 — 영상 썸네일을 thumbnail_url + thumbnail_path 로 영속.
      // (Node 탭 영상 카드가 thumbnail_url 을 우선 렌더 → 속도·전송 안정.)
      await supabaseAdmin
        .from('video_clips')
        .update({ thumbnail_url: publicUrl, thumbnail_path: path })
        .eq('id', entityId)
        .eq('project_id', projectId)
    } else {
      const tableMap: Record<string, { table: string; idCol: string }> = {
        character: { table: 'characters', idCol: 'character_id' },
        location: { table: 'locations', idCol: 'location_id' },
        shot: { table: 'shots', idCol: 'shot_id' },
      }
      const target = tableMap[type]
      if (target) {
        // storyboard_image 는 JSONB StoryboardImage 객체 (src/types/director-canvas.ts).
        // ShotNode/StoryboardGridView 가 .url/.status/.errorMessage 로 소비하므로 객체로 저장한다.
        // 나머지 이미지 필드(reference_image, view_*, wide_shot 등)는 TEXT(public URL) 그대로.
        const value =
          field === 'storyboard_image'
            ? {
                url: publicUrl,
                status: 'completed',
                errorMessage: null,
                generatedAt: Date.now(),
              }
            : publicUrl
        await supabaseAdmin
          .from(target.table)
          .update({ [field]: value })
          .eq('project_id', projectId)
          .eq(target.idCol, entityId)
      }
    }

    return NextResponse.json({ publicUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[assets/upload-image]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
