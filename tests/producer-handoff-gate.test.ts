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

describe('saveAndHandoff producer gate enforcement', () => {
  it('blocks handoff and never calls writer/start when no complete background exists', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }))

    useProducerStore.setState({
      storyText: '스토리',
      storyReady: true,
      projectSettings: readySettings,
      cast: [],
      backgrounds: [incompleteBackground],
    })

    const ok = await useProducerStore.getState().saveAndHandoff()

    expect(ok).toBe(false)
    expect(useProducerStore.getState().error).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('proceeds past the gate and starts the writer when a complete background exists', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ runId: 'r1' }), { status: 200 }))

    useProducerStore.setState({
      storyText: '스토리',
      storyReady: true,
      projectSettings: readySettings,
      cast: [],
      backgrounds: [completeBackground],
    })

    const ok = await useProducerStore.getState().saveAndHandoff()

    expect(ok).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith('/api/writer/start', expect.anything())
  })
})
