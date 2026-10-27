// 재점검을 목록에 반영하면 화면에서 고치던 설명을 먼저 저장하고, 서버가 돌려준 목록으로 바꾸며 새로 들어온 줄을 표시한다 (2026-10-27 오너)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ save: vi.fn(), order: [] as string[] }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: () => ({
          select: () => ({
            single: async () => {
              db.order.push('save')
              return db.save(patch)
            },
          }),
        }),
      }),
    }),
  }),
  createCatalogClient: vi.fn(),
}))

import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { resetActionGuard } from '@/lib/action-guard'
import type { BackgroundSource, CastMember } from '@/lib/producer-gate'

// 이 시험을 위해 새로 지은 목록 — 실제 작품이 아니다.
const minho: CastMember = { localId: 'treatment:char', characterId: 'char', name: '민호', entityType: 'person', appearance: '', origin: 'treatment' }
const hallway: BackgroundSource = { localId: 'treatment:hallway', locationId: 'hallway', name: '회사 복도', visualDescription: '', purpose: '', origin: 'treatment' }
const guard: CastMember = { localId: 'recheck:char_2', characterId: 'char_2', name: '경비원', entityType: 'person', appearance: '', role: 'supporting', origin: 'treatment' }
const ops = [{ op: 'add' as const, kind: 'person' as const, name: '경비원' }]

function serverAnswers(status: number, body: Record<string, unknown>) {
  const fetchMock = vi.fn(async () => {
    db.order.push('recheck')
    return Response.json(body, { status })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.clearAllMocks()
  resetActionGuard()
  db.order.length = 0
  vi.stubGlobal('window', {})
  useLocaleStore.setState({ locale: 'ko' })
  useProducerStore.getState().reset()
  useProjectStore.setState({ projectId: 'p1', currentStage: 'artist', reachedStage: 'artist', producerLocked: true, treatmentDraft: true })
  // 목록 다시 읽기(서버 표)는 이 시험의 범위가 아니다 — 불렸는지만 본다.
  useProducerStore.setState({ cast: [minho], backgrounds: [hallway], loadProject: vi.fn(async () => {}) })
  db.save.mockImplementation(async (patch: Record<string, unknown>) => ({ data: patch, error: null }))
})

const originalLoadProject = useProducerStore.getState().loadProject
afterEach(() => {
  useProducerStore.setState({ loadProject: originalLoadProject })
  useProducerStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('재점검 반영', () => {
  it('반영하면 고치던 설명을 먼저 저장한 뒤 서버에 보내고 서버가 돌려준 목록으로 바꾸며 새로 들어온 줄을 표시한다', async () => {
    // 왜: 정상 경로 고정. 고치던 설명이 저장되기 전에 서버가 목록을 고치면, 늦게 도착한 자동저장이 재점검 결과를 덮는다.
    useProducerStore.getState().updateCastMember('treatment:char', { appearance: '서른 살 회사원' })
    const fetchMock = serverAnswers(200, { ok: true, cast: [{ ...minho, appearance: '서른 살 회사원', userEdited: true }, guard], backgrounds: [hallway], newIds: ['recheck:char_2'] })

    const result = await useProducerStore.getState().applyRecheck(ops)

    expect(result).toEqual({ ok: true })
    expect(db.order).toEqual(['save', 'recheck'])
    expect(db.save.mock.calls[0][0]).toMatchObject({ producer_draft: { cast: [{ localId: 'treatment:char', appearance: '서른 살 회사원' }] } })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/writer/breakdown-recheck')
    expect(JSON.parse(String(init.body))).toEqual({ projectId: 'p1', ops })
    expect(useProducerStore.getState().cast.map((c) => c.name)).toEqual(['민호', '경비원'])
    expect(useProducerStore.getState().recheckNewIds).toEqual(['recheck:char_2'])
  })

  it('서버가 반영하지 않으면 목록을 그대로 두고 까닭을 알린다', async () => {
    // 왜: 다른 창에서 먼저 반영했거나 [만들기]를 이미 눌렀으면, 옛 목록으로 고친 것이 보이면 안 되고 사용자는 무엇을 할지 알아야 한다.
    serverAnswers(409, { error: 'The list changed', code: 'list_changed' })
    expect(await useProducerStore.getState().applyRecheck(ops)).toEqual({ ok: false, error: '그 사이 목록이 바뀌었어요. 재점검을 다시 열어 주세요.' })

    serverAnswers(409, { error: 'The breakdown is closed', code: 'breakdown_closed' })
    expect(await useProducerStore.getState().applyRecheck(ops)).toEqual({ ok: false, error: '그림 만들기를 이미 시작해서 여기서 목록을 고칠 수 없어요.' })

    expect(useProducerStore.getState().cast).toEqual([minho])
    expect(useProducerStore.getState().recheckNewIds).toEqual([])
  })

  it('그 사이 목록이 바뀌었다고 하면 저장된 목록을 다시 읽어 다시 연 재점검 창이 새 목록에서 시작하게 한다', async () => {
    // 왜: 옛 목록을 그대로 두면 "다시 열어 주세요"를 따라 다시 열어도 같은 옛 목록으로 고쳐 또 거절된다.
    serverAnswers(409, { error: 'The list changed', code: 'list_changed' })

    await useProducerStore.getState().applyRecheck(ops)

    expect(useProducerStore.getState().loadProject).toHaveBeenCalledOnce()
  })

  it('목록 상태를 아직 모르면(새로 고침 직후) 반영하지 않는다', async () => {
    // 왜: 산문 초안인지 읽기 전에는 목록 저장이 잠겨 있어 고치던 설명을 먼저 저장할 수 없다 — 그대로 보내면 그 설명이 사라진다.
    useProjectStore.setState({ treatmentDraft: false })
    const fetchMock = serverAnswers(200, { ok: true, cast: [minho, guard], backgrounds: [hallway], newIds: [] })

    const result = await useProducerStore.getState().applyRecheck(ops)

    expect(result).toEqual({ ok: false, error: '목록을 아직 불러오는 중이에요. 잠시 뒤 다시 눌러 주세요.' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(db.save).not.toHaveBeenCalled()
    expect(useProducerStore.getState().cast).toEqual([minho])
  })

  it('창에 보이지 않던 보관 줄을 함께 보내 서버가 창과 같은 목록으로 고친 것을 맞춰 보게 한다', async () => {
    // 왜: 시리즈 다음 화의 "보관" 줄은 재점검 창에 없다 — 서버가 그 줄까지 비교하면 창에서는 되던 넣기를 "이미 있다"며 통째로 거절했다(2026-10-27 검토 지적).
    const fetchMock = serverAnswers(200, { ok: true, cast: [minho, guard], backgrounds: [hallway], newIds: [] })

    await useProducerStore.getState().applyRecheck(ops, ['series:char_9'])

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ projectId: 'p1', ops, kept: ['series:char_9'] })
  })

  it('보낸 뒤 답을 받지 못하면 저장된 목록을 다시 읽고 창을 닫게 해 같은 고친 것을 두 번 얹지 않는다', async () => {
    // 왜: 서버는 반영했는데 답만 못 받았을 때 창을 그대로 두고 다시 누르면, 먼저 옛 목록을 저장해 반영한 줄을 지우고 같은 인물을
    //   한 번 더 넣었다(2026-10-27 검토 지적). 다시 읽은 목록을 보고 빠진 것만 다시 하면 된다.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down') }))
    const lost = await useProducerStore.getState().applyRecheck(ops)
    expect(lost).toEqual({ ok: false, reloaded: true, error: '목록이 바뀌었는지 확인하지 못했어요. 목록을 다시 불러왔으니 확인하고 빠진 것이 있으면 다시 해 주세요.' })
    expect(useProducerStore.getState().loadProject).toHaveBeenCalledOnce()

    serverAnswers(500, { error: 'boom' })
    expect(await useProducerStore.getState().applyRecheck(ops)).toMatchObject({ ok: false, reloaded: true })
    expect(useProducerStore.getState().loadProject).toHaveBeenCalledTimes(2)
  })

  it('다른 창에서 먼저 고친 목록과 이름이 부딪치면 무엇이 부딪쳤는지 말하고 저장된 목록을 다시 읽는다', async () => {
    // 왜: 예전에는 "목록을 고치지 못했어요"만 떠서 다시 눌러도 같은 까닭으로 막혔다 — 무엇을 해야 할지 알아야 한다(2026-10-27 검토 지적).
    serverAnswers(409, { error: 'The re-check was not accepted', code: 'already_listed' })
    expect(await useProducerStore.getState().applyRecheck(ops)).toEqual({ ok: false, error: '넣으려던 이름이 이미 목록에 있어요. 재점검을 다시 열어 주세요.' })
    serverAnswers(409, { error: 'The re-check was not accepted', code: 'name_taken' })
    expect(await useProducerStore.getState().applyRecheck(ops)).toEqual({ ok: false, error: '고친 이름을 이미 다른 줄이 쓰고 있어요. 재점검을 다시 열어 주세요.' })
    expect(useProducerStore.getState().loadProject).toHaveBeenCalledTimes(2)
  })
})
