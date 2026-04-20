import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function PATCH(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { shotId, speed } = await req.json()

    if (!shotId) {
      return NextResponse.json({ error: 'shotId is required' }, { status: 400 })
    }

    if (typeof speed !== 'number' || speed < 0.25 || speed > 4.0) {
      return NextResponse.json(
        { error: 'speed must be a number between 0.25 and 4.0' },
        { status: 400 },
      )
    }

    const { error } = await supabaseAdmin
      .from('shots')
      .update({ speed })
      .eq('shot_id', shotId)

    if (error) throw error

    return NextResponse.json({ shotId, speed })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[editor/speed]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
