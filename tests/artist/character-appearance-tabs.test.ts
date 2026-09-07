import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireDefaultAppearanceKey, useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import type { CharacterAsset } from '@/types/asset'

const routeMocks = vi.hoisted(() => ({
  demoWriteBlock: vi.fn(),
  requireProjectAccess: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: routeMocks.demoWriteBlock }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: routeMocks.requireProjectAccess }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: routeMocks.from, rpc: routeMocks.rpc },
}))

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
    // 약속 C8(2026-09-04) 뒤 PATCH 는 먼저 대상 행을 읽고(select…maybeSingle) 그다음 update 한다 — 한 체인 모의로 둘 다 받는다.
    const chain: Record<string, unknown> = {}
    const eq = vi.fn(() => chain)
    const update = vi.fn(() => chain)
    const select = vi.fn(() => chain)
    chain.eq = eq
    chain.update = update
    chain.select = select
    chain.maybeSingle = vi.fn(async () => ({ data: { appearance_key: 'young', is_default: false, narrative_time: 'past' }, error: null }))
    chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [{ appearance_key: 'young', label: 'Young', narrative_time: 'past', is_default: false }], error: null }).then(onFulfilled, onRejected)
    routeMocks.from.mockReturnValue(chain)
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
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        appearance: 'young prompt revised',
        appearance_native: 'young prompt revised',
        i18n_provenance: expect.any(Object),
      }),
    )
    expect(eq).toHaveBeenCalledWith('project_id', 'project-1')
    expect(eq).toHaveBeenCalledWith('character_id', 'char_3')
    expect(eq).toHaveBeenCalledWith('appearance_key', 'young')
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

describe('POST /api/artist/character canonical writes', () => {
  beforeEach(() => {
    routeMocks.demoWriteBlock.mockReset()
    routeMocks.demoWriteBlock.mockReturnValue(null)
    routeMocks.requireProjectAccess.mockReset()
    routeMocks.requireProjectAccess.mockResolvedValue({ ok: true, userId: 'owner-1' })
    routeMocks.from.mockReset()
    routeMocks.rpc.mockReset()
  })

  it('creates a person and its current appearance atomically through the RPC', async () => {
    routeMocks.rpc.mockResolvedValue({
      data: { character_id: 'char_3', appearance_key: 'current' },
      error: null,
    })
    const { POST } = await import('@/app/api/artist/character/route')

    const response = await POST(
      new Request('http://localhost/api/artist/character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'project-1',
          characterId: 'char_3',
          name: 'Okhwa',
          appearance: 'young prompt',
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(routeMocks.rpc).toHaveBeenCalledWith(
      'create_person_with_default_appearance',
      expect.objectContaining({
        p_project_id: 'project-1',
        p_person: expect.objectContaining({
          character_id: 'char_3',
          appearance: 'young prompt',
          appearance_native: 'young prompt',
          i18n_provenance: expect.any(Object),
        }),
      }),
    )
    expect(routeMocks.from).not.toHaveBeenCalledWith('characters')
  })

  it('creates an object only in props', async () => {
    const single = vi.fn().mockResolvedValue({ data: { prop_id: 'prop_1' }, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    routeMocks.from.mockReturnValue({ insert })
    const { POST } = await import('@/app/api/artist/character/route')

    const response = await POST(
      new Request('http://localhost/api/artist/character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'project-1',
          characterId: 'prop_1',
          name: 'A ring',
          entity_type: 'object',
          appearance: 'silver ring',
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(routeMocks.from).toHaveBeenCalledWith('props')
    expect(routeMocks.from).not.toHaveBeenCalledWith('characters')
    expect(routeMocks.rpc).not.toHaveBeenCalled()
  })
})
