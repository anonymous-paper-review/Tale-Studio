// 다시 쓰기 안 하나 만들기(2026-10-02 시안 v04) — 서버 안쪽 전용. scene-gate 의 rewrite 가 안마다 이 요청을 따로 보내
//   각 안이 자기 시간(maxDuration)을 쓴다(아이디어부터 다시는 이야기 엔진 · 구조 · 씬을 새로 돌아 한 요청에 셋을 몰면 넘친다).
//   바로 답하고 일은 after() 로 한다 — 보낸 쪽이 기다리지 않게. 비밀 열쇠는 writer/step 과 같다.
import { NextRequest, NextResponse, after } from 'next/server'
import { generateSceneStoryRewrite } from '@/lib/writer/scene-story-rewrite'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const secret = process.env.WRITER_STEP_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'misconfigured' }, { status: 500 })
  } else if (req.headers.get('x-writer-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const body = (await req.json().catch(() => null)) as { projectId?: unknown; runId?: unknown; proposalId?: unknown; variantId?: unknown } | null
  const { projectId, runId, proposalId, variantId } = body ?? {}
  if (typeof projectId !== 'string' || typeof runId !== 'string' || typeof proposalId !== 'string' || typeof variantId !== 'string') {
    return NextResponse.json({ error: 'Invalid rewrite request' }, { status: 400 })
  }
  after(async () => {
    await generateSceneStoryRewrite(projectId, runId, proposalId, variantId)
  })
  return NextResponse.json({ ok: true }, { status: 202 })
}
