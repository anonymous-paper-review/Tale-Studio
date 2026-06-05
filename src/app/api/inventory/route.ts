import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/supabase/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { assertWorkspaceAccess, toInventoryItem } from '@/lib/inventory'

const getQuerySchema = z.object({ workspaceId: z.uuid() })
const deleteQuerySchema = z.object({ id: z.uuid() })

export async function GET(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = getQuerySchema.safeParse({
      workspaceId: new URL(req.url).searchParams.get('workspaceId'),
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'workspaceId is required' },
        { status: 400 },
      )
    }
    const { workspaceId } = parsed.data

    if (!(await assertWorkspaceAccess(workspaceId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin
      .from('inventory_items')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('[inventory GET]', error.message)
      return NextResponse.json({ error: 'internal error' }, { status: 500 })
    }

    return NextResponse.json({ items: (data ?? []).map(toInventoryItem) })
  } catch (err) {
    console.error('[inventory GET]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = deleteQuerySchema.safeParse({
      id: new URL(req.url).searchParams.get('id'),
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }
    const { id } = parsed.data

    const { data: row } = await supabaseAdmin
      .from('inventory_items')
      .select('workspace_id, storage_path')
      .eq('id', id)
      .maybeSingle()

    // 없으면 멱등 no-op
    if (!row) {
      return NextResponse.json({ ok: true })
    }

    if (!(await assertWorkspaceAccess(row.workspace_id as string, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error } = await supabaseAdmin
      .from('inventory_items')
      .delete()
      .eq('id', id)
    if (error) {
      console.error('[inventory DELETE]', error.message)
      return NextResponse.json({ error: 'internal error' }, { status: 500 })
    }

    // storage 객체 제거 (실패 무시 — 멱등).
    try {
      await supabaseAdmin.storage
        .from('media')
        .remove([row.storage_path as string])
    } catch (removeErr) {
      console.error(
        '[inventory DELETE] storage remove failed',
        removeErr instanceof Error ? removeErr.message : removeErr,
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[inventory DELETE]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
