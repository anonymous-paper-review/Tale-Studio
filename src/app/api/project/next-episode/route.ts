// 다음 화 만들기 창구(2026-10-26, [새 프로젝트] → "앞 화에서 이어 만들기") — GET 은 무엇이 넘어오는지 미리 보여 주고, POST 는 다음 화를 만든다.
//   순서: 로그인 → 작업 공간 → 요금제(칸 2개 이상) → 앞 화 주인 · 씬 확인 → 칸 확인 + 삽입 → 그림 복사 · 기록 저장.
//   만든 뒤 화면은 /studio/start?projectId=<id> 로 간다(지금 새 프로젝트와 같다).
import { randomUUID } from 'node:crypto'
import { isAdminWorkspaceOwner } from '@/lib/admin'
import { parseAppLocale } from '@/lib/locale'
import { canUseReference, getPlanLimit } from '@/lib/plan-limits'
import { ReferenceImportValidationError } from '@/lib/reference-import'
import {
  NextEpisodeError,
  createNextEpisode,
  loadPrevEpisode,
  prevEpisodePreview,
} from '@/lib/series/create-next-episode'
import { createClient } from '@/lib/supabase/server'
import { ensureWorkspace } from '@/lib/supabase/workspace'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const gate = await openGate(req.nextUrl.searchParams.get('from'))
    if ('response' in gate) return gate.response

    const prev = await loadPrevEpisode({
      userId: gate.user.id,
      workspaceId: gate.workspace.id,
      fromProjectId: gate.fromProjectId,
    })
    return NextResponse.json({ ok: true, ...prevEpisodePreview(prev) })
  } catch (err) {
    return failure(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const gate = await openGate(typeof body?.fromProjectId === 'string' ? body.fromProjectId : null)
    if ('response' in gate) return gate.response
    const { user, workspace, fromProjectId } = gate

    const limit = getPlanLimit(workspace.plan)
    const isAdmin = isAdminWorkspaceOwner(user, workspace.owner_id)
    const projectId = randomUUID()

    const prev = await loadPrevEpisode({
      userId: user.id,
      workspaceId: workspace.id,
      fromProjectId,
      destinationProjectId: projectId,
    })
    // 다음 화는 앞 화 언어로 잠근다 — 같은 시리즈의 대사 언어가 화마다 달라지면 이어 볼 수 없다.
    const locale = prev.locale ?? parseAppLocale(user.user_metadata?.locale) ?? 'en'

    const created = await createNextEpisode({
      prev,
      workspaceId: workspace.id,
      destinationProjectId: projectId,
      slotLimit: isAdmin ? null : limit,
      locale,
      continueLastScene: body?.continueLastScene === true,
    })
    if (created.status === 'slot_limit') {
      return NextResponse.json(
        { error: 'slot_limit', limit, plan: workspace.plan },
        { status: 403 },
      )
    }

    return NextResponse.json({
      workspaceId: workspace.id,
      projectId,
      project: created.project,
      warnings: created.warnings,
      copyFailures: created.copyFailures,
    })
  } catch (err) {
    return failure(err)
  }
}

/** 로그인 · 작업 공간 · 요금제 — 미리보기와 만들기가 같은 문을 쓴다. */
async function openGate(
  rawFromProjectId: string | null,
): Promise<
  | { response: NextResponse }
  | {
      user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }
      workspace: { id: string; plan: string | null; owner_id: string | null }
      fromProjectId: string
    }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const fromProjectId = (rawFromProjectId ?? '').trim()
  if (!fromProjectId) {
    return { response: NextResponse.json({ error: 'reference_not_found' }, { status: 404 }) }
  }

  const workspace = await ensureWorkspace(user)
  // 칸이 2개 이상인 요금제만 앞 화를 남겨 둘 수 있다 — 칸이 하나면 다음 화를 만들 자리가 없다.
  if (!canUseReference(workspace.plan)) {
    return {
      response: NextResponse.json(
        { error: 'reference_unavailable', plan: workspace.plan },
        { status: 403 },
      ),
    }
  }

  return { user, workspace, fromProjectId }
}

function failure(err: unknown): NextResponse {
  if (err instanceof NextEpisodeError || err instanceof ReferenceImportValidationError) {
    return NextResponse.json({ error: err.code }, { status: err.status })
  }
  const message = err instanceof Error ? err.message : 'Unknown error'
  console.error('[project/next-episode]', message)
  return NextResponse.json({ error: message }, { status: 500 })
}
