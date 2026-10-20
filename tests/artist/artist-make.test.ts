// 리뉴얼 1차: 산문을 확정해도 Artist [만들기] 전까지는 인물 · 배경 설명 · 스타일을 고칠 수 있고, [만들기]는 멈추지 않고 씬 · 샷까지 이어 간다 (2026-10-19, 2026-10-20 오너)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
const db = vi.hoisted(() => ({ updates: [] as Array<{ table: string; row: Record<string, unknown> }>, project: { style_anchor_key: 'anime', custom_style_anchor: null } as Record<string, unknown> }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({
      update: (row: Record<string, unknown>) => {
        db.updates.push({ table, row })
        if (table === 'projects') Object.assign(db.project, row)
        const q = { eq: () => q, then: (resolve: (v: unknown) => unknown) => resolve({ error: null }) }
        return q
      },
      select: () => {
        const q = { eq: () => q, maybeSingle: async () => ({ data: { ...db.project }, error: null }) }
        return q
      },
    }),
  }),
}))

import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

let request: ReturnType<typeof vi.fn>

beforeEach(() => {
  db.updates = []
  db.project = { style_anchor_key: 'anime', custom_style_anchor: null }
  useProjectStore.setState({ projectId: 'art-project', currentStage: 'artist', reachedStage: 'artist', producerLocked: true, treatmentDraft: true })
  useProducerStore.setState({
    storyText: '자판기 앞에서 벌어진 일',
    storyReady: true,
    preserveScript: null,
    styleAnchorKey: 'anime',
    projectSettings: { playtime: 60, genre: '코미디', format: 'horizontal_16:9', tone: [], dialogueLanguage: 'ko' },
    cast: [{ localId: 'a', name: '민호', entityType: 'person', appearance: '회사원', origin: 'treatment', treatmentHash: 'h' }],
    backgrounds: [{ localId: 'x', name: '회사 복도', visualDescription: '복도', purpose: '', origin: 'treatment', treatmentHash: 'h2' }],
    error: null,
    syncing: false,
  })
  request = vi.fn(async () => Response.json({ ok: true, sceneGate: false }))
  vi.stubGlobal('fetch', request)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('만들기 전 브레이크다운 목록', () => {
  // 왜: 프로토타입 A1 "줄마다 설명을 고칠 수 있다" — 산문은 잠겼어도 목록은 [만들기] 전까지 고친다.
  it('산문을 확정해도 만들기 전에는 인물 · 배경 설명을 고칠 수 있다', () => {
    useProducerStore.getState().updateCastMember('a', { appearance: '서른 살 회사원, 남색 정장' })
    useProducerStore.getState().updateBackground('x', { visualDescription: '형광등이 깜빡이는 복도' })

    expect(useProducerStore.getState().cast[0].appearance).toBe('서른 살 회사원, 남색 정장')
    expect(useProducerStore.getState().backgrounds[0].visualDescription).toBe('형광등이 깜빡이는 복도')
  })

  // 왜: [만들기]를 누르면 그 목록으로 그림을 만든다 — 그 뒤에는 목록을 고치지 않는다(인물 · 배경은 카드에서 고친다).
  it('만들기를 누른 뒤에는 브레이크다운 목록을 고치지 않는다', () => {
    useProjectStore.setState({ treatmentDraft: false })

    useProducerStore.getState().updateCastMember('a', { appearance: '바뀐 설명' })

    expect(useProducerStore.getState().cast[0].appearance).toBe('회사원')
  })

  // 왜: 확정한 산문은 잠겨 있다 — 목록을 고칠 수 있는 동안에도 산문을 다시 쓰지 않는다.
  it('확정한 산문은 만들기 전에도 다시 쓰지 않는다', async () => {
    expect(await useProducerStore.getState().startTreatment()).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })
})

describe('Artist 만들기', () => {
  // 왜: 2026-10-20 오너 "Artist 만들면서 씬 · 샷과 Storyboard 도 같이(시간 절약)" — [만들기] = 확정 산문 초안을 이어 가며
  //   인물 · 배경 디자인 뒤에도 멈추지 않고 씬 · 샷 나누기까지 만든다(예전에는 디자인 뒤 멈춰 [완료하기]를 기다렸다).
  it('만들기를 누르면 산문 초안을 이어 가며 인물 · 배경 디자인 뒤에도 멈추지 않고 씬 · 샷까지 만든다', async () => {
    expect(await useProducerStore.getState().saveAndHandoff({ artistGate: true })).toBe(true)

    const [url, init] = request.mock.calls[0]
    expect(String(url)).toBe('/api/writer/start')
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body).toMatchObject({ projectId: 'art-project', continueDraft: true })
    expect(body.artistGate).toBeUndefined()
  })

  // 왜: 만드는 동안과 그 뒤에도 Artist 화면에 머문다(Storyboard 는 [완료하기]로 연다).
  it('만들기를 눌러도 Artist 화면에 머문다', async () => {
    await useProducerStore.getState().saveAndHandoff({ artistGate: true })

    expect(useProjectStore.getState().currentStage).toBe('artist')
    expect(useProjectStore.getState().reachedStage).toBe('artist')
  })

  // 왜: 스타일은 작품에 하나 — Artist 스타일 팝업에서 고른 스타일을 저장한다(산문 확정 뒤에도).
  it('만들기 전에는 스타일을 고를 수 있다', async () => {
    expect(await useProducerStore.getState().setStyleAnchor('watercolor')).toBe(true)
    expect(db.updates.some((u) => u.table === 'projects' && u.row.style_anchor_key === 'watercolor')).toBe(true)
  })
})
