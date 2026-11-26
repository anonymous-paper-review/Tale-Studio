// 샷 상세 제목 아래 줄에는 씬 이름과 길이만 보이고 이미지 생성 프롬프트 글은 보이지 않는다 — 프롬프트는 이미지 탭의 프롬프트 칸에 그대로 있다 (오너 2026-11-26 D3)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/generation-queue', async (original) => ({
  ...await original<typeof import('@/lib/generation-queue')>(),
  useActiveGenerationJobs: () => [],
  useGenerationQueueStatus: () => 'ready',
}))
vi.mock('@/lib/use-debug-prompts', () => ({ useDebugPrompts: () => false }))
vi.mock('@/lib/billing/use-take-balance', () => ({ useTakeBalance: () => ({ balance: 100, mode: 'shadow', loading: false }) }))

import { DirectorShotDetail } from '@/features/director/shot-detail/director-shot-detail'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectFormatStore } from '@/stores/project-format-store'

const PROMPT = 'A woman under a yellow umbrella waits at a rainy crosswalk, neon reflections on the wet asphalt'
const IMAGE = { url: 'https://media.test/start.png', status: 'completed' as const, errorMessage: null, generatedAt: 1, frames: { start: 'https://media.test/start.png', direction: 'https://media.test/dir.png', end: 'https://media.test/end.png' } }
let shotId = ''

function setLocale(locale: 'ko' | 'en') {
  useLocaleStore.setState({ locale })
  Object.assign(useLocaleStore.getInitialState(), useLocaleStore.getState())
}
const render = (layout: 'popup' | 'panel') => {
  Object.assign(director.getInitialState(), director.getState())
  Object.assign(useProjectFormatStore.getInitialState(), useProjectFormatStore.getState())
  return renderToStaticMarkup(createElement(DirectorShotDetail, { shotNodeId: shotId, initialTab: 'image', layout, onClose: () => {} }))
}
/** 제목 아래 한 줄(씬 · 길이). */
const metaLine = (out: string) => out.match(/<p[^>]*data-testid="shot-detail-meta"[^>]*>([^<]*)<\/p>/)?.[1] ?? null

beforeEach(() => {
  director.setState({ projectId: 'meta-project', nodes: [], edges: [], realBatchBusy: false, generatingNodeIds: {} })
  const sceneId = director.getState().addSceneNode({ x: 0, y: 0 }, 'sc_01')
  shotId = director.getState().addShotNode(sceneId, { x: 0, y: 0 })
  director.getState().updateNodeData<'shot'>(shotId, { writerShotId: 'sh_01_01', parentSceneNodeId: sceneId, storyboardImage: IMAGE, derivedPrompt: PROMPT, durationSeconds: 5 })
  useProjectFormatStore.setState({ format: 'horizontal_16:9' })
  setLocale('en')
})

describe('샷 상세 제목 아래 줄', () => {
  it('샷 상세 제목 아래 줄에는 씬 이름과 길이만 보이고 이미지 생성 프롬프트 글은 보이지 않는다', () => {
    // 왜: 오너 2026-11-26 D3 — 샷 카드를 눌러 팝업을 열면 제목 아래에 긴 이미지 생성 프롬프트가 먼저 보였다.
    //   스토리보드 보기 팝업과 노드 보기 왼쪽 패널은 같은 상세라(이미 있는 약속) 둘 다 같다.
    for (const layout of ['popup', 'panel'] as const) {
      const out = render(layout)
      expect(metaLine(out), layout).toBe('Scene 1 · 5s')
      expect(out.split('yellow umbrella').length - 1, layout).toBe(1)
    }
    setLocale('ko')
    expect(metaLine(render('popup'))).toBe('씬 1 · 5초')
  })

  it('이미지 탭의 프롬프트 칸에는 지금 프롬프트가 그대로 있어 고칠 수 있다', () => {
    // 왜: 정상 경로 고정 — 오너는 제목 아래 글만 지우라고 했다. 프롬프트 자체와 고치는 칸은 그대로다.
    const out = render('popup')
    expect(out).toContain('>Prompt<')
    expect(out).toMatch(new RegExp(`<textarea[^>]*>${PROMPT}</textarea>`))
  })
})
