import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { projectId, type, entityId, field, dataUrl } = await req.json()

    if (!projectId || !type || !entityId || !field || !dataUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      )
    }

    // 1. Decode base64 data URL
    const [header, base64] = dataUrl.split(',')
    const mimeType = header?.match(/data:(.*?);/)?.[1] ?? 'image/png'
    const extension = mimeType.split('/')[1] ?? 'png'
    const buffer = Buffer.from(base64, 'base64')

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
    const table = type === 'character' ? 'characters' : 'locations'
    const idColumn = type === 'character' ? 'character_id' : 'location_id'
    await supabaseAdmin
      .from(table)
      .update({ [field]: publicUrl })
      .eq('project_id', projectId)
      .eq(idColumn, entityId)

    return NextResponse.json({ publicUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[assets/upload-image]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
