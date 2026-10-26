// 앞 화 카드의 [다음 화 만들기]가 앞 화 인물 · 배경 · 그림 · 그림체 · 말투를 이어받은 새 프로젝트를 만든다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { storageKeySegment } from '@/lib/storage/key-segment'
import type { SeriesSnapshot } from '@/lib/series/snapshot'
import { SERIES_WORLD_MAX_CHARS, buildSeriesWorldPrompt, parseSeriesWorldLine } from '@/lib/series/world-line'

const ANCHOR_URL = 'https://media.test/workspace-1/prev-episode/anchors/style.png'
const MINHO_SHEET = 'https://media.test/workspace-1/prev-episode/characters/minho-sheet.png'
const MINHO_PORTRAIT = 'https://media.test/workspace-1/prev-episode/characters/minho-portrait.png'
const HALL_WIDE = 'https://media.test/workspace-1/prev-episode/locations/hall-wide.png'
const LAST_END = 'https://media.test/workspace-1/prev-episode/shots/scene2-end.png'
const PREV_DESIGN_TOKENS = {
  l0: { medium: '2d_animation', resolution: { width: 1080, height: 1920 }, fps: 24, aspect_ratio: '9:16', rendering_method: 'cel_shaded' },
  l1: { art_style: 'watercolor', shape_language: 'round', line_quality: 'soft', character_proportion: '5:1', texture_philosophy: 'paper' },
  palette: { primary: 'moss', secondary: 'navy', accent: 'gold', forbidden: ['neon'] },
  color_meaning: { gold: 'memory' },
  vfx_approach: 'soft particles',
}
const WORLD_LINE = 'present-day Seoul office world: glass towers, fluorescent hallways, business casual clothing'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  mediaCopy: vi.fn(),
  describeWorld: vi.fn(),
  rows: {} as Record<string, unknown>,
  updates: [] as Record<string, unknown>[],
  plan: 'p10',
  rpcResult: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}))
vi.mock('@/lib/supabase/workspace', () => ({
  ensureWorkspace: async () => ({ id: 'workspace-1', plan: mocks.plan, owner_id: 'user-1' }),
}))
// 세계 한 줄은 AI 한 번으로 적는다(world-line-llm.ts) — 테스트에서는 답을 직접 물린다.
vi.mock('@/lib/series/world-line-llm', () => ({ describeSeriesWorld: mocks.describeWorld }))
vi.mock('@/lib/storage/media', () => ({
  mediaCopy: mocks.mediaCopy,
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
}))
vi.mock('@/lib/storage/media-url', () => ({
  isOwnMediaUrl: (url: unknown) => typeof url === 'string' && url.startsWith('https://media.test/'),
  mediaPathFromUrl: (url: string) =>
    url.startsWith('https://media.test/') ? url.slice('https://media.test/'.length) : null,
}))
vi.mock('@/lib/style-anchor', () => ({
  parseCustomStyleAnchor: (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return null
    const value = raw as { url?: unknown; label?: unknown; medium?: unknown }
    return typeof value.url === 'string'
      ? {
          url: value.url,
          label: typeof value.label === 'string' ? value.label : null,
          medium: typeof value.medium === 'string' ? value.medium : null,
        }
      : null
  },
}))

import { GET, POST } from '@/app/api/project/next-episode/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.plan = 'p10'
  mocks.updates = []
  mocks.rpcResult = null
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'creator@example.com', user_metadata: {} } },
  })
  mocks.mediaCopy.mockResolvedValue({ data: {}, error: null })
  mocks.describeWorld.mockResolvedValue({ world: WORLD_LINE })
  mocks.rows = {
    projects: {
      id: 'prev-episode',
      workspace_id: 'workspace-1',
      title: '자판기의 반란',
      locale: 'ko',
      settings: { format: 'vertical_9:16', dialogueLanguage: 'ko', genre: 'comedy', playtime: 60, tone: [] },
      style_anchor_key: 'custom_abc',
      custom_style_anchor: {
        url: ANCHOR_URL,
        label: 'Watercolor',
        medium: 'watercolor',
        locked: true,
        facets: { core: '수채 번짐' },
        analysis_pending_at: '2026-10-25T00:00:00.000Z',
      },
      series: null,
      design_tokens: PREV_DESIGN_TOKENS,
    },
    workspaces: { id: 'workspace-1', owner_id: 'user-1', plan: mocks.plan },
    scenes: [
      { id: 'scene-1', sort_order: 1 },
      { id: 'scene-2', sort_order: 2 },
    ],
    shots: [
      {
        scene_id: 'scene-2',
        sort_order: 2,
        storyboard_image: {
          status: 'completed',
          url: 'https://media.test/workspace-1/prev-episode/shots/scene2-start.png',
          frames: {
            start: 'https://media.test/workspace-1/prev-episode/shots/scene2-start.png',
            direction: 'https://media.test/workspace-1/prev-episode/shots/scene2-dir.png',
            end: LAST_END,
          },
        },
      },
      {
        scene_id: 'scene-1',
        sort_order: 9,
        storyboard_image: {
          status: 'completed',
          frames: { start: 'a', direction: 'b', end: 'https://media.test/workspace-1/prev-episode/shots/scene1-end.png' },
        },
      },
    ],
    characters: [
      {
        character_id: 'minho',
        name: '민호',
        role: 'protagonist',
        entity_type: 'person',
        appearance: 'a office worker in his twenties',
        appearance_native: '20대 회사원',
      },
      {
        character_id: 'vending',
        name: '자판기',
        role: 'supporting',
        entity_type: 'object',
        appearance: 'an old vending machine',
        appearance_native: '낡은 자판기',
      },
    ],
    character_appearances: [
      {
        character_id: 'minho',
        is_default: false,
        appearance_native: '잠옷 차림',
        sheet_url: 'https://media.test/workspace-1/prev-episode/characters/minho-pajama.png',
        portrait_url: null,
      },
      {
        character_id: 'minho',
        is_default: true,
        appearance: 'default look',
        appearance_native: '기본 모습 20대 회사원',
        sheet_url: MINHO_SHEET,
        portrait_url: MINHO_PORTRAIT,
      },
      {
        character_id: 'vending',
        is_default: true,
        appearance_native: '낡은 자판기',
        sheet_url: 'https://media.test/workspace-1/prev-episode/characters/vending.png',
        portrait_url: null,
      },
    ],
    locations: [
      {
        location_id: 'hall',
        name: '회사 복도',
        visual_description: 'a fluorescent hallway',
        visual_description_native: '형광등이 깜빡이는 복도',
        wide_shot: HALL_WIDE,
      },
    ],
    writer_runs: {
      id: 'run-1',
      project_id: 'prev-episode',
      status: 'completed',
      state: {
        characters: {
          characters: [{ id: 'minho', name: '민호', personality: ['소심함', '성실함'] }],
        },
        dialogue: {
          profiles: [
            {
              character_id: 'minho',
              name: '민호',
              speech_style: '존댓말, 말끝을 흐린다',
              formality: '존댓말',
              sentence_length: '짧게',
              verbal_tics: ['저기'],
              emotional_expression: '참는다',
              taboo: '욕',
              example_lines: ['저기요, 제 음료가 안 나왔는데요'],
            },
          ],
          scenes: [],
        },
      },
    },
  }
  mocks.from.mockImplementation((table: string) => query(table))
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name !== 'create_project_slotted') throw new Error(`unexpected rpc: ${name}`)
    if (mocks.rpcResult) return { data: mocks.rpcResult, error: null }
    return {
      data: {
        status: 'ok',
        project: {
          id: args.p_project_id,
          workspace_id: args.p_workspace_id,
          title: args.p_title,
          locale: args.p_locale,
          locale_locked: args.p_locale_locked,
          reference_project_id: args.p_reference_project_id,
          current_stage: 'producer',
        },
      },
      error: null,
    }
  })
})

describe('앞 화에서 다음 화 만들기', () => {
  // 왜: 칸이 하나뿐인 요금제는 앞 화를 남겨 둘 수 없다 — 안내가 없으면 만들다 멈춘다.
  it('프로젝트 칸이 2개보다 적은 요금제면 다음 화를 만들지 않고 요금제 안내를 돌려준다', async () => {
    mocks.plan = 'free'

    const response = await POST(postRequest({ fromProjectId: 'prev-episode' }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'reference_unavailable', plan: 'free' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  // 왜: 남의 작업 공간 프로젝트 번호를 그대로 보내는 요청(브라우저가 보내는 값)을 막는다.
  it('다른 작업 공간의 프로젝트로는 다음 화를 만들지 않는다', async () => {
    mocks.rows.projects = { ...(mocks.rows.projects as Record<string, unknown>), workspace_id: 'workspace-9' }

    const response = await POST(postRequest({ fromProjectId: 'prev-episode' }))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'reference_not_found' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  // 왜: 씬이 없는 화는 이어받을 인물 · 배경이 아직 없다 — 빈 다음 화가 만들어지는 것을 막는다.
  it('Artist에서 [만들기]를 누르기 전인 화로는 다음 화를 만들지 않는다', async () => {
    mocks.rows.scenes = []

    const response = await POST(postRequest({ fromProjectId: 'prev-episode' }))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'series_not_ready' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  // 왜: 칸이 찬 상태로 누르면 지금 새 프로젝트와 같은 안내 창을 띄워야 한다.
  it('프로젝트 칸을 다 썼으면 다음 화를 만들지 않고 칸이 찼다고 알린다', async () => {
    mocks.rpcResult = { status: 'slot_limit', count: 2 }

    const response = await POST(postRequest({ fromProjectId: 'prev-episode' }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'slot_limit', limit: 2, plan: 'p10' })
    expect(mocks.updates).toEqual([])
  })

  // 왜: 정상 경로 고정 — 다음 화는 앞 화에 연결된 새 프로젝트이고 시작 화면(Producer)에서 연다.
  it('다음 화는 앞 화에 연결된 새 프로젝트로 만들어지고 시작 화면에서 시작한다', async () => {
    const response = await POST(postRequest({ fromProjectId: 'prev-episode' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.workspaceId).toBe('workspace-1')
    expect(mocks.rpc).toHaveBeenCalledWith(
      'create_project_slotted',
      expect.objectContaining({
        p_project_id: body.projectId,
        p_workspace_id: 'workspace-1',
        p_title: 'Untitled',
        p_reference_project_id: 'prev-episode',
        p_slot_limit: 2,
      }),
    )
    expect(mocks.updates).toHaveLength(1)
    expect(mocks.updates[0].current_stage).toBe('entry')
    expect(body.project.current_stage).toBe('entry')
    expect(seriesOf()).toMatchObject({ version: 1, prevProjectId: 'prev-episode', prevTitle: '자판기의 반란' })
  })

  // 왜: 정상 경로 고정 — 이어받기는 고르는 목록이 없다. 앞 화 사람 인물이 그림까지 전부 넘어와야 한다.
  it('앞 화의 사람 인물을 이름 · 역할 · 외모 · 성격과 그림까지 모두 이어받는다', async () => {
    const response = await POST(postRequest({ fromProjectId: 'prev-episode' }))
    const body = await response.json()
    const sheetPath = `workspace-1/${body.projectId}/series/sheet-${storageKeySegment('minho')}.png`
    const portraitPath = `workspace-1/${body.projectId}/series/portrait-${storageKeySegment('minho')}.png`

    expect(seriesOf().characters).toEqual([
      {
        characterId: 'minho',
        name: '민호',
        role: 'protagonist',
        appearance: '기본 모습 20대 회사원',
        personality: ['소심함', '성실함'],
        sheetUrl: `https://media.test/${sheetPath}`,
        portraitUrl: `https://media.test/${portraitPath}`,
        styleId: 'custom_abc',
      },
    ])
    expect(mocks.mediaCopy).toHaveBeenCalledWith('workspace-1/prev-episode/characters/minho-sheet.png', sheetPath)
    expect(mocks.mediaCopy).toHaveBeenCalledWith('workspace-1/prev-episode/characters/minho-portrait.png', portraitPath)
    expect(body.copyFailures).toEqual([])
  })

  // 왜: 정상 경로 고정 — 배경도 고르는 목록 없이 전부 넘어온다.
  it('앞 화의 배경을 이름 · 설명 · 와이드샷과 함께 모두 이어받는다', async () => {
    const response = await POST(postRequest({ fromProjectId: 'prev-episode' }))
    const body = await response.json()
    const widePath = `workspace-1/${body.projectId}/series/wide-${storageKeySegment('hall')}.png`

    expect(seriesOf().locations).toEqual([
      {
        locationId: 'hall',
        name: '회사 복도',
        description: '형광등이 깜빡이는 복도',
        wideShotUrl: `https://media.test/${widePath}`,
        styleId: 'custom_abc',
      },
    ])
    expect(mocks.mediaCopy).toHaveBeenCalledWith('workspace-1/prev-episode/locations/hall-wide.png', widePath)
  })

  // 왜: 그림체가 안 넘어오면 같은 시리즈인데 그림이 다른 그림체로 다시 그려진다. 잠금이 빠지면 고정한 그림체가 풀린다.
  it('앞 화 그림체를 이어받고, 사용자가 올린 그림체는 분석 결과와 잠금까지 함께 복사한다', async () => {
    const response = await POST(postRequest({ fromProjectId: 'prev-episode' }))
    const body = await response.json()
    const anchorPath = `workspace-1/${body.projectId}/series/style-anchor-${storageKeySegment('prev-episode')}.png`

    expect(mocks.updates[0].style_anchor_key).toBe('custom_abc')
    expect(mocks.updates[0].custom_style_anchor).toEqual({
      url: `https://media.test/${anchorPath}`,
      label: 'Watercolor',
      medium: 'watercolor',
      locked: true,
      facets: { core: '수채 번짐' },
    })
    expect(seriesOf().styleId).toBe('custom_abc')
    expect(body.warnings).toEqual([])
  })

  // 왜: 2026-10-27 오너 "제품에서 고칠 것" — 같은 그림체로 이어 가는 화는 앞 화 색 설계를 그대로 쓴다. 만든 뒤 앞 화를 고치거나 지워도 흔들리지 않게 만들 때 복사해 둔다.
  it('다음 화를 만들면 앞 화 색 설계를 시리즈 기록에 복사하고, 앞 화가 색 설계 전이면 빈 칸으로 둔다', async () => {
    await POST(postRequest({ fromProjectId: 'prev-episode' }))
    expect(seriesOf().designTokens).toEqual(PREV_DESIGN_TOKENS)

    mocks.updates = []
    mocks.rows.projects = { ...(mocks.rows.projects as Record<string, unknown>), design_tokens: null }
    await POST(postRequest({ fromProjectId: 'prev-episode' }))
    expect(seriesOf().designTokens).toBeNull()
  })

  // 왜: 대사 전에 멈춘 화는 말투가 없다 — 빈 말투를 이어받으면 Writer 가 빈 프로필로 대사를 쓴다.
  it('앞 화가 대사까지 끝났을 때만 말투를 이어받는다', async () => {
    await POST(postRequest({ fromProjectId: 'prev-episode' }))
    expect(seriesOf().voices).toHaveLength(1)
    expect(seriesOf().voices[0]).toMatchObject({ character_id: 'minho', speech_style: '존댓말, 말끝을 흐린다' })

    mocks.updates = []
    const run = mocks.rows.writer_runs as { state: Record<string, unknown> }
    mocks.rows.writer_runs = { ...run, state: { characters: run.state.characters } }

    await POST(postRequest({ fromProjectId: 'prev-episode' }))
    expect(seriesOf().voices).toEqual([])
  })

  // 왜: 정상 경로 고정 — 체크박스를 고른 사람은 앞 화 마지막 장면에서 이어지는 첫 샷을 기대한다.
  it('앞 화 마지막 장면에서 이어 시작하기를 고르면 앞 화 마지막 샷의 끝 장면을 다음 화에 복사한다', async () => {
    const response = await POST(postRequest({ fromProjectId: 'prev-episode', continueLastScene: true }))
    const body = await response.json()
    const framePath = `workspace-1/${body.projectId}/series/last-scene-${storageKeySegment('prev-episode')}.png`

    expect(mocks.mediaCopy).toHaveBeenCalledWith('workspace-1/prev-episode/shots/scene2-end.png', framePath)
    expect(mocks.updates[0].optional_reference_frame_url).toBe(`https://media.test/${framePath}`)
    expect(seriesOf().continuesLastScene).toBe(true)
  })

  // 왜: 보관함 복사가 한 장 실패했다고 다음 화 만들기를 되돌리면 사람은 아무것도 얻지 못한다.
  it('그림 하나를 복사하지 못해도 다음 화는 만들고, 못 가져온 이름을 알린다', async () => {
    mocks.mediaCopy.mockImplementation(async (source: string) =>
      source.includes('minho-sheet') ? { data: null, error: { message: 'storage unavailable' } } : { data: {}, error: null },
    )

    const response = await POST(postRequest({ fromProjectId: 'prev-episode' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.copyFailures).toEqual(['민호'])
    expect(seriesOf().copyFailures).toEqual(['민호'])
    expect(seriesOf().characters[0].sheetUrl).toBeNull()
    expect(seriesOf().characters[0].portraitUrl).not.toBeNull()
  })

  // 왜: 로그인하지 않은 요청이 남의 프로젝트를 읽고 작업 공간을 만드는 것을 막는다.
  it('로그인하지 않으면 다음 화를 만들지 않는다', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })

    const response = await POST(postRequest({ fromProjectId: 'prev-episode' }))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  // 왜: 같은 시리즈인데 다음 화 대사가 다른 언어로 나오면 이어 보는 사람이 읽지 못한다.
  it('다음 화의 채팅 · 대사 언어는 앞 화 언어로 정하고 잠근다', async () => {
    await POST(postRequest({ fromProjectId: 'prev-episode' }))

    expect(mocks.rpc).toHaveBeenCalledWith(
      'create_project_slotted',
      expect.objectContaining({ p_locale: 'ko', p_locale_locked: true }),
    )
    expect((mocks.updates[0].settings as Record<string, unknown>).dialogueLanguage).toBe('ko')
    expect(seriesOf().dialogueLanguage).toBe('ko')
  })

  // 왜: 사물 카드는 그 화 사건에 묶인 소품이다 — 넘기면 다음 화 캐스트에 얼굴 없는 인물로 섞인다.
  it('사물 인물은 다음 화로 넘기지 않는다', async () => {
    const response = await POST(postRequest({ fromProjectId: 'prev-episode' }))
    const body = await response.json()

    expect(seriesOf().characters.map((c) => c.name)).toEqual(['민호'])
    expect(body.copyFailures).not.toContain('자판기')
    expect(mocks.mediaCopy).not.toHaveBeenCalledWith(
      'workspace-1/prev-episode/characters/vending.png',
      expect.anything(),
    )
  })

  // 왜: 같은 시리즈의 화면 비율이 화마다 바뀌면 이어 보는 영상이 들쭉날쭉해진다. 기본값일 뿐 바꿀 수 있다.
  it('앞 화 화면 비율을 시작 화면의 기본값으로 넣는다', async () => {
    await POST(postRequest({ fromProjectId: 'prev-episode' }))

    const draft = mocks.updates[0].entry_draft as { picks: Record<string, unknown>; startedAt: unknown }
    expect(draft.picks).toMatchObject({ ratio: '9:16', mood: null, runtime: null, level: null })
    expect(draft.startedAt).toBeNull()
    expect((mocks.updates[0].settings as Record<string, unknown>).format).toBe('vertical_9:16')
    expect(seriesOf().format).toBe('vertical_9:16')
  })

  // 왜: 러프나 썸네일을 끝 장면으로 쓰면 다음 화 첫 샷이 완성되지 않은 그림에서 이어진다.
  it('앞 화 마지막 샷에 완성된 스토리보드 그림이 없으면 마지막 장면 잇기를 하지 않고 알린다', async () => {
    mocks.rows.shots = [
      {
        scene_id: 'scene-2',
        sort_order: 2,
        storyboard_image: { status: 'generating' },
        rough_storyboard: { status: 'completed', frames: { start: 'a', direction: 'b', end: 'https://media.test/workspace-1/prev-episode/shots/rough-end.png' } },
      },
    ]

    const response = await POST(postRequest({ fromProjectId: 'prev-episode', continueLastScene: true }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.warnings.map((w: { code: string }) => w.code)).toEqual(['last_scene_unavailable'])
    expect(mocks.updates[0].optional_reference_frame_url).toBeUndefined()
    expect(seriesOf().continuesLastScene).toBe(false)
  })

  // 왜: 2화가 1화 그림을 그대로 쓰고 3화를 만들면, 그 그림의 그림체는 1화 것이다 — 앞 화 키로 적으면 같은 그림을 괜히 다시 그린다.
  it('앞 화 그림이 앞 화가 이어받은 그대로면 그 그림을 처음 그린 화의 그림체를 기록한다', async () => {
    mocks.rows.projects = {
      ...(mocks.rows.projects as Record<string, unknown>),
      series: {
        version: 1,
        prevProjectId: 'first-episode',
        prevTitle: '1화',
        copiedAt: '2026-10-20T00:00:00.000Z',
        characters: [{ characterId: 'minho', name: '민호', sheetUrl: MINHO_SHEET, portraitUrl: MINHO_PORTRAIT, styleId: 'anime' }],
        locations: [{ locationId: 'hall', name: '회사 복도', wideShotUrl: HALL_WIDE, styleId: 'anime' }],
        voices: [],
        styleId: 'anime',
        format: 'vertical_9:16',
        dialogueLanguage: 'ko',
        continuesLastScene: false,
        copyFailures: [],
      },
    }

    await POST(postRequest({ fromProjectId: 'prev-episode' }))

    expect(seriesOf().characters[0].styleId).toBe('anime')
    expect(seriesOf().locations[0].styleId).toBe('anime')
    expect(seriesOf().styleId).toBe('custom_abc')
  })

  // 왜: 만들기 창은 "무엇이 넘어오나"를 보여 주고 마지막 장면 체크박스를 보일지 정해야 한다.
  it('미리보기는 이어받을 인물 · 배경 이름과 마지막 장면을 이을 수 있는지 알려 준다', async () => {
    const response = await GET(getRequest('prev-episode'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      prevTitle: '자판기의 반란',
      characters: ['민호'],
      locations: ['회사 복도'],
      hasVoices: true,
      lastSceneAvailable: true,
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.updates).toEqual([])
    expect(mocks.mediaCopy).not.toHaveBeenCalled()
  })
})

describe('다음 화를 만들 때 앞 화 세계를 한 줄로 적어 둔다', () => {
  // 왜: 같이 정한 것(2026-10-27 오너 "가") — 운영 2화 뱃사공은 "짚 모자"라는 낱말만 보고 삿갓 차림으로 그려졌다.
  //   그림 지시에 세계를 낱말로 못 박으려면 다음 화를 만들 때 앞 화 세계를 적어 둬야 한다.
  it('다음 화를 만들면 앞 화 인물 · 배경 모습으로 세계를 한 줄로 적어 시리즈 기록에 둔다', async () => {
    const response = await POST(postRequest({ fromProjectId: 'prev-episode' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.describeWorld).toHaveBeenCalledTimes(1)
    expect(mocks.describeWorld).toHaveBeenCalledWith(body.projectId, {
      title: '자판기의 반란',
      characters: [{ name: '민호', appearance: '기본 모습 20대 회사원' }],
      locations: [{ name: '회사 복도', description: '형광등이 깜빡이는 복도' }],
    })
    expect(seriesOf().world).toBe(WORLD_LINE)
    expect(body.warnings).toEqual([])
  })

  // 왜: 혼자 정한 것 — 3화는 2화가 적어 둔 1화 세계를 그대로 쓴다. 화마다 AI가 다시 적으면 세계가 조금씩 흘러가고 값도 든다.
  it('앞 화도 시리즈이고 세계 한 줄이 있으면 AI를 부르지 않고 그 줄을 이어 쓴다', async () => {
    const firstWorld = 'present-day Busan office world: harbor-side towers, navy suits'
    mocks.rows.projects = {
      ...(mocks.rows.projects as Record<string, unknown>),
      series: {
        version: 1,
        prevProjectId: 'first-episode',
        prevTitle: '1화',
        copiedAt: '2026-10-20T00:00:00.000Z',
        characters: [{ characterId: 'minho', name: '민호', sheetUrl: MINHO_SHEET, portraitUrl: MINHO_PORTRAIT, styleId: 'anime' }],
        locations: [{ locationId: 'hall', name: '회사 복도', wideShotUrl: HALL_WIDE, styleId: 'anime' }],
        voices: [],
        styleId: 'anime',
        format: 'vertical_9:16',
        dialogueLanguage: 'ko',
        continuesLastScene: false,
        copyFailures: [],
        world: firstWorld,
      },
    }

    await POST(postRequest({ fromProjectId: 'prev-episode' }))

    expect(mocks.describeWorld).not.toHaveBeenCalled()
    expect(seriesOf().world).toBe(firstWorld)
  })

  // 왜: 혼자 정한 것 — 세계 한 줄은 그림을 돕는 줄이다. AI가 실패했다고 다음 화를 못 만들면 안 되고, 빠졌다는 것은 알려야 한다.
  it('세계 한 줄을 만들지 못하면 다음 화는 만들고 세계 줄을 비운 채 알린다', async () => {
    mocks.describeWorld.mockRejectedValueOnce(new Error('timed out'))
    const failed = await POST(postRequest({ fromProjectId: 'prev-episode' }))
    const failedBody = await failed.json()

    expect(failed.status).toBe(200)
    expect(seriesOf().world).toBeNull()
    expect(failedBody.warnings.map((w: { code: string }) => w.code)).toEqual(['world_line_failed'])

    mocks.updates = []
    mocks.describeWorld.mockResolvedValueOnce({ world: '   ' })
    const empty = await POST(postRequest({ fromProjectId: 'prev-episode' }))
    const emptyBody = await empty.json()

    expect(empty.status).toBe(200)
    expect(seriesOf().world).toBeNull()
    expect(emptyBody.warnings.map((w: { code: string }) => w.code)).toEqual(['world_line_failed'])
  })

  // 왜: 혼자 정한 것 — 만들기 창을 열 때마다 AI를 부르면 만들지도 않을 화에 값이 든다. 칸이 차서 못 만들 때도 같다.
  it('미리보기거나 칸이 차서 다음 화를 만들지 못하면 세계 한 줄을 만들지 않는다', async () => {
    await GET(getRequest('prev-episode'))
    mocks.rpcResult = { status: 'slot_limit', count: 2 }
    await POST(postRequest({ fromProjectId: 'prev-episode' }))

    expect(mocks.describeWorld).not.toHaveBeenCalled()
  })

  // 왜: 혼자 정한 것 — 세계는 인물 생김새 · 배경 모습에서 읽는다. 이름 · 사건이 섞이면 새 인물 그림에 앞 화 인물이 끼어든다.
  //   그림 지시가 영어라 영어 한 줄로 받는다.
  it('세계 한 줄 지시에는 앞 화 제목과 인물 · 배경 모습을 싣고 시대 · 문화권 · 옷감을 영어 한 줄로 적게 한다', () => {
    const { system, prompt } = buildSeriesWorldPrompt({
      title: '프리렌 — 남겨진 마법',
      characters: [{ name: '페른', appearance: '보라색 긴 머리, 검은 로브' }],
      locations: [{ name: '마을 광장', description: '비에 젖은 돌바닥, 이끼 낀 석조 동상' }],
    })

    expect(prompt).toContain('프리렌 — 남겨진 마법')
    expect(prompt).toContain('보라색 긴 머리, 검은 로브')
    expect(prompt).toContain('비에 젖은 돌바닥, 이끼 낀 석조 동상')
    expect(system).toMatch(/ONE English line/)
    expect(system).toMatch(/era/)
    expect(system).toMatch(/culture/)
    expect(system).toMatch(/clothing/)
    expect(system).toMatch(/never name characters/i)
    expect(system).toContain('{"world"')
  })

  // 왜: 혼자 정한 것 — 빈 답 · 틀린 모양을 세계로 적으면 그림 지시에 빈 줄이 들어간다. 너무 긴 답은 그림 지시를 밀어낸다.
  it('세계 한 줄 답이 비었거나 모양이 틀리면 없는 것으로 보고 너무 길면 자른다', () => {
    expect(parseSeriesWorldLine({ world: '  medieval  European\nfantasy  ' })).toBe('medieval European fantasy')
    expect(parseSeriesWorldLine({ world: '   ' })).toBeNull()
    expect(parseSeriesWorldLine({ world: 3 })).toBeNull()
    expect(parseSeriesWorldLine('medieval')).toBeNull()
    expect(parseSeriesWorldLine(null)).toBeNull()
    const long = parseSeriesWorldLine({ world: 'stone village '.repeat(60) })
    expect(long).not.toBeNull()
    expect(long!.length).toBeLessThanOrEqual(SERIES_WORLD_MAX_CHARS)
  })
})

function seriesOf(): SeriesSnapshot {
  return mocks.updates[0].series as SeriesSnapshot
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/project/next-episode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function getRequest(from: string): NextRequest {
  return new NextRequest(`http://localhost/api/project/next-episode?from=${encodeURIComponent(from)}`)
}

function query(table: string) {
  const result = () => ({ data: mocks.rows[table] ?? null, error: null })
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    update: vi.fn((row: Record<string, unknown>) => {
      if (table === 'projects') mocks.updates.push(row)
      return builder
    }),
    maybeSingle: vi.fn(async () => result()),
    single: vi.fn(async () => result()),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject),
  }
  return builder
}
