import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function PATCH(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sceneId, clipOrder } = await req.json()

    if (!sceneId || !Array.isArray(clipOrder)) {
      return NextResponse.json(
        { error: 'sceneId and clipOrder[] are required' },
        { status: 400 },
      )
    }

    // Persist sort_order to shots table
    await Promise.all(
      (clipOrder as string[]).map((shotId, index) =>
        supabaseAdmin
          .from('shots')
          .update({ sort_order: index })
          .eq('shot_id', shotId),
      ),
    )

    return NextResponse.json({ sceneId, clipOrder })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[editor/reorder]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
