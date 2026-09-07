// 배경을 하나라도 완성하면 Writer로 안전하게 넘기고 비어 있으면 보내지 않는다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSettings } from '@/types'
import type { BackgroundSource } from '@/lib/producer-gate'

// projects.update(...).eq(...) resolves ok so the post-gate handoff path can proceed.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}))

import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

const readySettings: ProjectSettings = {
  playtime: 30, // D2 → 0 persons required, isolates the background gate
  genre: 'SF 스릴러',
  subGenre: '사이버펑크',
  format: 'horizontal_16:9',
  tone: ['dark'],
  targetEmotion: [],
  dialogueLanguage: 'ko',
}

const completeBackground: BackgroundSource = {
  localId: 'loc-1',
  locationId: 'neon_market',
  name: '네온 시장',
  visualDescription: '비에 젖은 네온 골목',
  purpose: '정보 거래 거점',
  origin: 'producer',
  userEdited: false,
  stale: false,
}
const incompleteBackground: BackgroundSource = { ...completeBackground, purpose: '' }

beforeEach(() => {
  useProducerStore.getState().reset()
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ projectId: 'proj-1' })
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('saveAndHandoff (Producer 인계 조건을 지킨다)', () => {
  it('완성된 배경이 없으면 Writer로 넘기지 않고 시작 요청도 보내지 않는다', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }))

    useProducerStore.setState({
      storyText: '스토리',
      storyReady: true,
      styleAnchorKey: 'style_a',
      projectSettings: readySettings,
      cast: [],
      backgrounds: [incompleteBackground],
    })

    const ok = await useProducerStore.getState().saveAndHandoff()

    expect(ok).toBe(false)
    expect(useProducerStore.getState().error).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('완성된 배경이 있으면 Writer를 시작하고 다음 단계로 넘긴다', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ runId: 'r1' }), { status: 200 }))

    useProducerStore.setState({
      storyText: '스토리',
      storyReady: true,
      styleAnchorKey: 'style_a',
      projectSettings: readySettings,
      cast: [],
      backgrounds: [completeBackground],
    })

    const ok = await useProducerStore.getState().saveAndHandoff()

    expect(ok).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith('/api/writer/start', expect.anything())
  })
})
