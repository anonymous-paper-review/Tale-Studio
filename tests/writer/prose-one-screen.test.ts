// Writer 산문은 한 화면이다 — 고치기 방식 전환 없이 산문 · [직접 작성] · [AI 다시 쓰기] · 오른쪽 채팅을 함께 두고, 기다리는 화면 · 확정 창에 큰 Lumi 가 나온다 (v3 오너 2026-11-03)
import { readFileSync } from 'node:fs'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const writer = vi.hoisted(() => ({ status: null as unknown, preview: null as unknown }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/studio/producer' }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/writer/use-writer-status', async (original) => ({
  ...(await original<typeof import('@/lib/writer/use-writer-status')>()),
  useWriterStatus: () => ({ status: writer.status, error: null, restart: vi.fn() }),
  restartWriterStatus: vi.fn(),
}))
vi.mock('@/lib/writer/use-writer-preview', async (original) => ({
  ...(await original<typeof import('@/lib/writer/use-writer-preview')>()),
  useWriterPreview: () => ({ preview: writer.preview, loading: false, failed: false }),
}))
// 창은 열려 있을 때 내용을 그대로 그린다(정적 렌더에는 창 겉껍데기가 없다 — style-version-screen 과 같은 방법).
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

import { ProseWorkspace } from '@/features/prose/prose-workspace'
import { ProseConfirmDialog } from '@/features/prose/prose-confirm-dialog'
import { proseConditionChips } from '@/lib/prose/conditions'
import { proseWaitingLumi, variantsPickerOpen } from '@/lib/prose/screen'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore, writerRightChatHidden } from '@/stores/writer-room-store'

const read = (path: string) => readFileSync(path, 'utf8')
const P1 = '회사 복도, 오후 세 시. 민호가 자판기 버튼을 누르지만 아무것도 나오지 않는다.'
const P2 = '자판기가 덜컹거리더니 캔이 우르르 쏟아진다.'

function preview(over: Record<string, unknown> = {}) {
  return {
    started: true, running: false, completed: false, failed: false, engine: 'v1', draft: true,
    roster: [], characters: [],
    scenes: [{ sceneId: 'scene_1', index: 0, beats: [P1], shotStories: [] }, { sceneId: 'scene_2', index: 1, beats: [P2], shotStories: [] }],
    proseConditions: { runtimeSeconds: 15, genre: '코미디', seed: 'keep' },
    proseLocked: false,
    ...over,
  }
}
/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다(style-version-screen 과 같은 방법). */
function serveCurrent() {
  for (const store of [useLocaleStore, useProjectStore, useWriterRoomStore, useProducerStore, useGlobalChatStore] as Array<{ getState: () => object; getInitialState: () => object }>) Object.assign(store.getInitialState(), store.getState())
}
const render = (element: ReturnType<typeof createElement>) => {
  serveCurrent()
  return renderToStaticMarkup(element)
}
const html = () => render(createElement(ProseWorkspace))

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  useProjectStore.setState({ projectId: 'prose-project', projectTitle: '자판기의 반란', currentStage: 'producer', reachedStage: 'producer', producerLocked: false, treatmentDraft: true, projectLocale: 'ko' })
  useWriterRoomStore.setState({ paragraph: null, confirmOpen: false, rewriteOpen: false, manualRequest: 0 })
  writer.status = { started: true, current_status: 'awaiting_confirmation', current_stage: 'storyCheck', draft: true }
  writer.preview = preview()
})
afterEach(() => {
  useLocaleStore.setState({ locale: 'en' })
})

describe('한 화면', () => {
  // 왜: 오너 결정 7 — 위쪽 고치기 방식 전환을 뺐다. 산문과 고치는 길(직접 작성 · AI 다시 쓰기 · 채팅)이 늘 같이 보인다.
  it('Writer 산문 화면에는 [화면에서 고치기 | 채팅으로 고치기] 전환이 없고 산문 · [직접 작성] · [AI 다시 쓰기]가 함께 있다', () => {
    const out = html()

    expect(out).not.toContain('prose-tab-screen')
    expect(out).not.toContain('prose-tab-chat')
    expect(out).not.toContain('화면에서 고치기')
    expect(out).not.toContain('채팅으로 고치기')
    expect(out).toContain('data-testid="prose-article"')
    expect(out).toContain('직접 작성')
    expect(out).toContain('AI 다시 쓰기')
    expect(out).toContain('브레이크다운하기')
  })

  // 왜: 예전 채팅 탭은 가운데가 채팅이라 오른쪽 채팅을 닫았다. 그 기억이 남아 있어도 한 화면에서는 오른쪽 채팅이 열려야 고칠 수 있다.
  it('예전에 채팅으로 고치기를 골랐어도 Writer 산문 화면은 오른쪽 채팅을 연다', () => {
    localStorage.setItem('tale.workspaceTab', 'chat')
    try {
      html()

      expect(read('src/features/prose/prose-workspace.tsx')).not.toMatch(/loadTab\(/)
      expect(writerRightChatHidden({ tab: useWriterRoomStore.getState().tab, locked: false })).toBe(false)
    } finally {
      localStorage.removeItem('tale.workspaceTab')
    }
  })

  // 왜: 전환을 빼도 손으로 직접 고치는 길(직접 작성 창)은 그대로 있어야 한다 — 같은 창을 연다.
  it('[직접 작성]을 누르면 지금처럼 직접 고치는 창이 열린다', () => {
    const out = html()

    expect(out).toMatch(/<button[^>]*data-testid="prose-manual-open"(?![^>]*disabled)[^>]*>/)
    expect(read('src/features/prose/condition-bar.tsx')).toMatch(/onClick=\{\(\) => useWriterRoomStore\.getState\(\)\.requestManual\(\)\}[^>]*data-testid="prose-manual-open"/)
    expect(read('src/features/prose/manual-edit-dialog.tsx')).toMatch(/useWriterRoomStore\(\(s\) => s\.manualRequest\)/)
  })

  // 왜: 시안의 안내 — 문단을 누를 수 있을 때만 그 방법을 알린다. 잠긴 산문에 안내가 남으면 눌러도 아무 일이 없다.
  it('문단을 누를 수 있을 때만 "문단을 누르면 그 문단만 채팅에서 고칠 수 있어요" 안내가 보인다', () => {
    expect(html()).toContain('문단을 누르면 그 문단만 채팅에서 고칠 수 있어요.')

    useProjectStore.setState({ producerLocked: true, treatmentDraft: false })
    writer.preview = preview({ proseLocked: true })
    expect(html()).not.toContain('문단을 누르면 그 문단만 채팅에서 고칠 수 있어요.')
  })

  // 왜: 예전에는 화면 탭에서만 세 가지 안 고르기 창이 떴다(채팅 탭은 채팅 안 카드). 탭이 없으니 다 쓰이면 늘 창으로 고른다.
  it('세 가지 안이 다 나오면 세 가지 안 고르기 창이 열린다', () => {
    const variants = [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }]
    expect(variantsPickerOpen({ proposal: { status: 'ready', variants }, locked: false })).toBe(true)
    expect(variantsPickerOpen({ proposal: { status: 'generating', variants }, locked: false })).toBe(false)
    expect(variantsPickerOpen({ proposal: { status: 'ready', variants }, locked: true })).toBe(false)
    expect(variantsPickerOpen({ proposal: { status: 'ready' }, locked: false })).toBe(false)
  })
})

describe('지금 산문 조건 칩', () => {
  // 왜: 시안의 조건 칩은 제품 데이터에 있는 값만 — 정하지 않은 길이 · 장르를 지어내 보이지 않는다.
  it('조건 칩은 정해진 길이 · 장르만 보이고 소재는 늘 보인다', () => {
    expect(proseConditionChips({ runtimeSeconds: 15, genre: '코미디', seed: 'keep' }, 'ko')).toEqual([
      { key: 'length', label: '길이', value: '15초 이하' },
      { key: 'genre', label: '장르', value: '코미디' },
      { key: 'seed', label: '소재', value: '그대로' },
    ])
    expect(proseConditionChips({ runtimeSeconds: null, genre: ' ', seed: 'new' }, 'ko')).toEqual([
      { key: 'seed', label: '소재', value: '새롭게' },
    ])
  })
})

describe('큰 Lumi', () => {
  // 왜: 오너 결정 8 — Producer 에서 넘어와 산문 초안을 기다리는 화면이 핵심 자리다. 산문을 고치는 동안(같은 단계 안)은 단계 넘김이 아니다.
  it('산문 초안을 쓰는 동안 기다리는 화면에만 Writer 옷을 입은 Lumi가 나온다', () => {
    expect(proseWaitingLumi({ kind: 'draft', step: 1 })).toBe('writer')
    expect(proseWaitingLumi({ kind: 'revise' })).toBeNull()
    expect(proseWaitingLumi({ kind: 'rewrite' })).toBeNull()
    expect(proseWaitingLumi(null)).toBeNull()
  })

  // 왜: 오너 결정 8 — 확정 창("산문을 확정할까요?")은 큰 Lumi 자리다. 지금 단계(Writer) 옷 · 기본 모습.
  it('산문 확정 창에는 Writer 옷을 입은 Lumi가 나온다', () => {
    useWriterRoomStore.setState({ confirmOpen: true })

    const out = render(createElement(ProseConfirmDialog))

    expect(out).toContain('산문을 확정할까요?')
    expect(out).toContain('/lumi/full/writer-idle.webp')
  })
})
