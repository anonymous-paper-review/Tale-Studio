// GET /api/artist/generation-slots — Artist 화면이 그림을 동시에 몇 장 보낼지 묻는 창구 (2026-10-09 오너).
//
// 그 유저의 러프 스토리보드가 만들어지는 중이면 1장, 없거나 끝났으면 3장(src/lib/artist/generation-slots.ts).
//   러프는 유저 단위로 센다 — 유저당 그림 상한을 러프와 Artist 가 같이 쓰기 때문이다. 30분 넘게 멈춘 대기
//   작업은 countQueuedJobsByUser 가 이미 빼고 센다(쿼터 집계 기준). 세지 못하면 1장으로 답한다.
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { countQueuedJobsByUser } from '@/lib/generation-jobs'
import { artistGenerationLimit } from '@/lib/artist/generation-slots'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let roughActive: number | null
  try {
    roughActive = await countQueuedJobsByUser(user.id, ['shot_rough_storyboard'])
  } catch (error) {
    console.warn('[generation-slots] rough storyboard count failed — falling back to one slot:', error)
    roughActive = null
  }
  return NextResponse.json({ limit: artistGenerationLimit(roughActive), roughActive })
}
