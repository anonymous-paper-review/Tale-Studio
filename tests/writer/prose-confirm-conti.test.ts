// 산문을 확정하면 그림체를 먼저 정하고(없을 때만) 씬 · 샷 나누기를 바로 이어 가며 콘티 화면으로 가는지, 확정 창이 그림체 카드를 언제 보이는지 검사한다 (오너 2026-11-26 O1 · O6, 리드 구조 C)
import { readFileSync } from 'node:fs'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/studio/producer' }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/features/series/use-series-info', () => ({ useSeriesInfo: () => ({ view: null }) }))
// 창은 열려 있을 때 내용을 그대로 그린다(정적 렌더에는 창 겉껍데기가 없다 — prose-one-screen 과 같은 방법).
vi.mock('@/components/ui/dialog', async () => {
  const { createElement: h } = await import('react')
  type Props = { children?: ReactNode; className?: string; 'data-testid'?: string; open?: boolean }
  const plain = (tag: string) => ({ children, className, 'data-testid': testId }: Props) => h(tag, { className, 'data-testid': testId }, children)
  return {
    Dialog: ({ open, children }: Props) => (open ? children : null),
    DialogContent: plain('div'),
    DialogHeader: plain('div'),
    DialogFooter: plain('div'),
    DialogTitle: plain('h2'),
    DialogDescription: plain('p'),
  }
})

import { confirmProseToConti, continueContiSplit } from '@/features/prose/confirm-prose-flow'
import { ProseConfirmDialog } from '@/features/prose/prose-confirm-dialog'
import { translate } from '@/lib/i18n/translate'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProducerStore, type StyleAnchor } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'

const anchors: StyleAnchor[] = [
  { key: 'watercolor', label: '수채화', medium: 'watercolor', imageUrl: null, previewUrl: null, subtitle: null },
  { key: 'anime', label: '일본 애니', medium: 'anime', imageUrl: null, previewUrl: null, subtitle: null },
]
const order: string[] = []
const confirmProse = vi.fn(async () => { order.push('confirm'); return { ok: true } as { ok: boolean; code?: string } })
const saveAndHandoff = vi.fn(async (_options?: { conti?: boolean }) => { order.push('split'); return true })
const setStyleAnchor = vi.fn(async (key: string | null) => { order.push(`style:${key}`); useProducerStore.setState({ styleAnchorKey: key }); return true })
const deps = () => ({ navigate: vi.fn(), notify: { success: vi.fn(), error: vi.fn() }, t: (text: string) => translate('ko', text) })

/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다(prose-one-screen 과 같은 방법). */
function render(node: ReturnType<typeof createElement>) {
  for (const store of [useLocaleStore, useProjectStore, useWriterRoomStore, useProducerStore, useGlobalChatStore] as Array<{ getState: () => object; getInitialState: () => object }>) Object.assign(store.getInitialState(), store.getState())
  return renderToStaticMarkup(node)
}
const confirmButton = (html: string) => html.match(/<button[^>]*data-testid="prose-confirm-yes"[^>]*>/)?.[0] ?? ''

beforeEach(() => {
  order.length = 0
  vi.clearAllMocks()
  useLocaleStore.setState({ locale: 'ko' })
  useProjectStore.setState({ projectId: 'p-prose', currentStage: 'producer' })
  useWriterRoomStore.setState({ confirmOpen: false, rewriteOpen: false })
  useGlobalChatStore.setState({ confirmProse })
  useProducerStore.setState({ saveAndHandoff, setStyleAnchor, styleAnchors: anchors, styleAnchorKey: 'watercolor', customStyleAnchor: null, error: null })
})
afterEach(() => {
  useLocaleStore.setState({ locale: 'en' })
})

describe('산문 확정 → 콘티', () => {
  // 왜: O1 — 씬 · 샷 나누기는 Artist 그림을 기다리지 않고 산문 확정 뒤 바로 돈다. 콘티(Writer 칸)에서 나누는 것을 본다.
  it('산문을 확정하면 씬 · 샷 나누기를 바로 이어 가고 콘티 화면으로 간다', async () => {
    useWriterRoomStore.setState({ confirmOpen: true })
    const d = deps()
    expect(await confirmProseToConti(d)).toBe(true)
    expect(order).toEqual(['confirm', 'split'])
    expect(saveAndHandoff).toHaveBeenCalledWith({ conti: true })
    expect(d.navigate).toHaveBeenCalledWith('/studio/conti')
    expect(d.notify.success).toHaveBeenCalledWith('산문을 확정했어요. 콘티를 열어요.')
    expect(useWriterRoomStore.getState().confirmOpen).toBe(false)
  })

  // 왜: O6 — 그림체는 산문 확정 창에서 한 번 고른다. 채팅 카드 [좋아요, 콘티 짜기로]로 눌러도 그림체 없이 나누지 않고 고르는 창을 연다(혼자 정한 것).
  it('그림체가 아직 없으면 산문을 확정하지 않고 그림체를 고르는 확정 창을 연다', async () => {
    useProducerStore.setState({ styleAnchorKey: null })
    const d = deps()
    expect(await confirmProseToConti(d)).toBe(false)
    expect(confirmProse).not.toHaveBeenCalled()
    expect(saveAndHandoff).not.toHaveBeenCalled()
    expect(useWriterRoomStore.getState().confirmOpen).toBe(true)
    expect(d.notify.error).not.toHaveBeenCalled()
  })

  // 왜: O6 — 확정 창에서 고른 그림체가 작품 그림체다. 씬 · 샷 디자인이 그 그림체를 입력으로 쓰니 확정보다 먼저 저장한다.
  it('확정 창에서 그림체를 고르면 먼저 작품 그림체로 저장하고 확정한다', async () => {
    useProducerStore.setState({ styleAnchorKey: null })
    expect(await confirmProseToConti(deps(), 'anime')).toBe(true)
    expect(order).toEqual(['style:anime', 'confirm', 'split'])
  })

  // 왜: 정상 경로 고정 — 그림체가 이미 있으면(새 프로젝트에서 고정했거나 시리즈 앞 화) 그대로 쓰고 다시 저장하지 않는다.
  it('그림체가 이미 있으면 그림체를 다시 저장하지 않고 확정한다', async () => {
    expect(await confirmProseToConti(deps())).toBe(true)
    expect(setStyleAnchor).not.toHaveBeenCalled()
    expect(order).toEqual(['confirm', 'split'])
  })

  // 왜(혼자 정한 것): 그림체를 저장하지 못했는데 확정하면 그림체 없이 디자인한다 — 확정하지 않고 알린다.
  it('고른 그림체를 저장하지 못하면 산문을 확정하지 않고 알린다', async () => {
    useProducerStore.setState({ styleAnchorKey: null })
    setStyleAnchor.mockResolvedValueOnce(false)
    const d = deps()
    expect(await confirmProseToConti(d, 'anime')).toBe(false)
    expect(confirmProse).not.toHaveBeenCalled()
    expect(d.notify.error).toHaveBeenCalled()
  })

  // 왜(혼자 정한 것): 확정은 됐는데 나누기를 시작하지 못하면(네트워크 · 서버 거절) 창을 닫지 않는다 — 다시 누르면 확정은 그대로 두고 나누기만 다시 건다.
  it('씬 · 샷 나누기를 시작하지 못하면 확정 창을 닫지 않고 "씬 · 샷 나누기를 시작하지 못했어요. 다시 눌러 주세요."라고 알린다', async () => {
    useWriterRoomStore.setState({ confirmOpen: true })
    saveAndHandoff.mockResolvedValueOnce(false)
    const d = deps()
    expect(await confirmProseToConti(d)).toBe(false)
    expect(d.notify.error).toHaveBeenCalledWith('씬 · 샷 나누기를 시작하지 못했어요. 다시 눌러 주세요.')
    expect(d.navigate).not.toHaveBeenCalled()
    expect(useWriterRoomStore.getState().confirmOpen).toBe(true)
  })

  // 왜: 정상 경로 고정 — 확정을 서버가 막으면(정하지 않은 수정안 등) 나누기를 걸지 않고 지금처럼 까닭을 알린다.
  it('산문 확정을 서버가 막으면 씬 · 샷 나누기를 걸지 않고 까닭을 알린다', async () => {
    confirmProse.mockResolvedValueOnce({ ok: false, code: 'scene_story_proposal_pending' })
    const d = deps()
    expect(await confirmProseToConti(d)).toBe(false)
    expect(saveAndHandoff).not.toHaveBeenCalled()
    expect(d.notify.error).toHaveBeenCalledWith(translate('ko', 'Apply or discard the AI proposal first, then confirm the prose.'))
  })
})

describe('콘티의 [씬 · 샷 나누기 시작]', () => {
  // 왜(혼자 정한 것): 산문 확정 뒤 나누기를 걸지 못한 채 창을 닫으면 콘티에 씬 · 샷이 없는 채로 남는다 — 콘티 화면에서 다시 걸 수 있어야 한다.
  it('콘티 화면의 [씬 · 샷 나누기 시작]을 누르면 확정한 산문으로 씬 · 샷 나누기를 이어 간다', async () => {
    const d = deps()
    expect(await continueContiSplit(d)).toBe(true)
    expect(saveAndHandoff).toHaveBeenCalledWith({ conti: true })
    expect(confirmProse).not.toHaveBeenCalled()
    expect(d.notify.error).not.toHaveBeenCalled()
  })

  // 왜(혼자 정한 것): 다시 걸어도 안 되면 까닭을 알린다 — 서버가 준 까닭이 있으면 그것을, 없으면 다시 눌러 달라고.
  it('[씬 · 샷 나누기 시작]이 실패하면 "씬 · 샷 나누기를 시작하지 못했어요. 다시 눌러 주세요."라고 알린다', async () => {
    saveAndHandoff.mockResolvedValueOnce(false)
    const d = deps()
    expect(await continueContiSplit(d)).toBe(false)
    expect(d.notify.error).toHaveBeenCalledWith('씬 · 샷 나누기를 시작하지 못했어요. 다시 눌러 주세요.')
  })
})

describe('산문 확정 창', () => {
  // 왜: O6 — 그림체가 없으면 확정 창에서 같은 그림체 카드로 고른다. 고르기 전에 확정하면 그림체 없이 씬 · 샷을 디자인한다.
  it('그림체가 없으면 산문 확정 창에 그림체 카드가 보이고 하나를 고르기 전에는 [예, 확정하기]가 꺼져 있다', () => {
    useProducerStore.setState({ styleAnchorKey: null })
    useWriterRoomStore.setState({ confirmOpen: true })
    const html = render(createElement(ProseConfirmDialog))
    expect(html.match(/data-testid="artist-style-option"/g)).toHaveLength(2)
    expect(html).toContain('Artist에서 언제든 바꿀 수 있어요')
    expect(confirmButton(html)).toMatch(/\bdisabled=""/)
  })

  // 왜: 정상 경로 고정 — 그림체가 이미 있으면 확정 창은 지금처럼 확정만 묻는다.
  it('그림체가 이미 있으면 산문 확정 창에는 그림체 카드가 없고 [예, 확정하기]가 켜져 있다', () => {
    useWriterRoomStore.setState({ confirmOpen: true })
    const html = render(createElement(ProseConfirmDialog))
    expect(html).not.toContain('data-testid="artist-style-option"')
    expect(confirmButton(html)).not.toMatch(/\bdisabled=""/)
  })

  // 왜(혼자 정한 것): O1 — 확정하면 Artist 가 아니라 씬 · 샷 나누기와 콘티가 다음이다. 창이 다음 일을 바르게 말해야 한다.
  it('산문 확정 창의 "다음" 줄은 "씬 · 샷으로 나누고 콘티를 그려요."다', () => {
    useWriterRoomStore.setState({ confirmOpen: true })
    const html = render(createElement(ProseConfirmDialog))
    expect(html).toContain('씬 · 샷으로 나누고 콘티를 그려요.')
    expect(html).not.toContain('Artist가 산문에서')
  })
})

describe('확정한 씬 스토리', () => {
  // 왜(혼자 정한 것): O1 — 씬 스토리 다음은 콘티다([Artist로 가기]는 콘티 머리 단추, 리드 결정 2차). 확정한 씬 스토리에서 Artist 로 건너뛰면 콘티를 지나친다.
  it('산문을 확정한 씬 스토리 머리 단추는 [콘티로 가기]이고 콘티 화면을 연다', () => {
    const workspace = readFileSync('src/features/prose/prose-workspace.tsx', 'utf8')
    expect(workspace).toMatch(/router\.push\(withDemoShare\('\/studio\/conti'\)\)\} data-testid="prose-go-conti"[\s\S]{0,80}t\('Go to the rough storyboard'\)/)
    expect(workspace).not.toContain('prose-go-artist')
    expect(translate('ko', 'Go to the rough storyboard')).toBe('콘티로 가기')
  })
})
