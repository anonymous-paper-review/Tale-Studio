import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/supabase/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { assertWorkspaceAccess, toInventoryItem } from '@/lib/inventory'

export const runtime = 'nodejs'

const MAX_BYTES = 10 * 1024 * 1024

const fieldSchema = z.object({
  workspaceId: z.uuid(),
  kind: z.enum(['character', 'world', 'image']),
  name: z.string().min(1),
})

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const form = await req.formData()
    const parsed = fieldSchema.safeParse({
      workspaceId: form.get('workspaceId'),
      kind: form.get('kind'),
      name: form.get('name'),
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request fields' },
        { status: 400 },
      )
    }
    const { workspaceId, kind, name } = parsed.data
    const file = form.get('file') as File | null

    if (!file || !file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'A valid image file is required' },
        { status: 400 },
      )
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'File exceeds 10MB limit' },
        { status: 400 },
      )
    }

    if (!(await assertWorkspaceAccess(workspaceId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // 클라이언트 위조 가능한 file.type 대신 magic byte로 실제 타입 판별.
    // SVG 거부 (public 버킷 inline 서빙 시 stored-XSS).
    const sig = buffer.subarray(0, 12)
    const isPng = sig[0] === 0x89 && sig[1] === 0x50
    const isJpeg = sig[0] === 0xff && sig[1] === 0xd8
    const isWebp =
      sig.subarray(0, 4).toString('latin1') === 'RIFF' &&
      sig.subarray(8, 12).toString('latin1') === 'WEBP'
    if (!isPng && !isJpeg && !isWebp) {
      return NextResponse.json(
        { error: 'unsupported image type' },
        { status: 400 },
      )
    }
    const ext = isPng ? 'png' : isJpeg ? 'jpg' : 'webp'
    const contentType = isPng
      ? 'image/png'
      : isJpeg
        ? 'image/jpeg'
        : 'image/webp'

    const itemId = crypto.randomUUID()
    const path = `${workspaceId}/inventory/${itemId}.${ext}`

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('media')
      .upload(path, buffer, { contentType, upsert: true })
    if (uploadErr) throw uploadErr

    const imageUrl = supabaseAdmin.storage.from('media').getPublicUrl(path).data
      .publicUrl

    try {
      const { data, error } = await supabaseAdmin
        .from('inventory_items')
        .insert({
          id: itemId,
          workspace_id: workspaceId,
          kind,
          name,
          image_url: imageUrl,
          storage_path: path,
          thumbnail_url: null,
          source_project_id: null,
          source_character_id: null,
        })
        .select('*')
        .single()

      if (error || !data) {
        throw error ?? new Error('Failed to create inventory item')
      }

      return NextResponse.json({ item: toInventoryItem(data) })
    } catch (insertErr) {
      // 부분 실패 보상: 업로드한 storage 객체 제거.
      try {
        await supabaseAdmin.storage.from('media').remove([path])
      } catch {
        // 보상 실패 무해.
      }
      throw insertErr
    }
  } catch (err) {
    console.error('[inventory upload]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
