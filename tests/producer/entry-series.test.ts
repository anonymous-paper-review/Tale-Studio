// 시리즈 다음 화의 Producer 시작: 이어받은 인물 · 배경이 카드 초안에 들어가고 대사 언어는 앞 화를 따른다 (2026-10-26)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

type Row = Record<string, unknown>

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  owns: vi.fn(),
  rows: new Map<string, Record<string, unknown>>(),
  updates: [] as Array<{ table: string; patch: Record<string, unknown> }>,
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.owns }))
vi.mock('@/lib/writer/run-store', () => ({ getRunStatusLight: vi.fn(async () => null) }))

// supabaseAdmin 흉내 — projects 표 하나를 메모리에 둔다(tests/producer/entry-routes.test.ts 와 같은 방식).
vi.mock('@/lib/supabase/admin', () => {
  function query(table: string, kind: 'select' | 'update', patch?: Record<string, unknown>) {
    const filters: Array<(row: Record<string, unknown>) => boolean> = []
    let returning = false
    const run = () => {
      const matched = [...mocks.rows.values()].filter((row) => filters.every((f) => f(row)))
      if (kind === 'update') {
        mocks.updates.push({ table, patch: patch! })
        for (const row of matched) Object.assign(row, JSON.parse(JSON.stringify(patch)))
        return { data: returning ? matched.map((r) => ({ id: r.id })) : null, error: null }
      }
      return { data: matched.map((r) => JSON.parse(JSON.stringify(r))), error: null }
    }
    const q = {
      eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return q },
      in(col: string, vals: unknown[]) { filters.push((r) => vals.includes(r[col])); return q },
      select() { returning = true; return q },
      maybeSingle() { const res = run(); return Promise.resolve({ data: (res.data as unknown[] | null)?.[0] ?? null, error: null }) },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) { return Promise.resolve(run()).then(resolve, reject) },
    }
    return q
  }
  return {
    supabaseAdmin: {
      from: (table: string) => ({
        select: () => query(table, 'select'),
        update: (patch: Record<string, unknown>) => query(table, 'update', patch),
      }),
    },
  }
})

import { planEntryStart } from '@/lib/entry/start-plan'
import { evaluateProducerGate } from '@/lib/producer-gate'
import { emptyEntryDraft, type EntryDraft } from '@/lib/entry/draft'
import { cardsForHandoff, syncTreatmentCast } from '@/lib/producer/treatment-cast-sync'
import { SERIES_VERSION, type SeriesSnapshot } from '@/lib/series/snapshot'
import { POST as startEntry } from '@/app/api/produce/entry/start/route'
import { GET as getEntry } from '@/app/api/produce/entry/route'

const PID = 'project-2'
// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const IDEA = '자판기가 고쳐진 다음 날, 민호가 공짜 캔을 노리다 팀장에게 들키는 2화.'

function draftWith(over: Partial<EntryDraft> = {}): EntryDraft {
  return {
    ...emptyEntryDraft(),
    idea: IDEA,
    picks: { mood: 'comedy', runtime: 'r60', level: 'polish', ratio: '9:16' },
    ...over,
  }
}

function seriesWith(over: Partial<SeriesSnapshot> = {}): SeriesSnapshot {
  return {
    version: SERIES_VERSION,
    prevProjectId: 'project-1',
    prevTitle: '자판기의 반란',
    copiedAt: '2026-10-26T00:00:00.000Z',
    characters: [
      { characterId: 'char_minho', name: '민호', role: 'protagonist', appearance: '구겨진 셔츠를 입은 신입', personality: ['소심하다'], sheetUrl: 'https://media.test/minho.png', portraitUrl: 'https://media.test/minho-face.png', styleId: 'anime' },
      { characterId: 'char_lead', name: '팀장', role: 'supporting', appearance: '늘 웃는 중년', personality: [], sheetUrl: null, portraitUrl: null, styleId: 'anime' },
    ],
    locations: [
      { locationId: 'loc_hall', name: '회사 복도', description: '형광등 하나가 깜빡이는 긴 복도', wideShotUrl: 'https://media.test/hall.png', styleId: 'anime' },
    ],
    voices: [],
    styleId: 'anime',
    format: 'vertical_9:16',
    dialogueLanguage: 'ko',
    continuesLastScene: false,
    copyFailures: [],
    designTokens: null,
    world: null,
    ...over,
  }
}

const plan = (series: SeriesSnapshot | null, locale: 'ko' | 'en' = 'ko') =>
  planEntryStart({ projectId: PID, draft: draftWith(), locale, currentTitle: '2화', series })

describe('시리즈 다음 화의 Producer 시작', () => {
  it('시리즈 다음 화를 시작하면 이어받은 인물 · 배경이 Producer 카드 초안에 들어간다', () => {
    // 왜: 다음 화는 앞 화 인물 · 배경을 그대로 쓴다. 카드가 비어 시작하면 사용자가 같은 인물을 다시 적어야 한다.
    const result = plan(seriesWith())
    if (!result.ok) throw new Error(result.code)
    expect(result.producerDraft.cast).toEqual([
      { localId: 'series:char_minho', characterId: 'char_minho', name: '민호', entityType: 'person', appearance: '구겨진 셔츠를 입은 신입', role: 'protagonist', origin: 'producer', inherited: true },
      { localId: 'series:char_lead', characterId: 'char_lead', name: '팀장', entityType: 'person', appearance: '늘 웃는 중년', role: 'supporting', origin: 'producer', inherited: true },
    ])
    expect(result.producerDraft.backgrounds).toEqual([
      { localId: 'series:loc_hall', locationId: 'loc_hall', name: '회사 복도', visualDescription: '형광등 하나가 깜빡이는 긴 복도', purpose: '', origin: 'producer', inherited: true },
    ])
    // Writer 시작 요청은 비운다 — 서버 writer/start 가 projects.series 를 읽어 합친다.
    expect(result.writerStart.cast).toEqual({ characters: [] })
    expect(result.writerStart.backgrounds).toEqual({ locations: [] })
  })

  it('시리즈 다음 화의 대사 언어는 앞 화 대사 언어를 따른다', () => {
    // 왜: 대사 언어가 바뀌면 이어받은 말투를 쓸 수 없다. 사이트 언어가 달라도 앞 화 언어로 잠근다.
    const japanese = plan(seriesWith({ dialogueLanguage: 'ja' }), 'ko')
    expect(japanese.ok && japanese.settings.dialogueLanguage).toBe('ja')
    expect(japanese.ok && japanese.producerDraft.settings.dialogueLanguage).toBe('ja')
    // 앞 화 대사 언어를 읽지 못했으면 지금처럼 프로젝트 언어를 쓴다.
    const unknown = plan(seriesWith({ dialogueLanguage: null }), 'en')
    expect(unknown.ok && unknown.settings.dialogueLanguage).toBe('en')
  })

  it('시리즈가 아닌 프로젝트는 지금처럼 빈 카드로 시작한다', () => {
    // 왜: 새 프로젝트는 Writer 가 산문 초안에서 인물 · 배경을 만든다. 시리즈 배선이 새 프로젝트를 바꾸면 안 된다.
    const fresh = plan(null, 'ko')
    if (!fresh.ok) throw new Error(fresh.code)
    expect(fresh.producerDraft.cast).toEqual([])
    expect(fresh.producerDraft.backgrounds).toEqual([])
    expect(fresh.settings.dialogueLanguage).toBe('ko')
  })

  it('이어받은 카드는 산문 초안이 만든 카드에 덮이지 않는다', () => {
    // 왜: 산문 초안(트리트먼트)은 앞 화 인물을 다른 설명으로 다시 부른다. 이어받은 카드가 덮이면 앞 화 외모 · 이름이 사라진다.
    const result = plan(seriesWith())
    if (!result.ok) throw new Error(result.code)
    const synced = syncTreatmentCast(
      { cast: result.producerDraft.cast, backgrounds: result.producerDraft.backgrounds, syncedVersion: null },
      {
        characters: [
          { id: 'char_minho', name: '민호', role: 'protagonist', entityType: 'person', appearance: '트리트먼트가 새로 쓴 외모', want: '공짜 캔' },
          { id: 'char_guard', name: '경비원', role: 'supporting', entityType: 'person', appearance: '야간 근무 중', want: '조용한 밤' },
        ],
        locations: [
          { id: 'loc_hall', name: '회사 복도', description: '트리트먼트가 새로 쓴 복도 설명' },
          { id: 'loc_roof', name: '옥상', description: '난간이 낮은 옥상' },
        ],
      },
      'v1',
    )
    expect(synced.cast.find((c) => c.characterId === 'char_minho')).toMatchObject({ appearance: '구겨진 셔츠를 입은 신입', origin: 'producer' })
    expect(synced.backgrounds.find((b) => b.locationId === 'loc_hall')).toMatchObject({ visualDescription: '형광등 하나가 깜빡이는 긴 복도', origin: 'producer' })
    // 이어받은 카드가 있어도 트리트먼트가 새로 부른 인물 · 장소는 그대로 더해진다.
    expect(synced.cast.map((c) => c.name)).toEqual(['민호', '팀장', '경비원'])
    expect(synced.backgrounds.map((b) => b.name)).toEqual(['회사 복도', '옥상'])
  })

  it('이어받은 인물 · 배경의 빈 변화 · 동기 · 목적은 Artist 만들기를 막지 않는다', () => {
    // 왜: 변화 · 동기 · 목적은 이번 화에서 새로 정한다. 이번 산문에 안 나오는 이어받은 인물은 채울 값이 없다.
    //   산문 초안이 만든 카드처럼 채우면 좋은 것으로만 보여야 [목록이 맞아요 · 그림 만들기]가 막히지 않는다(2026-10-26 로컬 확인에서 막혔다).
    const result = plan(seriesWith())
    if (!result.ok) throw new Error(result.code)
    const gate = (cast: typeof result.producerDraft.cast, backgrounds: typeof result.producerDraft.backgrounds) =>
      evaluateProducerGate({ settings: { ...result.settings, playtime: 120 }, storyReady: true, cast, backgrounds, styleAnchorKey: 'anime', locale: 'ko' })
    const inherited = gate(result.producerDraft.cast, result.producerDraft.backgrounds)
    expect(inherited.hardMissing).toEqual([])
    expect(inherited.canHandoff).toBe(true)
    expect(inherited.softMissing.map((i) => i.label)).toContain('민호: 인물의 변화(시작/끝/유형) 필요')
    // 사람이 직접 만든 카드는 지금처럼 빈 변화 · 동기가 만들기를 막는다.
    const handMade = gate(
      result.producerDraft.cast.map(({ inherited: _inherited, ...card }) => card),
      result.producerDraft.backgrounds.map(({ inherited: _inherited, ...card }) => card),
    )
    expect(handMade.canHandoff).toBe(false)
  })

  it('이어받은 카드는 Writer로 넘길 때 그대로 넘어간다', () => {
    // 왜: 손대지 않은 트리트먼트 카드는 넘길 때 빠진다. 이어받은 카드까지 빠지면 앞 화 인물이 2화에서 사라진다.
    const result = plan(seriesWith())
    if (!result.ok) throw new Error(result.code)
    const handoff = cardsForHandoff({ cast: result.producerDraft.cast, backgrounds: result.producerDraft.backgrounds })
    expect(handoff.cast.map((c) => c.characterId)).toEqual(['char_minho', 'char_lead'])
    expect(handoff.backgrounds.map((b) => b.locationId)).toEqual(['loc_hall'])
  })
})

describe('시리즈 다음 화의 시작 라우트', () => {
  function seed(over: Row = {}): Row {
    const row: Row = {
      id: PID,
      workspace_id: 'ws1',
      title: '2화',
      locale: 'ko',
      current_stage: 'entry',
      entry_draft: { version: 1, idea: IDEA, file: null, rec: null, picks: { mood: 'comedy', runtime: 'r60', level: 'polish', ratio: '9:16' }, chat: { answered: {}, pre: {} }, startedAt: null },
      settings: null,
      story_text: null,
      producer_draft: null,
      series: null,
      ...over,
    }
    mocks.rows.set(PID, row)
    return row
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rows.clear()
    mocks.updates.length = 0
    mocks.getUser.mockResolvedValue({ id: 'user-1' })
    mocks.owns.mockResolvedValue(true)
  })

  it('시작 라우트는 프로젝트의 앞 화 정보를 읽어 카드 초안과 대사 언어에 싣는다', () => {
    // 왜: 카드 초안은 서버가 한 번에 저장한다. 라우트가 앞 화 정보를 읽지 않으면 화면만 시리즈이고 카드는 빈 채로 저장된다.
    seed({ series: { ...seriesWith({ dialogueLanguage: 'ja' }) } })
    return startEntry(new NextRequest('http://localhost/api/produce/entry/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: PID }),
    })).then(async (res) => {
      expect(res.status).toBe(200)
      const saved = mocks.rows.get(PID) as Row
      const draft = saved.producer_draft as { cast: Array<Record<string, unknown>>; backgrounds: Array<Record<string, unknown>> }
      expect(draft.cast.map((c) => c.characterId)).toEqual(['char_minho', 'char_lead'])
      expect(draft.backgrounds.map((b) => b.locationId)).toEqual(['loc_hall'])
      expect(saved.settings).toMatchObject({ dialogueLanguage: 'ja' })
      await res.json()
    })
  })

  it('시작 화면을 열면 시리즈 다음 화의 앞 화 비율 · 언어 · 이어받은 개수를 함께 돌려준다', async () => {
    // 왜: 설정 화면이 앞 화 비율에 "앞 화" 표시를 붙이고 언어를 잠가 보여 주려면 시작 화면을 열 때 이 값을 알아야 한다.
    seed({ series: seriesWith({ dialogueLanguage: 'ja', continuesLastScene: true }) })
    const res = await getEntry(new NextRequest(`http://localhost/api/produce/entry?projectId=${PID}`))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { series: unknown }
    expect(body.series).toEqual({ ratio: '9:16', dialogueLanguage: 'ja', characters: 2, locations: 1, hasVoices: false, continuesLastScene: true })

    // 시리즈가 아닌 프로젝트는 앞 화 정보가 없다.
    seed({ series: null })
    const fresh = (await (await getEntry(new NextRequest(`http://localhost/api/produce/entry?projectId=${PID}`))).json()) as { series: unknown }
    expect(fresh.series).toBeNull()
  })
})
