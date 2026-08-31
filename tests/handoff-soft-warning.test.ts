import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSettings } from '@/types'
import type { BackgroundSource } from '@/lib/producer-gate'

// #b(2026-08-28 오너 확정) — 핸드오프 hard 블로커는 여전히 차단하지만, soft 블로커는
//   진행을 막지 않고 "퀄리티가 떨어질 수 있어요" 경고 문구만 붙인다.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}))

import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useWriterStore } from '@/stores/writer-store'
import { useArtistStore } from '@/stores/artist-store'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useProjectStore } from '@/stores/project-store'

const readySettings: ProjectSettings = {
  playtime: 30,
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

const directorApplyUpdates = useDirectorCanvasStore.getState().applyUpdates

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProducerStore.getState().reset()
  useWriterStore.getState().reset()
  useArtistStore.getState().reset()
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ projectId: 'proj-1', currentStage: 'producer', reachedStage: 'producer' })
})

afterEach(() => {
  useDirectorCanvasStore.setState({ applyUpdates: directorApplyUpdates, nodes: [], edges: [] })
  vi.restoreAllMocks()
})

describe('handoff hard blockers stay unchanged', () => {
  it('producer → writer still blocks when a hard field (background) is missing', async () => {
    useProducerStore.setState({
      storyText: '스토리',
      storyReady: true,
      styleAnchorKey: 'style_a',
      projectSettings: readySettings,
      cast: [],
      backgrounds: [],
    })

    await useGlobalChatStore.getState().sendMessage('Please hand over to Writer')

    const messages = useGlobalChatStore.getState().messages
    const reply = messages.find((m) => m.role === 'model')
    expect(reply?.content).toContain("Can't move to")
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
  })
})

describe('handoff soft blockers warn but still proceed', () => {
  it('producer → writer: missing subGenre/tone(soft) still offers the handoff proposal with a quality warning', async () => {
    useProducerStore.setState({
      storyText: '스토리',
      storyReady: true,
      styleAnchorKey: 'style_a',
      projectSettings: { ...readySettings, subGenre: '', tone: [] },
      cast: [],
      backgrounds: [completeBackground],
    })

    await useGlobalChatStore.getState().sendMessage('Please hand over to Writer')

    const proposal = useGlobalChatStore.getState().pendingProposal
    expect(proposal?.kind).toBe('producerWriterInitialHandoff')
    // hard 게이트를 통과했으니 진행(제안 제시)은 막히지 않는다.
    expect(proposal).not.toBeNull()
    expect(proposal?.impact.join(' ')).toMatch(/Quality may suffer|퀄리티/)
  })

  it('writer → artist: no scenes/shots (soft) still hands off with a quality warning in the reply', async () => {
    useProjectStore.setState({ currentStage: 'writer', reachedStage: 'writer' })
    useWriterStore.setState({
      sceneManifest: { scenes: [], characters: [], locations: [] },
      shots: [],
    })

    await useGlobalChatStore.getState().sendMessage('Please hand over to Artist')

    const messages = useGlobalChatStore.getState().messages
    const reply = messages.find((m) => m.role === 'model')
    expect(reply?.content).not.toContain("Can't move to")
    expect(reply?.content).toMatch(/quality may suffer|퀄리티/i)
    expect(useProjectStore.getState().currentStage).toBe('artist')
  })

  it('artist → director: characters with only a main view (soft) still hands off with a quality warning', async () => {
    useProjectStore.setState({ currentStage: 'artist', reachedStage: 'artist' })
    useProjectStore.setState({
      lifecycleStatus: {
        producerSourceHash: null,
        writer: { state: 'ready' },
        artist: { ready: true, requiredCharacterIds: [], blockers: [], warnings: [] },
        director: { ready: true, blockers: [], warnings: [] },
      },
    })
    useArtistStore.setState({
      characterAssets: [
        {
          characterId: 'char_1',
          name: '주인공',
          entityType: 'person',
          views: { main: 'https://x/main.png', back: null, sideLeft: null, sideRight: null },
          viewCandidates: {},
          // #g4: 카드·게이트는 characters 가 아니라 기본 모습(character_appearances)의 sheetUrl 을 읽는다.
          appearances: [
            {
              appearanceKey: 'current',
              label: '현재',
              isDefault: true,
              narrativeTime: 'present',
              sheetUrl: 'https://x/main.png',
              portraitUrl: null,
              appearance: null,
              appearanceNative: null,
              viewCandidates: {},
            },
          ],
        },
      ],
    })

    await useGlobalChatStore.getState().sendMessage('Please hand over to Director')

    const messages = useGlobalChatStore.getState().messages
    const reply = messages.find((m) => m.role === 'model')
    expect(reply?.content).not.toContain("Can't move to")
    expect(reply?.content).toMatch(/quality may suffer|퀄리티/i)
    expect(useProjectStore.getState().currentStage).toBe('director')
  })
})
