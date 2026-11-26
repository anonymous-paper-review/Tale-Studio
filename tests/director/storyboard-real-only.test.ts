// Director 스토리보드 보기는 러프 · 실사 단추 없이 늘 실사 카드를 보이고, Alt+←/→ 는 노드 · 스토리보드 두 칸만 오간다 (오너 2026-11-26 D1)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/generation-queue', async (original) => ({
  ...await original<typeof import('@/lib/generation-queue')>(),
  useActiveGenerationJobs: () => [],
  useGenerationQueueStatus: () => 'ready',
  useGenerationBatches: () => [],
}))
vi.mock('@/lib/billing/use-take-balance', () => ({ useTakeBalance: () => ({ balance: 100, mode: 'shadow', loading: false }) }))

import { StoryboardGridView } from '@/features/director/canvas-views/StoryboardGridView'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'

const page = () => readFileSync('src/app/studio/director/page.tsx', 'utf8')
/** 툴바(PaletteBar) 함수 몸 — 다음 맨 바깥 함수 앞까지. */
function paletteBar(): string {
  const src = page()
  const start = src.indexOf('function PaletteBar(')
  expect(start).toBeGreaterThan(-1)
  return src.slice(start, src.indexOf('\nfunction ', start + 10))
}
function setLocale(locale: 'ko' | 'en') {
  useLocaleStore.setState({ locale })
  Object.assign(useLocaleStore.getInitialState(), useLocaleStore.getState())
}
function renderGrid(): string {
  Object.assign(director.getInitialState(), director.getState())
  return renderToStaticMarkup(createElement(StoryboardGridView, { zoomLevel: 3, onZoomLevelChange: () => {} }))
}

beforeEach(() => {
  director.setState({ projectId: 'real-only-project', nodes: [], edges: [], realBatchBusy: false, generatingNodeIds: {} })
  const sceneId = director.getState().addSceneNode({ x: 0, y: 0 }, 'sc_01')
  const shotId = director.getState().addShotNode(sceneId, { x: 0, y: 0 })
  director.getState().updateNodeData<'shot'>(shotId, { writerShotId: 'sh_01_01', parentSceneNodeId: sceneId })
  setLocale('en')
})

describe('Director 스토리보드 보기 = 실사만', () => {
  it('Director 스토리보드 보기에는 러프 · 실사 단추가 없다', () => {
    // 왜: 오너 2026-11-26 D1 "스토리보드뷰에서 러프/실사 버튼 없애기" — 러프는 Writer 콘티 · Storyboard 가 맡는다.
    const bar = paletteBar()
    expect(bar).not.toContain("t('Rough')")
    expect(bar).not.toContain("t('Real')")
    expect(bar).not.toContain('setStoryboardMediaMode')
  })

  it('Director 스토리보드 보기의 카드는 러프를 골라 둔 브라우저에서도 늘 실사 카드다', () => {
    // 왜: 처음 여는 프로젝트는 브라우저 기억이 러프로 시작하고(director-store), 예전에 러프를 골라 둔 브라우저도 그 값이 남아 있다 —
    //   단추가 없어진 뒤에 러프 카드가 보이면 실사로 돌아갈 길이 없다.
    director.setState({ storyboardMediaMode: 'previz' })
    const en = renderGrid()
    expect(en).toContain('data-shot-state="image_needed"')
    expect(en).not.toMatch(/Rough needed|>Rough</)
    setLocale('ko')
    const ko = renderGrid()
    expect(ko).toContain('data-shot-state="image_needed"')
    expect(ko).not.toContain('러프')
  })

  it('Alt+←/→ 는 노드 보기와 스토리보드 보기 두 칸만 오간다', () => {
    // 왜: 러프 칸이 없어졌다 — 예전 세 칸(노드 → 러프 → 실사)이면 같은 실사 화면에서 한 번 더 눌러야 노드로 돌아갔다.
    expect(page()).toMatch(/const DIRECTOR_VIEW_CYCLE = \['node', 'storyboard'\] as const/)
  })
})
