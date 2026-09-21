import { NextResponse } from 'next/server'
import { recoverVideoBatches } from '@/lib/director/batch-recovery'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: Request) {
  // #batch-resume: 개발 환경이어도 인증 없는 유료 작업 재개를 허용하지 않는다.
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json({ ok: true, ...await recoverVideoBatches() })
  } catch (error) {
    console.error('[video-batches] recovery scan failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Unable to recover video batches' }, { status: 500 })
  }
}
