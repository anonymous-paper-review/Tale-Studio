// 늦게 불러온 스타일 목록이 채팅에서 고른 값이나 다른 프로젝트의 뱃지를 덮지 않는다.
import { beforeEach, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ read: vi.fn(), catalog: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => db.read() }) }) }) }),
  createCatalogClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ order: () => db.catalog() }) }) }) }),
}))
import { useProducerStore as producer } from '@/stores/producer-store'
import { useProjectStore as project } from '@/stores/project-store'

beforeEach(() => {
  vi.clearAllMocks()
  project.getState().resetProject()
  producer.getState().reset()
  project.setState({ projectId: 'style-project' })
  db.catalog.mockResolvedValue({ data: [{ key: 'real', label: '실사' }] })
})

it('스타일 목록을 기다리는 동안 새 스타일을 선택하면 늦은 조회로 선택을 덮지 않는다', async () => {
  // 왜: Hero와 채팅이 목록을 함께 불러오므로 먼저 시작한 조회가 새 뱃지를 미정으로 되돌릴 수 있다.
  let finish!: (value: unknown) => void
  db.read.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const loading = producer.getState().loadStyleAnchors()
  producer.getState().applyCustomStyleAnchor({ key: 'custom_new', url: 'https://example.com/style.png', label: '새 그림체', medium: 'watercolor' })
  finish({ data: { style_anchor_key: null, custom_style_anchor: null } })
  await loading
  expect(producer.getState().styleAnchorKey).toBe('custom_new')
  expect(producer.getState().customStyleAnchor?.label).toBe('새 그림체')
  expect(producer.getState().styleAnchors[0].label).toBe('실사')
})

it('스타일 목록을 기다리는 동안 프로젝트를 바꾸면 새 프로젝트의 선택을 유지한다', async () => {
  // 왜: 이전 프로젝트의 늦은 조회가 현재 Hero 뱃지로 표시되면 안 된다.
  let finish!: (value: unknown) => void
  db.read.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const loading = producer.getState().loadStyleAnchors()
  project.setState({ projectId: 'another-project' })
  finish({ data: { style_anchor_key: 'old-project-style', custom_style_anchor: null } })
  await loading
  expect(producer.getState().styleAnchorKey).toBeNull()
})
