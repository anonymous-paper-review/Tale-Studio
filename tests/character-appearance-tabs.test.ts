import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireDefaultAppearanceKey, useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import type { CharacterAsset } from '@/types/asset'

const routeMocks = vi.hoisted(() => ({
  demoWriteBlock: vi.fn(),
  requireProjectAccess: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: routeMocks.demoWriteBlock }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: routeMocks.requireProjectAccess }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: routeMocks.from } }))

const character: CharacterAsset = {
  characterId: 'char_3',
  name: 'Okhwa',
  entityType: 'person',
  views: { main: null, back: null, sideLeft: null, sideRight: null },
  viewCandidates: {},
  appearances: [
    {
      appearanceKey: 'current',
      label: 'Current',
      isDefault: true,
      narrativeTime: 'present',
      sheetUrl: 'current-sheet',
      portraitUrl: null,
      appearance: 'current prompt',
      appearanceNative: null,
      viewCandidates: {},
    },
    {
      appearanceKey: 'young',
      label: 'Young',
      isDefault: false,
      narrativeTime: 'past',
      sheetUrl: null,
      portraitUrl: null,
      appearance: 'young prompt',
      appearanceNative: null,
      viewCandidates: {},
    },
  ],
}

describe('character appearance generation identity', () => {
  beforeEach(() => {
    useProjectStore.setState({ projectId: 'project-1' })
    useArtistStore.setState({ characterAssets: [character], generatingViews: [], error: null })
  })

  it('sends young explicitly without using current sheet or key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ deduped: true }) })
    vi.stubGlobal('fetch', fetchMock)

    await useArtistStore.getState().generateCharacterView('char_3', 'young', 'main')

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      projectId: 'project-1',
      characterId: 'char_3',
      appearanceKey: 'young',
      view: 'main',
    })
    expect(useArtistStore.getState().characterAssets[0].appearances[0].sheetUrl).toBe('current-sheet')
  })

  it('rejects a missing appearance key before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(useArtistStore.getState().generateCharacterView('char_3', '', 'main')).rejects.toThrow('Appearance key is required')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('resolves only one declared default appearance for automatic callers', () => {
    expect(requireDefaultAppearanceKey(character)).toBe('current')
    expect(() =>
      requireDefaultAppearanceKey({
        ...character,
        appearances: character.appearances.map((appearance) => ({
          ...appearance,
          isDefault: false,
        })),
      }),
    ).toThrow('requires exactly one default appearance')
  })

  it('patches only the explicitly selected appearance', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await useArtistStore
      .getState()
      .updateCharacterAppearance('char_3', 'young', 'young prompt revised')

    expect(fetchMock).toHaveBeenCalledWith('/api/artist/character-appearance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'project-1',
        characterId: 'char_3',
        appearanceKey: 'young',
        appearance: 'young prompt revised',
      }),
    })
    expect(useArtistStore.getState().characterAssets[0].appearances).toMatchObject([
      { appearanceKey: 'current', appearance: 'current prompt' },
      { appearanceKey: 'young', appearance: 'young prompt revised' },
    ])
  })
})

describe('PATCH /api/artist/character-appearance', () => {
  beforeEach(() => {
    routeMocks.demoWriteBlock.mockReset()
    routeMocks.demoWriteBlock.mockReturnValue(null)
    routeMocks.requireProjectAccess.mockReset()
    routeMocks.requireProjectAccess.mockResolvedValue({ ok: true, userId: 'owner-1' })
    routeMocks.from.mockReset()
  })

  it('updates exactly the selected appearance row', async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ appearance_key: 'young' }], error: null })
    const appearanceKey = vi.fn().mockReturnValue({ select })
    const characterId = vi.fn().mockReturnValue({ eq: appearanceKey })
    const projectId = vi.fn().mockReturnValue({ eq: characterId })
    const update = vi.fn().mockReturnValue({ eq: projectId })
    routeMocks.from.mockReturnValue({ update })
    const { PATCH } = await import('@/app/api/artist/character-appearance/route')

    const response = await PATCH(
      new Request('http://localhost/api/artist/character-appearance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'project-1',
          characterId: 'char_3',
          appearanceKey: 'young',
          appearance: 'young prompt revised',
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(routeMocks.from).toHaveBeenCalledWith('character_appearances')
    expect(update).toHaveBeenCalledWith({ appearance: 'young prompt revised' })
    expect(projectId).toHaveBeenCalledWith('project_id', 'project-1')
    expect(characterId).toHaveBeenCalledWith('character_id', 'char_3')
    expect(appearanceKey).toHaveBeenCalledWith('appearance_key', 'young')
    await expect(response.json()).resolves.toMatchObject({
      appearanceKey: 'young',
      appearance: 'young prompt revised',
    })
  })

  it('does not update when project access is denied', async () => {
    routeMocks.requireProjectAccess.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
    })
    const { PATCH } = await import('@/app/api/artist/character-appearance/route')

    const response = await PATCH(
      new Request('http://localhost/api/artist/character-appearance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'project-1',
          characterId: 'char_3',
          appearanceKey: 'young',
          appearance: 'young prompt revised',
        }),
      }),
    )

    expect(response.status).toBe(403)
    expect(routeMocks.requireProjectAccess).toHaveBeenCalledWith(
      expect.any(Request),
      'project-1',
    )
    expect(routeMocks.from).not.toHaveBeenCalled()
  })
})
