// POST /api/editor/title-image — 타이틀 카드에 넣을 이미지 업로드 (약속 J6, 2026-09-04, 오너: "supabase 에 올려는 두되").
//   multipart: projectId, file. 미디어 보관함 `${workspace}/${project}/editor/title/<id>.<ext>` 에 두고 공개 URL 을 돌려준다.
//   라이브 생성 없음·DB 행 없음 — 카드 스냅샷(editor_states)이 URL 만 들고 간다(서버·DB 부담 최소).
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { userOwnsProject } from '@/lib/generation-jobs'
import { mediaPublicUrl, mediaUpload } from '@/lib/storage/media'
import { storageKeySegment } from '@/lib/storage/key-segment'

export const runtime = 'nodejs'

const MAX_BYTES = 10 * 1024 * 1024
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const form = await req.formData()
    const projectId = String(form.get('projectId') ?? '')
    const file = form.get('file')
    if (!projectId || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'Invalid request: projectId and file are required' }, { status: 400 })
    }
    if (!(await userOwnsProject(projectId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const ext = EXT_BY_TYPE[file.type]
    if (!ext) return NextResponse.json({ error: 'Unsupported image type' }, { status: 415 })
    if (file.size === 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image is empty or larger than 10MB' }, { status: 413 })
    }
    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .select('workspace_id')
      .eq('id', projectId)
      .maybeSingle()
    if (error) throw error
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    const path = `${storageKeySegment(project.workspace_id as string)}/${storageKeySegment(projectId)}/editor/title/${id}.${ext}`
    const buf = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await mediaUpload(path, buf, { contentType: file.type })
    if (upErr) throw upErr
    return NextResponse.json({ url: mediaPublicUrl(path) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[editor/title-image]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
