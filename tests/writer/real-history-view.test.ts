// Storyboard 샷 상세를 지난 판으로 열면 큰 그림이 그 판이고 "보는 판 v1 · 지금 그림 v2"와 [채택] · [지금 그림 보기]가 보인다 (오너 2026-11-26 S3)
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const version = (n: number) => ({
  id: `job-${n}`, n, url: `https://x/v${n}-s.png`, generatedAt: n, source: 'generated',
  frames: { start: `https://x/v${n}-s.png`, direction: `https://x/v${n}-d.png`, end: `https://x/v${n}-e.png` },
})
const real = { url: 'https://x/v2-s.png', status: 'completed', errorMessage: null, generatedAt: 2, frames: version(2).frames, versions: [version(1), version(2)], versionId: 'job-2', rev: 2 }
const conti = { url: 'https://x/rough-start.png', status: 'completed', errorMessage: null, generatedAt: 1, frames: { start: 'https://x/rough-start.png', direction: 'https://x/rough-dir.png', end: 'https://x/rough-end.png' } }

const data = vi.hoisted(() => ({
  project: { projectId: 'p1' },
  writer: {
    sceneManifest: { scenes: [{ sceneId: 's1', location: '', timeOfDay: '' }], characters: [], locations: [] },
    shots: [] as Array<Record<string, unknown>>,
  },
  images: { projectId: 'p1', images: {} as Record<string, unknown> },
  jobs: [] as unknown[],
  locale: 'ko' as 'ko' | 'en',
}))
vi.mock('@/stores/project-store', () => ({ useProjectStore: (select: (s: unknown) => unknown) => select(data.project) }))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: (select: (s: unknown) => unknown) => select(data.writer) }))
vi.mock('@/lib/storyboard/real-images-store', () => ({ useStoryboardRealImages: (select: (s: unknown) => unknown) => select(data.images) }))
vi.mock('@/lib/generation-queue', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), useActiveGenerationJobs: () => data.jobs }))
vi.mock('@/stores/global-chat-store', () => ({ useGlobalChatStore: Object.assign(() => null, { getState: () => ({}) }) }))
vi.mock('@/stores/chat-ui-store', () => ({ useChatUiStore: Object.assign(() => null, { getState: () => ({}) }) }))
vi.mock('@/components/lumi/lumi', () => ({ Lumi: () => null }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useLocale: () => data.locale, useT: () => (text: string, params?: Record<string, string | number>) => translate(data.locale, text, params) }
})
// 창은 열려 있을 때 내용을 그대로 그린다(정적 렌더에는 창 겉껍데기가 없다 — real-dialog 와 같은 방법).
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

import { RealShotDialog } from '@/features/storyboard/real-shot-dialog'
import { useBoardUiStore } from '@/features/writer/board-ui-store'

const html = () => {
  Object.assign(useBoardUiStore.getInitialState(), useBoardUiStore.getState())
  return renderToStaticMarkup(createElement(RealShotDialog, { shotId: 'b', onOpenChange: () => {} })).replace(/&amp;/g, '&')
}

beforeEach(() => {
  data.writer.shots = [{ shotId: 'b', sceneId: 's1', shotType: 'MS', durationSeconds: 5, actionDescription: '미나가 돌아본다', dialogueLines: [], roughStoryboard: conti }]
  data.images = { projectId: 'p1', images: { b: real } }
  data.jobs = []
  data.locale = 'ko'
  useBoardUiStore.setState({ shotEditId: null, shotEditVersionId: null } as never)
})

describe('Storyboard 샷 상세의 지난 판', () => {
  it('샷 상세를 지난 판으로 열면 큰 그림이 그 판이고 "보는 판 v1 · 지금 그림 v2"와 [채택] · [지금 그림 보기]가 보인다', () => {
    // 왜: 오너 S3 "과거 클릭 후 상세페이지로 들어가면 '채택'" — Director 상세와 같은 말 · 같은 줄(시안 없음).
    useBoardUiStore.getState().openShotVersion('b', 'job-1')
    const out = html()
    expect(out).toContain('data-testid="storyboard-detail-viewing"')
    expect(out).toContain('보는 판 v1 · 지금 그림 v2')
    expect(out).toContain('>채택<')
    expect(out).toContain('>지금 그림 보기<')
    const big = out.slice(0, out.indexOf('data-testid="storyboard-detail-viewing"'))
    expect(big).toContain('https://x/v1-s.png')
    expect(big).not.toContain('https://x/v2-s.png')
    data.locale = 'en'
    expect(html()).toContain('Viewing v1 · Current v2')
  })

  it('지난 판 없이 열면(카드 누르기 · 대사 탭 연필) 지금 그림만 보이고 보는 판 줄이 없다', () => {
    // 왜: 정상 경로 고정 — 다른 길로 연 상세는 지금처럼.
    useBoardUiStore.getState().setShotEditId('b')
    const out = html()
    expect(out).not.toContain('storyboard-detail-viewing')
    expect(out).toContain('https://x/v2-s.png')
  })
})
