import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/supabase/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { uploadImageFromUrl } from '@/lib/fal/finalize'
import {
  assertSafeImageUrl,
  assertWorkspaceAccess,
  toInventoryItem,
} from '@/lib/inventory'

export const runtime = 'nodejs'

const bodySchema = z.object({
  workspaceId: z.uuid(),
  kind: z.enum(['character', 'world', 'image']),
  name: z.string().min(1),
  sourceImageUrl: z.url(),
  sourceProjectId: z.uuid().optional(),
  sourceCharacterId: z.string().optional(),
})

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 },
      )
    }
    const {
      workspaceId,
      kind,
      name,
      sourceImageUrl,
      sourceProjectId,
      sourceCharacterId,
    } = parsed.data

    if (!(await assertWorkspaceAccess(workspaceId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // SSRF 방지: 원격 fetch 전에 허용 호스트 검증.
    try {
      assertSafeImageUrl(sourceImageUrl)
    } catch {
      return NextResponse.json(
        { error: 'image host not allowed' },
        { status: 400 },
      )
    }

    const itemId = crypto.randomUUID()
    const path = `${workspaceId}/inventory/${itemId}.png`
    const imageUrl = await uploadImageFromUrl(sourceImageUrl, path)

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
          source_project_id: sourceProjectId ?? null,
          source_character_id: sourceCharacterId ?? null,
        })
        .select('*')
        .single()

      if (error || !data) {
        throw error ?? new Error('Failed to create inventory item')
      }

      return NextResponse.json({ item: toInventoryItem(data) })
    } catch (insertErr) {
      // 부분 실패 보상: 복사한 storage 객체 제거.
      try {
        await supabaseAdmin.storage.from('media').remove([path])
      } catch {
        // 보상 실패 무해.
      }
      throw insertErr
    }
  } catch (err) {
    console.error(
      '[inventory save-from-asset]',
      err instanceof Error ? err.message : err,
    )
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
