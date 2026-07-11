import { afterEach, describe, expect, it, vi } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

import { collectProducerArtifacts, loadProducerBoard, type ProducerArtifactBoard } from '@/lib/export/producer'
import type { ArtifactFile } from '@/lib/export/types'

vi.mock('@/lib/supabase/client', () => ({
  createClient: createClientMock,
}))

afterEach(() => {
  vi.clearAllMocks()
})

const fixtureBoard: ProducerArtifactBoard = {
  storyText: '비 오는 서울에서 해커와 배달 로봇이 사라진 아이를 찾는다.',
  projectSettings: {
    playtime: 120,
    genre: 'SF 미스터리',
    subGenre: '네온 누아르',
    format: 'horizontal_16:9',
    tone: ['긴장감', '따뜻함'],
    targetEmotion: ['호기심'],
    dialogueLanguage: 'ko',
  },
  cast: [
    {
      localId: 'cast-1',
      name: '윤서',
      entityType: 'person',
      role: '주인공 탐정',
      appearance: '젖은 트렌치코트와 투명 우산',
      arc: {
        start_state: '타인을 믿지 못함',
        end_state: '팀을 신뢰함',
        arc_type: 'healing',
      },
      motivation: {
        want: '사라진 아이를 찾기',
        need: '도움을 받아들이기',
        wound: '과거 수색 실패',
      },
      origin: 'producer',
    },
    {
      localId: 'cast-2',
      name: '배달 로봇 R-7',
      entityType: 'object',
      role: '단서 제공자',
      appearance: '긁힌 흰색 차체와 깜박이는 파란 센서',
      origin: 'producer',
    },
  ],
  backgrounds: [
    {
      localId: 'bg-1',
      name: '네온 골목',
      purpose: '추적이 시작되는 장소',
      visualDescription: '젖은 아스팔트에 분홍 간판이 반사되는 좁은 골목',
      origin: 'producer',
    },
  ],
}

describe('collectProducerArtifacts', () => {
  it('emits readable producer markdown artifacts for a populated board', () => {
    const files = collectProducerArtifacts(fixtureBoard)

    expect(files.map((file) => file.path)).toEqual([
      'producer/story.md',
      'producer/settings.md',
      'producer/cast.md',
      'producer/backgrounds.md',
    ])

    expect(textFile(files, 'producer/story.md')).toContain(fixtureBoard.storyText)

    const settings = textFile(files, 'producer/settings.md')
    expect(settings).toContain('SF 미스터리')
    expect(settings).toContain('긴장감, 따뜻함')
    expect(settings).toContain('horizontal\\_16:9')

    const cast = textFile(files, 'producer/cast.md')
    expect(cast).toContain('윤서')
    expect(cast).toContain('주인공 탐정')
    expect(cast).toContain('인물 (person)')
    expect(cast).toContain('타인을 믿지 못함')
    expect(cast).toContain('사라진 아이를 찾기')
    expect(cast).toContain('배달 로봇 R-7')

    const backgrounds = textFile(files, 'producer/backgrounds.md')
    expect(backgrounds).toContain('네온 골목')
    expect(backgrounds).toContain('추적이 시작되는 장소')
    expect(backgrounds).toContain('젖은 아스팔트')

    for (const file of files) {
      expect(file.kind).toBe('text')
      expect(file.content).not.toContain('{')
      expect(file.content).not.toContain('}')
    }
  })

  it('renders explicit Korean empty notes for empty story, cast, and backgrounds', () => {
    const files = collectProducerArtifacts({
      ...fixtureBoard,
      storyText: '   ',
      cast: [],
      backgrounds: [],
    })

    expect(textFile(files, 'producer/story.md')).toContain('스토리 작성 전')
    expect(textFile(files, 'producer/cast.md')).toContain('캐스트 없음')
    expect(textFile(files, 'producer/backgrounds.md')).toContain('배경 없음')
  })

  it('does not emit producer background image files for today\'s BackgroundSource shape', () => {
    const files = collectProducerArtifacts(fixtureBoard)

    expect(files.filter((file) => file.path.startsWith('producer/backgrounds/'))).toEqual([])
    expect(files.some((file) => file.kind === 'media')).toBe(false)
  })
})

describe('loadProducerBoard', () => {
  it('maps producer_draft plus character/location rows into a producer artifact board', async () => {
    createClientMock.mockReturnValue(
      mockProducerSupabase({
        project: {
          story_text: 'legacy story should not win',
          settings: {
            playtime: 5,
            genre: 'legacy',
            format: 'vertical_9:16',
            tone: [],
            dialogueLanguage: 'en',
          },
          last_writer_run_id: 'run-current',
          producer_draft: {
            version: 1,
            savedAt: 123,
            storyText: '드래프트 스토리',
            storyReady: true,
            settings: {
              playtime: 120,
              genre: 'SF',
              subGenre: '네온',
              format: 'horizontal_16:9',
              tone: ['긴장감'],
              dialogueLanguage: 'ko',
            },
            cast: [
              {
                localId: 'draft-cast',
                name: '윤서',
                entityType: 'person',
                appearance: '드래프트 외형',
                origin: 'producer',
              },
            ],
            backgrounds: [
              {
                localId: 'draft-bg',
                name: '옥상',
                visualDescription: '드래프트 옥상',
                purpose: '대치',
                origin: 'producer',
              },
            ],
          },
        },
        characters: [
          {
            id: 'db-cast-dupe',
            character_id: 'db-yunseo',
            name: '윤서',
            entity_type: 'person',
            appearance_native: 'DB 중복 외형',
            origin: 'producer',
          },
          {
            id: 'db-cast-extra',
            character_id: 'db-robot',
            name: 'R-7',
            role: '조력자',
            entity_type: 'object',
            appearance: 'metal body',
            appearance_native: '금속 차체',
            arc: { start_state: '고장', end_state: '회복', arc_type: 'repair' },
            motivation: { want: '아이 찾기', need: '신뢰' },
            origin: 'writer',
          },
        ],
        locations: [
          {
            id: 'db-bg-dupe',
            location_id: 'db-rooftop',
            name: '옥상',
            visual_description_native: 'DB 중복 옥상',
            purpose: '중복',
            origin: 'producer',
          },
          {
            id: 'db-bg-extra',
            location_id: 'db-subway',
            name: '지하철',
            visual_description: 'English subway',
            visual_description_native: '네이티브 지하철',
            style_description: 'fallback style',
            purpose: '도주',
            origin: 'writer',
            user_edited: true,
            last_writer_run_id: 'run-old',
          },
        ],
      }),
    )

    const board = await loadProducerBoard(' project-1 ')

    expect(board.storyText).toBe('드래프트 스토리')
    expect(board.projectSettings).toMatchObject({
      playtime: 120,
      genre: 'SF',
      subGenre: '네온',
      format: 'horizontal_16:9',
      tone: ['긴장감'],
      dialogueLanguage: 'ko',
    })
    expect(board.cast).toHaveLength(2)
    expect(board.cast[0]).toMatchObject({
      localId: 'draft-cast',
      name: '윤서',
      appearance: '드래프트 외형',
      origin: 'producer',
    })
    expect(board.cast[1]).toMatchObject({
      localId: 'db-cast-extra',
      characterId: 'db-robot',
      name: 'R-7',
      role: '조력자',
      entityType: 'object',
      appearance: '금속 차체',
      arc: { start_state: '고장', end_state: '회복', arc_type: 'repair' },
      motivation: { want: '아이 찾기', need: '신뢰' },
      origin: 'writer',
      userEdited: false,
    })
    expect(board.backgrounds).toHaveLength(2)
    expect(board.backgrounds[0]).toMatchObject({
      localId: 'draft-bg',
      name: '옥상',
      visualDescription: '드래프트 옥상',
      purpose: '대치',
    })
    expect(board.backgrounds[1]).toMatchObject({
      localId: 'db-bg-extra',
      locationId: 'db-subway',
      name: '지하철',
      visualDescription: '네이티브 지하철',
      purpose: '도주',
      origin: 'writer',
      userEdited: true,
      stale: true,
    })
  })
})

function textFile(files: ArtifactFile[], path: string): string {
  const file = files.find((candidate) => candidate.path === path)
  expect(file).toMatchObject({ kind: 'text' })
  return file?.content ?? ''
}

function mockProducerSupabase({
  project,
  characters = [],
  locations = [],
}: {
  project: Record<string, unknown>
  characters?: Record<string, unknown>[]
  locations?: Record<string, unknown>[]
}) {
  const results: Record<string, { data: unknown; error: null }> = {
    projects: { data: project, error: null },
    characters: { data: characters, error: null },
    locations: { data: locations, error: null },
  }

  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn((column: string, value: string) => {
          expect(value).toBe('project-1')
          const result = results[table]
          if (!result) throw new Error(`unexpected table ${table}`)
          return table === 'projects'
            ? { single: vi.fn(async () => result) }
            : Promise.resolve(result)
        }),
      })),
    })),
  }
}
