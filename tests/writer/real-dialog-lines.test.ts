// Storyboard 카드를 누르면 뜨는 샷 팝업에 대사가 늘 보이는지 — 대사 없는 샷도 "대사" 자리와 "대사 없음", 말하는 사람은 보드 카드와 같은 이름, 대사가 있으면 대사 탭 · 없으면 Writer 콘티로 안내, 한국어 · 영어 — 를 검사한다 (오너 2026-11-27 P1 · 검토 rev-flow-2-2)
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const data = vi.hoisted(() => ({
  locale: 'ko' as 'ko' | 'en',
  project: { projectId: 'p1' },
  writer: {
    sceneManifest: { scenes: [{ sceneId: 's1', location: '', timeOfDay: '' }], characters: [{ characterId: 'mina', name: '미나' }], locations: [] },
    shots: [] as Array<Record<string, unknown>>,
  },
  images: { projectId: 'p1', images: {} as Record<string, unknown> },
}))
vi.mock('@/stores/project-store', () => ({ useProjectStore: Object.assign((select: (s: unknown) => unknown) => select(data.project), { getState: () => data.project }) }))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: (select: (s: unknown) => unknown) => select(data.writer) }))
vi.mock('@/lib/storyboard/real-images-store', () => ({ useStoryboardRealImages: Object.assign((select: (s: unknown) => unknown) => select(data.images), { getState: () => ({ load: vi.fn(async () => {}) }) }) }))
vi.mock('@/lib/generation-queue', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), useActiveGenerationJobs: () => [] }))
vi.mock('@/stores/global-chat-store', () => ({ useGlobalChatStore: Object.assign(() => null, { getState: () => ({ sendMessage: vi.fn(), loading: false }) }) }))
vi.mock('@/stores/locale-store', () => ({ useLocaleStore: Object.assign((select: (s: unknown) => unknown) => select({ locale: data.locale }), { getState: () => ({ locale: data.locale }) }) }))
vi.mock('@/stores/chat-ui-store', () => ({ useChatUiStore: Object.assign(() => null, { getState: () => ({ setCollapsed: vi.fn() }) }) }))
vi.mock('@/components/lumi/lumi', () => ({ Lumi: () => null }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useLocale: () => data.locale, useT: () => (text: string, params?: Record<string, string | number>) => translate(data.locale, text, params) }
})
// 창은 열려 있을 때 내용을 그대로 그린다(정적 렌더에는 창 겉껍데기가 없다 — real-dialog · real-arrow-dialog 와 같은 방법).
vi.mock('@/components/ui/dialog', async () => {
  const { createElement: h } = await import('react')
  type Props = { children?: ReactNode; className?: string; open?: boolean }
  const plain = (tag: string) => ({ children, className }: Props) => h(tag, { className }, children)
  return {
    Dialog: ({ open, children }: Props) => (open ? children : null),
    DialogContent: plain('div'),
    DialogHeader: plain('div'),
    DialogFooter: plain('div'),
    DialogTitle: plain('h2'),
    DialogDescription: plain('p'),
  }
})

import { RealShotDialog } from '@/features/storyboard/real-shot-dialog'
import { translate } from '@/lib/i18n/translate'

// 이 시험을 위해 지은 보드 — 샷 a 는 대사 두 줄(미나 · 내레이션), 샷 b 는 대사가 없다(빈 줄 하나만).
const conti = { url: 'https://x/rough.png', status: 'completed', errorMessage: null, generatedAt: 1, frames: { start: 'https://x/s.png', direction: 'https://x/d.png', end: 'https://x/e.png' } }
const TAB_HINT = 'You can also edit the dialogue right in the Dialogue tab of this screen.'
const ADD_HINT = 'Add dialogue in the rough storyboard on the Writer screen.'
const dialog = (shotId: string) => renderToStaticMarkup(createElement(RealShotDialog, { shotId, onOpenChange: () => {} }))
/** 대사 칸만 — 다른 칸(바꾸고 싶은 점 등)의 글과 섞어 읽지 않게. */
const dialogueBlock = (html: string) => {
  const at = html.indexOf('data-testid="shot-dialogue"')
  expect(at).toBeGreaterThan(-1)
  return html.slice(html.lastIndexOf('<', at), html.indexOf('</section>', at))
}

beforeEach(() => {
  data.locale = 'ko'
  data.writer.shots = [
    { shotId: 'a', sceneId: 's1', shotType: 'MS', durationSeconds: 5, actionDescription: '미나가 돌아본다', roughStoryboard: conti, dialogueLines: [
      { characterId: 'mina', text: '가자, 버스 온다.' },
      { characterId: null, text: '그날 밤은 길었다.' },
    ] },
    { shotId: 'b', sceneId: 's1', shotType: 'WS', durationSeconds: 3, actionDescription: '버스가 선다', roughStoryboard: conti, dialogueLines: [{ characterId: 'mina', text: '  ' }] },
  ]
})

describe('Storyboard 샷 팝업의 대사', () => {
  // 왜(오너 P1 "shot 단위로 보여주는 곳에서 대사 꼭 보이게"): 카드는 대사 첫 줄만 보인다 — 팝업에서 그 샷의 대사 전부를 누가 하는지와 함께 본다.
  it('대사가 있는 샷의 팝업은 "대사" 머리 아래 줄마다 말하는 사람과 대사를 보인다 — 인물은 이름, 내레이션은 V.O.', () => {
    const block = dialogueBlock(dialog('a'))
    expect(block).toContain(translate('ko', 'Dialogue'))
    expect(block).toContain('미나')
    expect(block).toContain('가자, 버스 온다.')
    expect(block).toContain('V.O.')
    expect(block).toContain('그날 밤은 길었다.')
    expect(block).not.toContain(translate('ko', 'No dialogue'))
  })

  // 왜(오너 P1): 대사가 없을 때 아무것도 안 보이면, 대사가 없는 것인지 팝업이 대사를 안 보여 주는 것인지 알 수 없다.
  it('대사가 없는 샷의 팝업도 "대사" 자리를 보이고 "대사 없음"이라고 한다', () => {
    const block = dialogueBlock(dialog('b'))
    expect(block).toContain(translate('ko', 'Dialogue'))
    expect(block).toContain(translate('ko', 'No dialogue'))
  })

  // 왜(오너 P1 · 2026-11-02 "대사 탭에서 바로 고치기"): 팝업은 대사를 보기만 한다 — 같은 화면의 대사 탭에서 바로 고칠 수 있다는 것을 거기서 알린다.
  it('대사가 있는 샷의 팝업은 이 화면의 대사 탭에서 바로 고칠 수 있다고 안내한다', () => {
    const block = dialogueBlock(dialog('a'))
    expect(block).toContain(translate('ko', TAB_HINT))
    expect(block).not.toContain(translate('ko', ADD_HINT))
  })

  // 왜(검토 3번): 대사 탭은 이미 있는 줄의 글만 고친다 — 대사 없는 샷은 대사 탭에 누를 줄이 없고, 그 줄의 연필은 이 팝업으로 돌아온다. 대사를 넣는 곳은 Writer 콘티다.
  it('대사가 없는 샷의 팝업은 대사 탭 안내 대신, 대사는 Writer 콘티에서 넣는다고 안내한다', () => {
    const block = dialogueBlock(dialog('b'))
    expect(block).toContain(translate('ko', ADD_HINT))
    expect(block).not.toContain(translate('ko', TAB_HINT))
    expect(translate('ko', ADD_HINT)).not.toBe(ADD_HINT)
  })

  // 왜(화면 문구 두 말 규칙): 영어 화면에서는 대사 칸의 머리 · 없음 · 안내가 영어다 — 한국어가 섞이면 안 된다.
  it('영어 화면이면 팝업 대사 칸의 머리 · "대사 없음" · 안내가 영어다', () => {
    data.locale = 'en'
    data.writer.shots[1] = { ...data.writer.shots[1], dialogueLines: [] }
    const block = dialogueBlock(dialog('b'))
    expect(block).toContain('Dialogue')
    expect(block).toContain('No dialogue')
    expect(block).toContain(ADD_HINT)
    expect(block).not.toMatch(/[가-힣]/)
  })
})
