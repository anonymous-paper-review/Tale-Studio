// GET /api/artist/versions?projectId=…[&ensure=1] — 작품 스타일 기록(2026-10-28 오너, 프로토타입 A5 · AV).
//   버전 목록(새 버전부터 정렬은 화면이 한다) · 지금 버전 번호 · 남은 재생성 그림 · Storyboard 를 열었는지 ·
//   버전을 불러오는 중인지(restoring) · 다 불러오지 못한 버전(loadFailed — 다시 불러오거나 from 으로 돌아간다) ·
//   지금 작품 스타일(style — 답을 못 받은 불러오기 뒤에도 화면이 맞춘다, 2026-10-31 재검토).
//   v1 은 처음 필요할 때(기록 창을 열 때 ensure=1 · 재생성 · 불러오기) 지금 그림 · 지금 스타일로 만든다 — 화면을 열기만 해서는 만들지 않는다.
//   읽기 전에 기록을 바로잡는다 — 지금 버전이 없으면 마지막에 떠난 버전을 되살리고, 불러오다 멈춘 버전은 마저 불러온다(settleVersions).
//   artist_versions 는 서버 전용 표(RLS, 정책 없음)라 화면은 이 창구로만 읽는다. 약속: tests/artist/style-version-routes.test.ts · style-version-fixes.test.ts
import { NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/api/guard'
import { parseCustomStyle, parseRegenRecord } from '@/lib/artist/style-versions'
import {
  artistStyleLocked,
  ensureFirstVersion,
  loadFailedOf,
  readLiveImages,
  readVersionProject,
  readVersionRows,
  regenProgressFor,
  settleVersions,
  versionViews,
} from '@/lib/artist/style-versions-server'

export const runtime = 'nodejs'
// 멈춘 불러오기를 마저 하는 때가 있다(불러오기 창구와 같은 시간 제한).
export const maxDuration = 300

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const access = await requireProjectAccess(req, url.searchParams.get('projectId'))
    if (!access.ok) return access.response
    const projectId = access.projectId
    const project = await readVersionProject(projectId)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const [completed, firstLive, firstRows] = await Promise.all([artistStyleLocked(project), readLiveImages(projectId), readVersionRows(projectId)])
    const settled = await settleVersions(project, url.searchParams.get('ensure') === '1' ? await ensureFirstVersion(project, firstRows) : firstRows)
    const rows = settled.rows
    const [live, styled] = settled.changed ? await Promise.all([readLiveImages(projectId), readVersionProject(projectId)]) : [firstLive, project]
    const current = rows.find((row) => row.is_current) ?? null
    const record = current ? parseRegenRecord(current.regen) : null
    // 다 그렸다고 알린 재생성 · 그만둔 재생성은 더 볼 것이 없다 — 남은 그림이 있거나 아직 알리지 않았을 때만 진행을 준다.
    const regen = current && record && !record.doneAt && !record.cancelledAt ? await regenProgressFor(projectId, current.n, record, live) : null
    return NextResponse.json({
      versions: versionViews(rows, live),
      currentN: current?.n ?? 1,
      regen,
      completed,
      restoring: settled.restoringN !== null,
      loadFailed: (() => {
        const failed = current ? loadFailedOf(current.snapshot) : null
        return current && failed ? { n: current.n, from: failed.from } : null
      })(),
      style: { key: (styled ?? project).style_anchor_key || null, custom: parseCustomStyle((styled ?? project).custom_style_anchor) },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[artist/versions]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
