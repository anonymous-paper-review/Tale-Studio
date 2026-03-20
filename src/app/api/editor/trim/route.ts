import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function PATCH(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { shotId, trimStart, trimEnd } = await req.json()

    if (!shotId) {
      return NextResponse.json({ error: 'shotId is required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('shots')
      .update({ trim_start: trimStart ?? null, trim_end: trimEnd ?? null })
      .eq('shot_id', shotId)

    if (error) throw error

    return NextResponse.json({ shotId, trimStart, trimEnd })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[editor/trim]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
