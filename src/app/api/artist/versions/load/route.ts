// POST /api/artist/versions/load { projectId, n } — 생성 기록 [불러오기] · 채팅 카드 [v{n} · 스타일 불러오기](2026-10-28 오너, 프로토타입 AV · AY).
//   다시 그리지 않고 그 버전의 그림(인물 모습별 시트 · 대표 얼굴, 배경 모습별 그림)으로 돌리고 작품 스타일도 그 버전 것으로 바꾼다.
//   떠나는 지금 버전은 그림을 버전 폴더에 남긴다. 그 버전 뒤에 새로 생긴 인물 · 배경 · 모습은 지금 그림 그대로.
//   막는 때는 재생성과 같다. 되돌리다 실패하면 떠난 버전 그림 · 스타일로 다시 돌려 둔다(최선). 약속: tests/artist/style-version-routes.test.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { ARTIST_VERSION_CODES, openActiveRange, parseActive, parseCustomStyle, parseVersionSnapshot } from '@/lib/artist/style-versions'
import {
  artistStyleLocked,
  ensureFirstVersion,
  imagesDrawing,
  leaveCurrentVersion,
  nextStamp,
  readLiveImages,
  readVersionProject,
  readVersionRows,
  regenStillPending,
  restoreSnapshot,
  returnToVersion,
  setProjectStyle,
  withDesignL1,
} from '@/lib/artist/style-versions-server'

export const runtime = 'nodejs'
export const maxDuration = 60

const reject = (code: string, error: string, status = 409) => NextResponse.json({ error, code }, { status })

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const body = (await req.json().catch(() => null)) as { projectId?: string; n?: unknown } | null
    const access = await requireProjectAccess(req, body?.projectId)
    if (!access.ok) return access.response
    const projectId = access.projectId
    const n = typeof body?.n === 'number' && Number.isInteger(body.n) ? body.n : null
    if (n === null) return reject(ARTIST_VERSION_CODES.notFound, 'Version not found', 400)

    const project = await readVersionProject(projectId)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (await artistStyleLocked(project)) return reject(ARTIST_VERSION_CODES.completed, 'The style cannot be changed after Storyboard opens')

    const [rows, live] = await Promise.all([readVersionRows(projectId).then((found) => ensureFirstVersion(project, found)), readLiveImages(projectId)])
    const target = rows.find((row) => row.n === n)
    if (!target) return reject(ARTIST_VERSION_CODES.notFound, 'Version not found', 404)
    if (target.is_current) return reject(ARTIST_VERSION_CODES.alreadyCurrent, 'This version is already the current one')
    const snapshot = parseVersionSnapshot(target.snapshot)
    if (!snapshot) return reject(ARTIST_VERSION_CODES.notFound, 'Version not found', 404)
    const current = rows.find((row) => row.is_current)
    if (!current) return reject(ARTIST_VERSION_CODES.conflict, 'Another window changed the version first')
    if (await regenStillPending(projectId, current, live)) return reject(ARTIST_VERSION_CODES.regenPending, 'The images of the new version are still being drawn')
    if (await imagesDrawing(projectId)) return reject(ARTIST_VERSION_CODES.drawing, 'Images are being drawn')

    const at = new Date().toISOString()
    const left = await leaveCurrentVersion(project, current, live, at)
    if (!left.ok) return reject(ARTIST_VERSION_CODES.conflict, 'Another window changed the version first')

    const { data: activated, error: activateError } = await supabaseAdmin
      .from('artist_versions')
      .update({ is_current: true, active: openActiveRange(parseActive(target.active), at), updated_at: nextStamp(target.updated_at) })
      .eq('id', target.id)
      .eq('is_current', false)
      .eq('updated_at', target.updated_at)
      .select('id')
    if (activateError || !Array.isArray(activated) || activated.length !== 1) {
      await returnToVersion(current)
      if (!activateError || activateError.code === '23505') return reject(ARTIST_VERSION_CODES.conflict, 'Another window changed the version first')
      throw new Error(`version activate failed: ${activateError.message}`)
    }

    try {
      // 그 버전 때의 그림 지시 그림체 값으로도 돌아간다 — 남긴 값이 없으면(예전 버전) 지금 값을 둔다.
      const designTokens = snapshot.look?.l1 ? withDesignL1(project.design_tokens, snapshot.look.l1) : undefined
      await setProjectStyle(projectId, target.style_anchor_key, target.custom_style_anchor, designTokens)
      await restoreSnapshot(projectId, snapshot, live, at)
    } catch (e) {
      // 되돌리다 멈췄으면 떠난 버전 그림 · 스타일로 다시 돌려 둔다 — 반쯤 섞인 그림으로 남지 않게(최선).
      console.error('[artist/versions/load] restore failed, returning:', e instanceof Error ? e.message : e)
      const fresh = await readLiveImages(projectId).catch(() => live)
      await restoreSnapshot(projectId, left.frozen, fresh, at).catch(() => null)
      await setProjectStyle(projectId, project.style_anchor_key, project.custom_style_anchor, project.design_tokens).catch(() => null)
      await supabaseAdmin.from('artist_versions').update({ is_current: false, active: target.active as never }).eq('id', target.id)
      await returnToVersion(current)
      throw e
    }
    return NextResponse.json({ ok: true, n, styleKey: target.style_anchor_key, customStyle: parseCustomStyle(target.custom_style_anchor) })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[artist/versions/load]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
