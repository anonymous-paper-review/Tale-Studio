// POST /api/artist/versions/regen { projectId, n, action: 'fail' | 'finish', slots? } — 재생성 그림 그리기의 진행 기록(2026-10-28).
//   fail: 접수 전에 막힌 칸(내용 규칙 · 기준 얼굴 없음 등)을 실패로 적는다 — 이어 그리기가 같은 칸을 다시 보내지 않는다(9/11 규칙).
//   finish: 남은 칸이 없으면 다 그렸다고 한 번만 적고 announced:true — 그 화면만 채팅에 "{스타일}로 v{n}을 만들었어요"를 남긴다.
//   약속: tests/artist/style-version-routes.test.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { parseRegenRecord, regenSlotKey, type RegenRecord } from '@/lib/artist/style-versions'
import { nextStamp, readLiveImages, readVersionRows, regenProgressFor, type VersionRow } from '@/lib/artist/style-versions-server'

export const runtime = 'nodejs'

/** regen 칸을 바꾼다 — 읽은 뒤 행이 바뀌지 않았을 때만(바뀌었으면 다시 읽어 세 번까지). */
async function updateRegen(projectId: string, n: number, change: (record: RegenRecord, row: VersionRow) => RegenRecord | null): Promise<{ row: VersionRow; record: RegenRecord; changed: boolean } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = (await readVersionRows(projectId)).find((item) => item.n === n && item.is_current)
    const record = row ? parseRegenRecord(row.regen) : null
    if (!row || !record) return null
    const next = change(record, row)
    if (!next) return { row, record, changed: false }
    const { data, error } = await supabaseAdmin
      .from('artist_versions')
      .update({ regen: next as never, updated_at: nextStamp(row.updated_at) })
      .eq('id', row.id)
      .eq('updated_at', row.updated_at)
      .select('id')
    if (error) throw new Error(`regen update failed: ${error.message}`)
    if (Array.isArray(data) && data.length === 1) return { row, record: next, changed: true }
  }
  return null
}

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const body = (await req.json().catch(() => null)) as { projectId?: string; n?: unknown; action?: unknown; slots?: unknown } | null
    const access = await requireProjectAccess(req, body?.projectId)
    if (!access.ok) return access.response
    const projectId = access.projectId
    const n = typeof body?.n === 'number' && Number.isInteger(body.n) ? body.n : null
    if (n === null || (body?.action !== 'fail' && body?.action !== 'finish')) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    if (body.action === 'fail') {
      const asked = Array.isArray(body.slots) ? body.slots.filter((key): key is string => typeof key === 'string') : []
      const result = await updateRegen(projectId, n, (record) => {
        const known = new Set(record.slots.map(regenSlotKey))
        const add = asked.filter((key) => known.has(key) && !record.failed.includes(key))
        return add.length ? { ...record, failed: [...record.failed, ...add] } : null
      })
      return NextResponse.json({ ok: true, failed: result?.record.failed ?? [] })
    }

    const row = (await readVersionRows(projectId)).find((item) => item.n === n && item.is_current)
    const record = row ? parseRegenRecord(row.regen) : null
    if (!row || !record) return NextResponse.json({ ok: true, announced: false, complete: true, failed: 0 })
    const progress = await regenProgressFor(projectId, n, record, await readLiveImages(projectId))
    if (!progress.complete) return NextResponse.json({ ok: true, announced: false, complete: false, failed: progress.failed })
    if (record.doneAt) return NextResponse.json({ ok: true, announced: false, complete: true, failed: progress.failed })
    // 다 그렸다는 표시는 한 번만 — 두 화면이 같이 물어도 먼저 바꾼 쪽만 알린다.
    const finished = await updateRegen(projectId, n, (current) => (current.doneAt ? null : { ...current, doneAt: new Date().toISOString() }))
    return NextResponse.json({ ok: true, announced: !!finished?.changed, complete: true, failed: progress.failed })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[artist/versions/regen]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
