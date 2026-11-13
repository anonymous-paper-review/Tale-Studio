import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireProjectAccess } from '@/lib/api/guard'

/**
 * 저장된 판이 더 높지 않을 때만 쓴다 — 판 검사와 쓰기를 한 문장(조건부 갱신)으로 묶어, 읽고 쓰는 사이에 새 형식 저장이 끼어도 옛 형식이
 *   덮지 못한다(검토 c 낮음 6, 2026-11-14). 행이 없으면 새로 넣고, 그 사이 다른 탭이 먼저 넣었으면(23505) 한 번 더 조건부로 쓴다.
 *   약속: tests/editor/save-format.test.ts
 */
async function writeIfNotNewer(
  projectId: string,
  state: unknown,
  version: number,
  updatedAt: string,
): Promise<{ updatedAt: string } | 'newer' | 'gone'> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('editor_states')
      .update({ state, updated_at: updatedAt })
      .eq('project_id', projectId)
      .or(`state->version.is.null,state->version.lte.${version}`)
      .select('updated_at')
    if (updateError) throw updateError
    const row = (updated as { updated_at?: string }[] | null)?.[0]
    if (row) return { updatedAt: row.updated_at ?? updatedAt }
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('editor_states')
      .insert({ project_id: projectId, state, updated_at: updatedAt })
      .select('updated_at')
      .maybeSingle()
    if (!insertError) return { updatedAt: (inserted as { updated_at?: string } | null)?.updated_at ?? updatedAt }
    const code = (insertError as { code?: string }).code
    // FK 위반(23503) = 프로젝트가 삭제된 뒤에도 열린 에디터가 자동저장을 계속 쏘는 경우 — 서버 장애가 아니라 만료된 클라이언트다.
    if (code === '23503') return 'gone'
    // 행이 이미 있다(23505) — 더 높은 판이거나, 그 사이 다른 탭이 먼저 넣었다. 한 번 더 조건부로 쓴다.
    if (code !== '23505') throw insertError
  }
  return 'newer'
}

/** 옮기기 전 한 벌(beforeV2)은 되살릴 때만 쓴다 — 화면에는 보내지 않는다(열 때마다 두 배를 받지 않게). */
function withoutBackup(state: unknown): unknown {
  if (!state || typeof state !== 'object' || Array.isArray(state) || !('beforeV2' in state)) return state
  const { beforeV2: _before, ...rest } = state as Record<string, unknown>
  return rest
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'Invalid request: projectId is required' }, { status: 400 })
    }

    // 소유자만 — 로그인만으로 남의 프로젝트 조작 가능하던 구멍 (#access-audit 2026-08-15)
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const { data, error } = await supabaseAdmin
      .from('editor_states')
      .select('state, updated_at')
      .eq('project_id', projectId)
      .maybeSingle()

    if (error) throw error

    // 저장 시각도 돌려준다 — 화면이 이 브라우저가 마지막으로 본 시각과 견줘 다른 곳에서 더 나중에 고쳤는지 안다(E2b, 2026-11-14).
    return NextResponse.json({ state: withoutBackup(data?.state ?? null), updatedAt: data?.updated_at ?? null })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[editor/state GET]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const { projectId, state } = await req.json()

    if (!projectId) {
      return NextResponse.json({ error: 'Invalid request: projectId is required' }, { status: 400 })
    }

    // 소유자만 — 로그인만으로 남의 프로젝트 조작 가능하던 구멍 (#access-audit 2026-08-15)
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    // 새 형식(2판, 자유 배치) 저장본을 예전 화면(1판)이 덮지 못하게 한다 — 배포하는 동안 열려 있던 탭이 빈 곳 · 자리가 없는 옛 형식으로
    //   저장하면 새 편집이 사라진다(오너 답 1, 2026-11-14). 4xx 라 그 탭은 다시 시도하지 않고 "새로고침" 안내를 띄운다.
    //   여기서 먼저 읽어 높은 판이면 바로 돌려보내고, 실제로 막는 것은 아래 조건부 쓰기다(검토 c 낮음 6). 약속: tests/editor/save-format.test.ts
    const incoming = Number.isInteger(state?.version) ? (state.version as number) : 1
    const { data: stored, error: readError } = await supabaseAdmin
      .from('editor_states')
      .select('version:state->version, beforeV2:state->beforeV2')
      .eq('project_id', projectId)
      .maybeSingle()
    if (readError) throw readError
    const storedRow = stored as { version?: unknown; beforeV2?: unknown } | null
    const storedVersion = Number(storedRow?.version ?? 0)
    if (storedVersion > incoming) {
      return NextResponse.json(
        { error: 'This project was saved by a newer version of the editor. Refresh the page.' },
        { status: 409 },
      )
    }

    // 옮기기 전 한 벌 — 옛 형식 저장본을 새 형식이 처음 덮을 때 그 저장본을 그대로 beforeV2 칸에 남기고, 그 뒤 새 형식 저장마다
    //   서버에 있던 한 벌을 실어 나른다(화면이 보낸 것은 쓰지 않는다). 옮겨 적기는 되돌릴 수 없어서(리드 2026-11-14, 2단계 위험 2)
    //   새 형식에 고장이 나면 이 한 벌로 "옮기던 때의 편집"을 되살린다 — 되살리기는 사람이 한다. 예전 화면은 이 칸을 모르니
    //   배포를 되돌린 뒤 예전 화면이 한 번 저장하면 없어진다(되살리기는 되돌리기 전에). 약속: tests/editor/save-format.test.ts
    let toStore = state
    if (incoming >= 2 && state && typeof state === 'object') {
      const { beforeV2: _sent, ...rest } = state as Record<string, unknown>
      let before = storedRow?.beforeV2 ?? null
      if (before == null && storedRow && storedVersion < 2) {
        const { data: full, error: fullError } = await supabaseAdmin
          .from('editor_states')
          .select('state')
          .eq('project_id', projectId)
          .maybeSingle()
        if (fullError) throw fullError
        before = (full as { state?: unknown } | null)?.state ?? null
      }
      toStore = before != null ? { ...rest, beforeV2: before } : rest
    }

    const written = await writeIfNotNewer(projectId, toStore, incoming, new Date().toISOString())
    if (written === 'newer') {
      return NextResponse.json(
        { error: 'This project was saved by a newer version of the editor. Refresh the page.' },
        { status: 409 },
      )
    }
    // 410 으로 구분해 클라이언트가 재시도를 멈추게 한다(프로젝트가 지워짐).
    if (written === 'gone') return NextResponse.json({ error: 'Project no longer exists' }, { status: 410 })

    // 서버가 실제로 적은 저장 시각 — 화면이 이 브라우저에 적어 두고 다음에 열 때 견준다(E2b, 2026-11-14).
    return NextResponse.json({ ok: true, updatedAt: written.updatedAt })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[editor/state PUT]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
