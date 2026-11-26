// 더한 샷 빈 칸 채우기(오너 2026-11-27 N2 "채팅으로 더한 샷은 앞뒤 샷의 내용으로 정보 채우기 — writer 파이프라인에 추가한 기능").
//   채팅 · [+ 샷 추가](writer-store addShot)가 샷을 저장한 직후 부른다 — 같은 씬 앞뒤 샷 · 씬 무대로 인물 자리 · 자세 · 모습 · 빛을 채운다
//   (계산은 Writer 파이프라인 stage/added_shot, 글 모델 없음). 사람이 더한 샷만 쓴다 — 파이프라인 샷은 넘겨도 아무것도 바꾸지 않는다.
//   돌려주는 값 = 카드 칩(앵글 · 색온도) — 화면이 다시 불러오기 전에도 다른 샷처럼 보이게. 약속: tests/writer/added-shot-fill-request.test.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProjectAccess } from '@/lib/api/guard'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { refillAddedShots } from '@/lib/writer/pipeline/util/added_shot_persist'
import { shotStageDesign } from '@/lib/writer/board-card'

export const runtime = 'nodejs'

const BodySchema = z.object({
  projectId: z.string().uuid(),
  shotId: z.string().trim().min(1).max(64),
})

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 })

  // 프로젝트 주인만 — 공유 링크로 보는 사람은 샷 칸을 쓰지 못한다.
  const access = await requireProjectAccess(req, parsed.data.projectId)
  if (!access.ok) return access.response

  try {
    const filled = (await refillAddedShots(access.projectId, [parsed.data.shotId])).get(parsed.data.shotId)
    const spec = filled?.static_spec ?? null
    return NextResponse.json({ ok: true, filled: !!spec, stageDesign: spec ? shotStageDesign(spec, null) : null })
  } catch (e) {
    console.error('[writer/added-shot-fill] failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, error: 'Could not fill the added shot' }, { status: 500 })
  }
}
