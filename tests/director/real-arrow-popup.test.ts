// Director 샷 팝업 이미지 탭의 [화살표 고치기](N4b) — Storyboard 상세와 같은 실사 편집 칸을 겹창으로 여는지 · 보이는 때 · 그리는 중 끄기 — 를 검사한다
import { readFileSync } from 'node:fs'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queue = vi.hoisted(() => ({ jobs: [] as Array<{ id: string; kind: string; target: Record<string, unknown>; cancelledAt?: string | null }> }))
vi.mock('@/lib/generation-queue', async (original) => ({
  ...await original<typeof import('@/lib/generation-queue')>(),
  useActiveGenerationJobs: () => queue.jobs,
  useGenerationQueueStatus: () => 'ready',
}))
vi.mock('@/lib/use-debug-prompts', () => ({ useDebugPrompts: () => false }))
vi.mock('@/lib/billing/use-take-balance', () => ({ useTakeBalance: () => ({ balance: 100, mode: 'shadow', loading: false }) }))
// 창은 열려 있을 때 내용을 그대로 그린다(정적 렌더에는 창 겉껍데기가 없다).
vi.mock('@/components/ui/dialog', async () => {
  const { createElement: h } = await import('react')
  type Props = { children?: ReactNode; className?: string; open?: boolean }
  const plain = (tag: string) => ({ children, className }: Props) => h(tag, { className }, children)
  return {
    Dialog: ({ open, children }: Props) => (open ? children : null),
    DialogContent: plain('div'),
    DialogHeader: plain('div'),
    DialogFooter: plain('div'),
    DialogTitle: plain('h2'),
    DialogDescription: plain('p'),
  }
})

import { DirectorShotDetail } from '@/features/director/shot-detail/director-shot-detail'
import { RealArrowEditDialog } from '@/features/storyboard/real-arrow-edit'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectFormatStore } from '@/stores/project-format-store'
import { withStoryboardVersion } from '@/lib/director/storyboard-image-versions'

// 이 시험을 위해 지은 샷 — Writer 샷 sh_01_01 에 이어진 실사 세 장(v1 · v2).
const F1 = { start: 'https://media.test/v1-start.png', direction: 'https://media.test/v1-dir.png', end: 'https://media.test/v1-end.png' }
const F2 = { start: 'https://media.test/start.png', direction: 'https://media.test/dir.png', end: 'https://media.test/end.png' }
const IMAGE = withStoryboardVersion(withStoryboardVersion(null, { id: 'g1', url: F1.start, frames: F1, generatedAt: 1, source: 'generated' }, { select: true }), { id: 'g2', url: F2.start, frames: F2, generatedAt: 2, source: 'generated' }, { select: true })
let shotId = ''
function syncStores() {
  Object.assign(director.getInitialState(), director.getState())
  Object.assign(useProjectFormatStore.getInitialState(), useProjectFormatStore.getState())
  Object.assign(useLocaleStore.getInitialState(), useLocaleStore.getState())
}
const render = () => {
  syncStores()
  return renderToStaticMarkup(createElement(DirectorShotDetail, { shotNodeId: shotId, initialTab: 'image', layout: 'popup', onClose: () => {} }))
}
function buttonTag(out: string, testId: string): string {
  const at = out.indexOf(`data-testid="${testId}"`)
  expect(at, testId).toBeGreaterThan(-1)
  const start = out.lastIndexOf('<button', at)
  return out.slice(start, out.indexOf('>', start) + 1)
}

beforeEach(() => {
  queue.jobs = []
  director.setState({ projectId: 'detail-project', nodes: [], edges: [], realBatchBusy: false, generatingNodeIds: {}, detailNodeId: null, detailVersionId: null })
  shotId = director.getState().addShotNode(null, { x: 0, y: 0 })
  director.getState().updateNodeData<'shot'>(shotId, { writerShotId: 'sh_01_01', storyboardImage: IMAGE })
  useProjectFormatStore.setState({ format: 'horizontal_16:9' })
  useLocaleStore.setState({ locale: 'en' })
})

describe('Director 샷 팝업의 [화살표 고치기]', () => {
  // 왜(같이 정한 것 · 리드 "같은 부품이면 둘 다"): Director 팝업도 같은 실사 시트를 보인다 — Storyboard 상세와 같은 칸(RealArrowEditPane)을 겹창으로 연다.
  //   시안 D6 에 없는 단추라 시안 없음(혼자 정한 것 p).
  it('Director 샷 팝업 이미지 탭에서도 같은 편집기로 고칠 수 있다', () => {
    const out = render()
    expect(out).toContain('Edit arrows')
    expect(buttonTag(out, 'shot-detail-edit-arrows')).not.toContain('disabled=""')
    const tab = readFileSync('src/features/director/shot-detail/shot-image-tab.tsx', 'utf8')
    expect(tab).toMatch(/<RealArrowEditDialog\b/)
    expect(readFileSync('src/features/storyboard/real-shot-dialog.tsx', 'utf8')).toMatch(/<RealArrowEditPane\b/)
    expect(readFileSync('src/features/storyboard/real-arrow-edit.tsx', 'utf8')).toMatch(/<RealArrowEditPane projectId=\{projectId\}/)
    const dialog = renderToStaticMarkup(createElement(RealArrowEditDialog, { open: true, onOpenChange: () => {}, projectId: 'p1', shotId: 'sh_01_01', image: IMAGE, drawing: false, onChanged: async () => {} }))
    expect(dialog).toContain('data-testid="real-arrow-edit"')
    expect(dialog).toContain('data-testid="directing-editor-save-row"')
    expect(dialog).toContain('Edit the arrows on the middle frame')
    expect(dialog).toContain('When you save, the end frame is redrawn to match your arrows. It takes over a minute.')
    // 겹창은 창 머리가 제목을 대신한다 — [그림으로 돌아가기]는 없다(창 닫기).
    expect(dialog).not.toContain('Back to the picture')
  })

  // 왜(혼자 정한 것 h · g): 지금 그림만 고친다 — 지난 판을 보는 동안 · 세 장이 없는 그림 · 캔버스에서만 만든 샷(실사 시트가 서버에 없음)에는 입구가 없다.
  //   그 샷 실사를 그리는 중이면 끈다.
  it('Director 팝업의 [화살표 고치기]는 지금 그림이 세 장 실사인 Writer 샷에만 있고 그 샷을 그리는 중이면 꺼진다', () => {
    queue.jobs = [{ id: 'job-1', kind: 'shot_storyboard', target: { writerShotId: 'sh_01_01', realEnd: { versionId: 'g2', direction: F2.direction, line: 'x' } }, cancelledAt: null }]
    expect(buttonTag(render(), 'shot-detail-edit-arrows')).toContain('disabled=""')
    queue.jobs = []
    director.setState({ detailNodeId: shotId, detailVersionId: 'g1' })
    expect(render()).not.toContain('data-testid="shot-detail-edit-arrows"')
    director.setState({ detailNodeId: null, detailVersionId: null })
    director.getState().updateNodeData<'shot'>(shotId, { storyboardImage: { url: F2.start, status: 'completed', errorMessage: null, generatedAt: 3 } })
    expect(render()).not.toContain('data-testid="shot-detail-edit-arrows"')
    director.getState().updateNodeData<'shot'>(shotId, { storyboardImage: IMAGE, writerShotId: undefined })
    expect(render()).not.toContain('data-testid="shot-detail-edit-arrows"')
  })
})
