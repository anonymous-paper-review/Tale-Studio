// 씬 스토리 수정안은 원문과 비교하고, 준비 중이거나 충돌하면 적용 버튼을 제공하지 않는다.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { SceneStoryProposalCard } from '@/components/layout/scene-story-proposal-card'
import type { SceneStoryProposalView } from '@/lib/producer/scene-story-proposal'

const proposal: SceneStoryProposalView = {
  id: 'proposal-1', status: 'ready', feedback: '결말을 줄여줘', createdAt: '2026-10-01T00:00:00Z', stale: false,
  before: [{ sceneId: 's1', index: 0, beats: ['긴 결말'] }],
  after: [{ sceneId: 's1', index: 0, beats: ['짧은 결말'] }],
}
const render = (value = proposal) => renderToStaticMarkup(createElement(SceneStoryProposalCard, { projectId: 'scene-project', proposal: value }))

it('수정안이 준비되면 원문과 수정안을 함께 보여주고 적용하거나 버릴 수 있다', () => {
  const html = render()
  expect(html).toContain('긴 결말')
  expect(html).toContain('짧은 결말')
  expect(html).toContain('scene-story-proposal-apply')
  expect(html).toContain('scene-story-proposal-discard')
})

it('수정안과 같은 씬이 바뀌었으면 적용 대신 최신 내용으로 다시 제안할 수 있다', () => {
  const html = render({ ...proposal, stale: true })
  expect(html).not.toContain('scene-story-proposal-apply')
  expect(html).toContain('scene-story-proposal-regenerate')
})

it('수정안을 만드는 동안에는 취소만 제공하고 확정되지 않은 충돌 안내는 보이지 않는다', () => {
  const html = render({ ...proposal, status: 'generating', stale: true, after: [] })
  expect(html).toContain('scene-story-proposal-discard')
  expect(html).not.toContain('scene-story-proposal-apply')
  expect(html).not.toContain('scene-story-proposal-regenerate')
  expect(html).not.toContain('role="status"')
})

it('수정안 만들기가 실패하면 적용 대신 다시 제안하거나 버릴 수 있다', () => {
  const html = render({ ...proposal, status: 'failed' })
  expect(html).not.toContain('scene-story-proposal-apply')
  expect(html).toContain('scene-story-proposal-regenerate')
  expect(html).toContain('scene-story-proposal-discard')
})

it('본문이 같아도 씬 순서가 달라졌으면 비교에서 변경으로 보여준다', () => {
  const html = render({ ...proposal, after: [{ sceneId: 's1', index: 2, beats: ['긴 결말'] }] })
  expect(html).toContain('Compare 1 changed scenes')
  expect(html).toContain('Scene 1')
  expect(html).toContain('Scene 3')
})
