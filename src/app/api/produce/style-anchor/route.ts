import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { userOwnsProject } from '@/lib/generation-jobs'
import { isOwnMediaUrl } from '@/lib/upload/attachment'
import { listStyleAnchorMediums } from '@/lib/style-anchor'

/**
 * 유저가 올린 이미지를 이 프로젝트의 스타일 앵커로 확정한다.
 *
 * 채팅이 의도를 해석해 이미지를 고르고(styleAnchorFromAttachment), 클라가 그 인덱스를 URL 로
 * 바꿔 여기로 보낸다. 모델이 뱉은 URL 을 그대로 믿지 않는 이유가 이것이다 — 이 URL 은
 * 나중에 이미지 생성 프로바이더가 직접 가져가므로, 우리 스토리지 경로가 아니면
 * 임의 주소를 대신 페치시키는 통로가 된다.
 *
 * style_anchor_key 에 custom_<uuid> 를 넣는 이유는 마이그레이션 주석 참고 — 그 컬럼이
 * 룩 지문·핸드오프 게이트·생성 기록에서 앵커의 정체성으로 이미 쓰이고 있어서다.
 */

const MAX_LABEL_LENGTH = 40

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked

  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    const { projectId, imageUrl, label, medium, lock } = body as Record<string, unknown>

    if (typeof projectId !== 'string' || !projectId) {
      return NextResponse.json({ error: 'Invalid request: projectId is required' }, { status: 400 })
    }
    if (!(await userOwnsProject(projectId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 화이트리스트가 유일한 방어선 — 우리 media 버킷 경로만 앵커가 될 수 있다.
    if (!isOwnMediaUrl(imageUrl)) {
      return NextResponse.json({ error: 'Only images uploaded to this project can be used as a style anchor.' }, { status: 400 })
    }

    // 고정된 그림체(2026-10-09 오너 "그림체 추출을 고르면 스타일 선택을 막아줘") — 사용자가 올린 그림을 "그림체"로 고르면
    //   그 그림체로 고정된다(lock). 고정된 뒤에는 채팅 첨부 · 만화 흐름도 이 창구로 다른 그림을 그림체로 정하지 못한다.
    const { data: currentRow, error: readError } = await supabaseAdmin.from('projects').select('custom_style_anchor').eq('id', projectId).maybeSingle()
    if (readError) throw readError
    const current = (currentRow as { custom_style_anchor?: unknown } | null)?.custom_style_anchor
    if (current && typeof current === 'object' && (current as { locked?: unknown }).locked === true) {
      return NextResponse.json({ error: 'style_locked' }, { status: 409 })
    }

    // medium 은 writer 파이프라인이 소비한다. 카탈로그에 없는 값을 넣으면 v0 가 매체를
    //   발명하는 것과 같은 사고가 난다. 목록 조회가 실패한 경우에만 관대하게 통과시킨다.
    const allowedMediums = await listStyleAnchorMediums()
    const normalizedMedium = typeof medium === 'string' ? medium.trim() : ''
    if (allowedMediums.length > 0 && !allowedMediums.includes(normalizedMedium)) {
      return NextResponse.json(
        { error: `Unsupported medium (must be one of ${allowedMediums.join(', ')}).` },
        { status: 400 },
      )
    }

    const normalizedLabel =
      typeof label === 'string' && label.trim() ? label.trim().slice(0, MAX_LABEL_LENGTH) : '내 레퍼런스'

    const key = `custom_${randomUUID()}`
    const { error } = await supabaseAdmin
      .from('projects')
      .update({
        style_anchor_key: key,
        custom_style_anchor: {
          url: imageUrl,
          label: normalizedLabel,
          medium: normalizedMedium || null,
          ...(lock === true ? { locked: true } : {}),
        },
      })
      .eq('id', projectId)
    if (error) throw error

    return NextResponse.json({
      key,
      label: normalizedLabel,
      medium: normalizedMedium || null,
      imageUrl,
      ...(lock === true ? { locked: true } : {}),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[produce/style-anchor]', message.replace(/[\r\n\t]/g, ' ').slice(0, 200))
    return NextResponse.json({ error: 'Failed to save the style anchor.' }, { status: 500 })
  }
}
