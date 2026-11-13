// 노드형 샷 노드 아래에도 카드와 같은 상태 꼬리를 단다 — 색만으로 말하지 않는다 (시안 D1 노드형 406:4051, 리드 검토 c ① · ②)
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  director: {
    projectId: 'project',
    generatingNodeIds: {},
    generateStoryboardImage: () => {},
    generateVideoForShot: () => {},
    videoBatchQueue: null,
    videoBatchCancelled: false,
  },
  rough: null as null | { status: string; url: string },
}))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: (select: (s: unknown) => unknown) => select({ sceneManifest: null, shots: [] }) }))
vi.mock('@/stores/project-store', () => ({ useProjectStore: (select: (s: unknown) => unknown) => select({ projectId: 'project' }) }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})
vi.mock('@/features/director/hooks/use-rough-storyboard', () => ({ useRoughStoryboard: () => state.rough }))
vi.mock('@/lib/generation-queue', () => ({
  useActiveGenerationJobs: () => [],
  useGenerationQueueStatus: () => 'ready',
  activeShotIds: () => new Set(),
}))
vi.mock('@/stores/director-store', () => ({
  useDirectorCanvasStore: (select: (s: unknown) => unknown) => select(state.director),
  getShotStage: () => 'rough',
  effectivePrompt: (d: { prompt: string }) => d.prompt,
}))
vi.mock('@xyflow/react', () => ({ NodeToolbar: () => null, Position: { Top: 'top' } }))
vi.mock('@/features/director/canvas-nodes/BaseNode', () => ({ BaseNode: ({ children }: { children: ReactNode }) => createElement('div', null, children) }))
vi.mock('@/features/director/canvas-nodes/LabeledHandle', () => ({ LabeledTargetHandle: () => null }))

import { ShotNode } from '@/features/director/canvas-nodes/ShotNode'

function shotHtml(image: { status: string; url: string } | null): string {
  return renderToStaticMarkup(createElement(ShotNode, {
    id: 'node-1',
    selected: false,
    data: {
      kind: 'shot', label: 'Shot 1', writerShotId: 'shot-1', prompt: '', camera: {}, lighting: { position: 'front' }, referenceImages: [],
      storyboardImage: image ? { ...image, errorMessage: 'fal 500', generatedAt: 0 } : null,
    },
  } as never))
}

beforeEach(() => {
  state.rough = null
})

describe('노드형 샷 노드 꼬리', () => {
  it('이미지가 필요한 샷 노드 아래 꼬리는 "● 이미지 필요"이고, 러프가 있으면 흐리게 "러프만 있음"을 붙인다', () => {
    // 왜: 시안 D1 노드형 — 노드형에는 주황 태그가 없어 꼬리가 상태를 말한다.
    state.rough = { status: 'completed', url: 'https://media.test/rough.jpg' }
    const html = shotHtml(null)
    expect(html).toContain('이미지 필요')
    expect(html).toContain('러프만 있음')
  })

  it('이미지가 있는 샷 노드 아래 꼬리는 카드와 같은 상태 이름 "이미지 완료"다', () => {
    // 왜: 카드 · 노드가 같은 판정(shot-state.ts) — 노드 테두리 파랑만으로 말하지 않는다.
    const html = shotHtml({ status: 'completed', url: 'https://media.test/shot-1.jpg' })
    expect(html).toContain('이미지 완료')
    expect(html).not.toContain('러프만 있음')
  })

  it('다시 만들기가 실패해도 옛 그림이 있으면 빨간 "생성 실패" 판 대신 꼬리에 "다시 만들기 실패"와 [다시 만들기]를 단다', () => {
    // 왜: 리드 검토 c ① — 옛 그림이 남아 있으면 이미지 완료로 세고 실패는 꼬리로만 알린다.
    const html = shotHtml({ status: 'failed', url: 'https://media.test/shot-1.jpg' })
    expect(html).toContain('다시 만들기 실패')
    expect(html).toContain('>다시 만들기<')
    expect(html).not.toContain('생성 실패')
  })

  it('그림이 없는 샷의 이미지 만들기가 실패하면 빨간 "생성 실패" 판과 "이미지 실패" 꼬리를 보인다', () => {
    // 왜: 보일 그림이 없을 때만 판을 띄운다(정상 경로 고정).
    const html = shotHtml({ status: 'failed', url: '' })
    expect(html).toContain('생성 실패')
    expect(html).toContain('이미지 실패')
  })
})
