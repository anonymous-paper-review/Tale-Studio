// 채팅 AI 가 읽는 현황 스냅샷의 producer 부분은 지금 화면 흐름에 맞는다 — 옛 Producer 관문 항목은 막힌 점으로 내지 않고, 인물 · 배경 수는 브레이크다운 목록으로, 그린 그림 수는 따로 싣는다 (리드 2026-11-14 H · D)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  producerDraft: null as unknown,
  styleAnchorKey: null as string | null,
  assets: { images_ready: false, chars_ready: 0, chars_total: 0, worlds_ready: 0, worlds_total: 0, queued_count: 0, failed_count: 0, stalled: false },
  seriesView: null as unknown,
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: { id: 'p', current_stage: 'artist', producer_draft: db.producerDraft, story_text: 'saved story', settings: {}, style_anchor_key: db.styleAnchorKey }, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ count: 0, error: null }).then(resolve),
      }
      return query
    },
  }),
}))

import { loadSeriesInfo } from '@/features/series/use-series-info'
import { createProjectWorkflow } from '@/lib/chat-tools/project-workflow'
import { createStudioWorkflow } from '@/stores/chat-workflow-bindings'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

// 이 시험을 위해 새로 지은 글 — 실제 사용자의 글이 아니다.
const person = (localId: string, name: string, characterId?: string) => ({ localId, name, entityType: 'person' as const, appearance: `${name}의 겉모습`, ...(characterId ? { characterId } : {}) })
const thing = (localId: string, name: string) => ({ localId, name, entityType: 'object' as const, appearance: '' })
const place = (localId: string, name: string, locationId?: string) => ({ localId, name, visualDescription: `${name}의 모습`, purpose: '', ...(locationId ? { locationId } : {}) })
const draftOf = (cast: unknown[], backgrounds: unknown[]) => ({ version: 1, savedAt: 1, storyText: '저장된 이야기', storyReady: true, settings: {}, cast, backgrounds })

beforeEach(() => {
  db.producerDraft = null
  db.styleAnchorKey = null
  db.assets = { images_ready: false, chars_ready: 0, chars_total: 0, worlds_ready: 0, worlds_total: 0, queued_count: 0, failed_count: 0, stalled: false }
  db.seriesView = null
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ projectId: 'p' })
  useProducerStore.setState({ cast: [], backgrounds: [] })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/project/') && url.includes('/series')) return Response.json({ view: db.seriesView })
    return Response.json({ started: true, draft: false, current_status: 'completed', assets: db.assets })
  }))
})
afterEach(() => vi.unstubAllGlobals())

const options = (stage = 'artist', projectId = 'p') => ({ projectId, stage, message: '상태 알려줘', signal: new AbortController().signal, isCurrent: () => true, requiresEdit: false, outcomes: () => [], navigate: vi.fn(async () => ({ status: 'navigation_requested' })), handoff: vi.fn(async () => ({ status: 'approval_required' })) })
async function snapshot(stage = 'artist', projectId = 'p') {
  const result = await createStudioWorkflow(options(stage, projectId))({ type: 'tool_use', id: 's', name: 'project_workflow', input: { action: 'status' } })
  expect(result.status).toBe('ok')
  return (result as unknown as { state: { producer: Record<string, unknown> & { breakdown: { characters: number; backgrounds: number } }; artist: Record<string, unknown> } }).state
}

describe('옛 Producer 관문 항목', () => {
  it('현황 스냅샷의 막힌 점과 권장 목록에 옛 Producer 관문 항목(영상 스타일 · 장르 · 길이 · 서브장르 · 톤 · 장소 목적)을 싣지 않는다', async () => {
    // 왜: Artist 채팅이 "Video style needed" · "서브장르 · 톤" · "장소 목적" 같은 옛 관문 항목을 막힌 점으로 읽어 안내했다 — 지금 화면 흐름에는 그 관문이 없다(바우처 사용자 채팅 D · H).
    db.producerDraft = draftOf([person('c1', '서윤')], [place('b1', '카페')])
    db.styleAnchorKey = null

    const state = await snapshot()

    expect(state.producer.blockers).toEqual([])
    expect(state.producer.softWarnings).toEqual([])
  })

  it('저장된 Producer 초안이 없어도 "Producer source has not been loaded"를 막힌 점으로 내지 않는다', async () => {
    // 왜: 새 흐름의 프로젝트는 옛 Producer 초안이 비어 있는 것이 정상이다.
    db.producerDraft = null

    expect((await snapshot()).producer.blockers).toEqual([])
  })

  it('시험이 못 박은 키(canHandoff · blockers · softWarnings · savedDraft · committed · styleAnchorKey)는 그대로 있다', async () => {
    // 왜: 도구 판정(createProjectWorkflow)과 기존 시험이 이 키로 읽는다 — 값만 지금 흐름에 맞추고 키 이름은 바꾸지 않는다.
    db.producerDraft = draftOf([], [])

    const state = await snapshot()

    for (const key of ['canHandoff', 'blockers', 'softWarnings', 'savedDraft', 'committed', 'styleAnchorKey']) expect(state.producer, key).toHaveProperty(key)
    expect(typeof state.producer.canHandoff).toBe('boolean')
    expect(Array.isArray(state.producer.blockers)).toBe(true)
  })

  it('옛 관문이 막힌 점이 아니라는 것과 canHandoff 가 옛 Invite Writer 승인에만 쓰인다는 것을 스냅샷에 적는다', async () => {
    // 왜: 키를 남기면서 값이 비면 모델이 "canHandoff: false"를 막힘으로 읽을 수 있다.
    const state = await snapshot()

    expect(String(state.producer.note)).toContain('blocks nothing')
    expect(String(state.producer.note)).toContain('Invite Writer')
  })

  it('아직 시작하지 않은 Writer 를 채팅으로 넘기려 하면 옛 관문 항목 대신 화면 순서로 안내한다', async () => {
    // 왜: 막힌 점 목록이 비었는데 "Producer requirements are not ready."만 남으면 모델이 지어낸 이유를 댄다. 지금은 Producer 시작 화면 → Writer 산문 확정 → Artist 순서로 열린다.
    const base = { projectId: 'p', currentStage: 'producer', reachedStage: 'producer', allowedStages: ['producer'], writer: { started: false, status: null }, artist: { images_ready: false } }
    const run = createProjectWorkflow({
      read: async () => ({ ...base, producer: { canHandoff: false, blockers: [] } }),
      refresh: async () => {}, navigate: async () => ({ status: 'navigation_requested' }), handoff: async () => ({ status: 'approval_required' }), resume: async () => ({ status: 'queued' }),
      authorized: () => true, isCurrent: () => true, outcomes: () => [], requiresEdit: false,
    })

    const result = await run({ type: 'tool_use', id: 'h', name: 'project_workflow', input: { action: 'handoff', targetStage: 'writer' } })

    expect(result.status).toBe('blocked')
    expect(String(result.message)).toContain('Producer start screen')
    expect(String(result.message)).toContain('Artist screen')
    expect(String(result.message)).not.toContain('requirements are not ready')
  })
})

describe('인물 · 배경 수와 그린 그림 수', () => {
  it('인물 · 배경 수는 브레이크다운 목록(인물 · 배경 카드)으로 세고 사물은 세지 않는다', async () => {
    // 왜: 그림 카드가 아직 없어 "인물 0 · 배경 0"이라 답했는데 화면 목록에는 인물 2 · 배경 3이 있었다(바우처 사용자 채팅 H). 사물은 Artist 카드가 없다.
    db.producerDraft = draftOf([person('c1', '서윤'), person('c2', '하준'), thing('o1', '낡은 시계')], [place('b1', '카페'), place('b2', '옥상'), place('b3', '골목')])

    const state = await snapshot()

    expect(state.producer.breakdown).toMatchObject({ characters: 2, backgrounds: 3 })
  })

  it('그린 그림 수는 목록 수와 따로 싣고 그림 카드가 아직 없어 0 · 0 이어도 목록 수는 그대로 말한다', async () => {
    // 왜: 목록 수와 그림 수를 한 숫자처럼 말하면 "인물이 0명"이 된다. 그림은 [만들기] 뒤에 생기는 카드 기준이다.
    db.producerDraft = draftOf([person('c1', '서윤'), person('c2', '하준')], [place('b1', '카페'), place('b2', '옥상'), place('b3', '골목')])

    const state = await snapshot()

    expect(state.producer.breakdown).toMatchObject({ characters: 2, backgrounds: 3 })
    expect(state.artist.pictures).toMatchObject({ characters: { drawn: 0, cards: 0 }, backgrounds: { drawn: 0, cards: 0 } })
  })

  it('그린 그림 수는 그림 카드 수와 함께 싣고 서버가 준 숫자 키는 그대로 둔다', async () => {
    // 왜: 카드 3장 중 1장만 그려졌으면 "그린 그림 1 · 카드 3"이다. 기존 키(chars_ready 등)는 화면 잠금 갱신이 읽는다.
    db.producerDraft = draftOf([person('c1', '서윤'), person('c2', '하준')], [place('b1', '카페')])
    db.assets = { images_ready: false, chars_ready: 1, chars_total: 2, worlds_ready: 0, worlds_total: 1, queued_count: 1, failed_count: 0, stalled: false }

    const state = await snapshot()

    expect(state.artist.pictures).toMatchObject({ characters: { drawn: 1, cards: 2 }, backgrounds: { drawn: 0, cards: 1 } })
    expect(state.artist).toMatchObject({ chars_ready: 1, chars_total: 2, worlds_ready: 0, worlds_total: 1, queued_count: 1 })
    expect(state.producer.breakdown).toMatchObject({ characters: 2, backgrounds: 1 })
  })

  it('목록 수와 그림 수를 따로 말하라는 안내를 스냅샷에 적는다', async () => {
    // 왜: 숫자만 있으면 모델이 두 줄을 합쳐 말한다.
    const state = await snapshot()

    expect(String((state.producer.breakdown as unknown as { note: string }).note)).toContain('not pictures')
    expect(String((state.artist.pictures as unknown as { note: string }).note)).toContain('apart from the breakdown list')
  })

  it('Artist · Writer 화면에서는 지금 화면에 떠 있는 목록으로 세고 다른 화면에서는 저장된 초안으로 센다', async () => {
    // 왜: 목록을 고치는 화면에서는 저장 전 글까지 화면과 같은 수여야 하고, 목록이 없는 화면에서는 저장본이 기준이다.
    db.producerDraft = draftOf([person('c1', '서윤')], [place('b1', '카페')])
    useProducerStore.setState({ cast: [person('c1', '서윤'), person('c2', '하준'), person('c3', '민아')], backgrounds: [place('b1', '카페'), place('b2', '옥상')] })

    expect((await snapshot('artist')).producer.breakdown).toMatchObject({ characters: 3, backgrounds: 2 })
    expect((await snapshot('producer')).producer.breakdown).toMatchObject({ characters: 3, backgrounds: 2 })
    expect((await snapshot('director')).producer.breakdown).toMatchObject({ characters: 1, backgrounds: 1 })
  })

  it('시리즈 앞 화에서 이어받았지만 이번 산문에 안 나오는 보관 줄은 목록 수에 세지 않는다', async () => {
    // 왜: Artist 목록 머리의 "인물 N · 배경 M"이 보관 묶음을 빼고 센다 — 채팅이 다른 수를 말하면 화면과 어긋난다.
    const kept = (id: string) => ({ id, name: id, imageUrl: null, styleId: null, appearing: false, use: 'none' })
    const shown = (id: string) => ({ id, name: id, imageUrl: null, styleId: null, appearing: true, use: 'reuse' })
    db.seriesView = { prevTitle: '1화', prevProjectId: 'ep1', prevDeleted: false, characters: [shown('mina'), kept('junho')], locations: [kept('cafe')], styleId: null, currentStyleId: null, hasVoices: false, continuesLastScene: false, copyFailures: [] }
    await loadSeriesInfo('series-p', false)
    db.producerDraft = draftOf([person('c1', '미나', 'mina'), person('c2', '준호', 'junho')], [place('b1', '카페', 'cafe'), place('b2', '옥상', 'rooftop')])

    const state = await snapshot('artist', 'series-p')

    expect(state.producer.breakdown).toMatchObject({ characters: 1, backgrounds: 1 })
  })
})
