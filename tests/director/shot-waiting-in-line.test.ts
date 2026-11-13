// 영상 묶음에서 차례를 기다리는 샷은 이미지 노드 꼬리에 "순서 기다리는 중"을 쓴다 (11/5 시안 DG, 리드 2026-11-09)
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  director: {
    projectId: 'project',
    generatingNodeIds: {},
    generateStoryboardImage: () => {},
    generateVideoForShot: () => {},
    videoBatchQueue: null as { jobIds: string[]; pendingShotIds: string[] } | null,
    videoBatchCancelled: false,
  },
}))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: (select: (s: unknown) => unknown) => select({ sceneManifest: null, shots: [] }) }))
vi.mock('@/stores/project-store', () => ({ useProjectStore: (select: (s: unknown) => unknown) => select({ projectId: 'project' }) }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})
vi.mock('@/features/director/hooks/use-rough-storyboard', () => ({ useRoughStoryboard: () => null }))
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

function shotHtml(image: boolean): string {
  return renderToStaticMarkup(createElement(ShotNode, {
    id: 'node-1',
    selected: false,
    data: {
      kind: 'shot', label: 'Shot 1', writerShotId: 'shot-1', prompt: '', camera: {}, lighting: { position: 'front' }, referenceImages: [],
      storyboardImage: image ? { status: 'completed', url: 'https://media.test/shot-1.jpg' } : null,
    },
  } as never))
}

beforeEach(() => {
  state.director.videoBatchQueue = null
  state.director.videoBatchCancelled = false
})

describe('혼자 정한 것', () => {
  // 왜: 시안 DG. 묶음에서 아직 안 낸 샷은 꼬리에 "순서 기다리는 중"이라고 쓴다(리드 b7). 그림이 다 된 샷도 같다:
  //   그 샷의 영상이 차례를 기다리는 중이라는 뜻이고, 그림이 된 것은 카드의 그림이 이미 보여 준다.
  it.each([['그림이 없는 샷', false], ['그림이 다 된 샷', true]] as const)(
    "묶음에서 차례를 기다리는 샷은 꼬리에 '순서 기다리는 중'을 쓴다 (%s)",
    (_label, image) => {
      state.director.videoBatchQueue = { jobIds: ['job-0'], pendingShotIds: ['shot-0', 'shot-1'] }

      const html = shotHtml(image)

      expect(html).toContain('순서 기다리는 중')
      expect(html).not.toContain('대기 중')
      expect(html).not.toContain('완료')
    },
  )

  // 왜: 정상 경로 고정. 묶음이 없거나 그 샷이 차례에 없으면 꼬리는 카드와 같은 샷 상태 이름이다
  //   (시안 D1 노드형 406:4051 "● 이미지 필요", 리드 검토 c ② — 옛 '완료' · '대기 중'에서 바뀜 2026-11-14).
  it("묶음이 없으면 샷 꼬리는 샷 상태 이름 '이미지 완료' · '이미지 필요'다", () => {
    expect(shotHtml(true)).toContain('이미지 완료')
    expect(shotHtml(false)).toContain('이미지 필요')

    state.director.videoBatchQueue = { jobIds: ['job-0'], pendingShotIds: ['shot-9'] }
    expect(shotHtml(true)).toContain('이미지 완료')
    expect(shotHtml(true)).not.toContain('순서 기다리는 중')
  })

  // 왜: 멈추기를 누르면 남은 샷은 만들지 않는다. 서버가 멈춤을 알려 오기 전이라도 차례를 기다리는 것처럼 보이지 않는다.
  it("묶음을 멈추는 중이면 샷 꼬리에 '순서 기다리는 중'을 쓰지 않는다", () => {
    state.director.videoBatchQueue = { jobIds: ['job-0'], pendingShotIds: ['shot-1'] }
    state.director.videoBatchCancelled = true

    expect(shotHtml(true)).not.toContain('순서 기다리는 중')
  })
})
