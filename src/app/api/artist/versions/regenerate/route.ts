// POST /api/artist/versions/regenerate { projectId, styleAnchorKey } — Artist [재생성하기] → [다시 만들기](2026-10-28 오너, 프로토타입 A6).
//   지금 버전의 그림을 버전 폴더에 남기고(기록), 작품 스타일을 고른 것으로 바꾸고, 새 버전 v{n+1}을 연다.
//   그림은 화면이 칸마다 지금의 [다시 만들기]와 같은 길(generate-sheet · generate-world)로 그린다 — 여기서는 그릴 칸 목록을 돌려준다.
//   막는 때: Storyboard 를 연 뒤 · 그리는 중 · 앞 재생성 그림이 남았을 때 · 버전을 불러오는 중 · 다른 창이 먼저 바꿨을 때.
//   약속: tests/artist/style-version-routes.test.ts · style-version-fixes.test.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { ARTIST_VERSION_CODES, buildRegenPlan, parseCustomStyle, styleLookTokens } from '@/lib/artist/style-versions'
import {
  artistStyleLocked,
  designL1,
  ensureFirstVersion,
  failStaleImageJobs,
  imagesDrawing,
  leaveCurrentVersion,
  readLiveImages,
  readVersionProject,
  readVersionRows,
  regenStillPending,
  returnToVersion,
  setProjectStyle,
  settleVersions,
  withDesignL1,
  type VersionProject,
} from '@/lib/artist/style-versions-server'

export const runtime = 'nodejs'
// 떠나는 버전의 그림을 모두 버전 폴더에 복사한다 — 큰 작품은 오래 걸린다(다른 무거운 창구와 같은 시간 제한).
export const maxDuration = 300

const reject = (code: string, error: string, status = 409) => NextResponse.json({ error, code }, { status })

/** 고른 스타일 — 지금 스타일(직접 올린 그림체 포함)이거나 쓸 수 있는 카탈로그 스타일. medium = 그림 지시 그림체 값을 고를 매체. */
async function chosenStyle(project: VersionProject, key: string): Promise<{ key: string; custom: unknown; medium: string | null } | null> {
  const custom = parseCustomStyle(project.custom_style_anchor)
  if (key === project.style_anchor_key && custom) return { key, custom: project.custom_style_anchor, medium: custom.medium }
  if (key.startsWith('custom')) return null
  const { data, error } = await supabaseAdmin.from('style_anchors').select('key, is_active, medium').eq('key', key).maybeSingle()
  if (error) throw new Error(`style read failed: ${error.message}`)
  const row = data as { is_active?: boolean; medium?: string | null } | null
  if (key === project.style_anchor_key) return { key, custom: null, medium: row?.medium ?? null }
  return row?.is_active ? { key, custom: null, medium: row.medium ?? null } : null
}

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const body = (await req.json().catch(() => null)) as { projectId?: string; styleAnchorKey?: string } | null
    const access = await requireProjectAccess(req, body?.projectId)
    if (!access.ok) return access.response
    const projectId = access.projectId
    const styleKey = typeof body?.styleAnchorKey === 'string' ? body.styleAnchorKey.trim() : ''
    if (!styleKey) return reject(ARTIST_VERSION_CODES.unknownStyle, 'Pick a style', 400)

    const project = await readVersionProject(projectId)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (await artistStyleLocked(project)) return reject(ARTIST_VERSION_CODES.completed, 'The style cannot be changed after Storyboard opens')
    const style = await chosenStyle(project, styleKey)
    if (!style) return reject(ARTIST_VERSION_CODES.unknownStyle, 'Unknown style', 400)

    const settled = await settleVersions(project, await readVersionRows(projectId).then((found) => ensureFirstVersion(project, found)))
    if (settled.restoringN !== null) return reject(ARTIST_VERSION_CODES.restoring, 'A version is still being loaded')
    const rows = settled.rows
    const current = rows.find((row) => row.is_current)
    if (!current) return reject(ARTIST_VERSION_CODES.conflict, 'Another window changed the version first')
    const live = await readLiveImages(projectId)
    if (await regenStillPending(projectId, current, live)) return reject(ARTIST_VERSION_CODES.regenPending, 'The images of the new version are still being drawn')
    if (await imagesDrawing(projectId)) return reject(ARTIST_VERSION_CODES.drawing, 'Images are being drawn')

    // 지금 그림이 이 작품에 올린 그림(그대로 쓰기)인 칸은 다시 그리지 않는다 — 버전 기록에는 남는다(2026-10-31 오너 결정 C).
    const slots = buildRegenPlan({
      projectId,
      characters: live.characters.map((c) => ({ characterId: c.character_id, entityType: c.entity_type })),
      appearances: live.appearances.map((a) => ({ characterId: a.character_id, appearanceKey: a.appearance_key, isDefault: a.is_default, sheetUrl: a.sheet_url })),
      locations: live.locations.map((l) => ({ locationId: l.location_id, wideShot: l.wide_shot })),
      locationAppearances: live.locationAppearances.map((a) => ({ locationId: a.location_id, appearanceKey: a.appearance_key, wideShot: a.wide_shot })),
    })
    if (slots.length === 0) return reject(ARTIST_VERSION_CODES.nothingToDraw, 'There are no characters or backgrounds to remake')
    await failStaleImageJobs(projectId)

    const at = new Date().toISOString()
    const left = await leaveCurrentVersion(project, current, live, at)
    if (!left.ok) return reject(ARTIST_VERSION_CODES.conflict, 'Another window changed the version first')

    const n = Math.max(...rows.map((row) => row.n)) + 1
    const { error: insertError } = await supabaseAdmin.from('artist_versions').insert({
      project_id: projectId,
      n,
      style_anchor_key: style.key,
      custom_style_anchor: (style.custom ?? null) as never,
      snapshot: null,
      is_current: true,
      active: [{ from: at, to: null }],
      regen: { startedAt: at, slots, failed: [], doneAt: null, fromN: current.n },
      created_at: at,
      updated_at: at,
    })
    if (insertError) {
      await returnToVersion(current, left)
      if (insertError.code === '23505') return reject(ARTIST_VERSION_CODES.conflict, 'Another window changed the version first')
      throw new Error(`version insert failed: ${insertError.message}`)
    }
    try {
      // 스타일이 바뀌면 그림 지시의 그림체 값(매체 · 선 · 형태 · 질감)도 새 스타일 것으로 — 옛 값이 남으면 새 스타일로 그려도 옛 그림체로 나온다.
      const designTokens = style.key === project.style_anchor_key
        ? undefined
        : withDesignL1(project.design_tokens, styleLookTokens(style.medium, designL1(project.design_tokens)))
      await setProjectStyle(projectId, style.key, style.custom, designTokens)
    } catch (e) {
      // 스타일을 못 바꿨으면 새 버전을 거두고 떠난 버전으로 돌아간다 — 그린 그림이 엉뚱한 스타일로 남지 않게.
      await supabaseAdmin.from('artist_versions').delete().eq('project_id', projectId).eq('n', n)
      await returnToVersion(current, left)
      throw e
    }
    return NextResponse.json({ ok: true, n, slots })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[artist/versions/regenerate]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
