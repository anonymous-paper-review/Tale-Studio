// Storyboard 샷 상세(카드를 누르면 열림)가 큰 그림 · 샷 글 · 대사와 "바꾸고 싶은 점" → [Lumi 에게 고쳐 달라고 하기]를 보이고, 고칠 글을 Director 상세와 같은 말로 채팅에 보내는지 검사한다
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const conti = { url: 'https://x/rough-start.png', status: 'completed', errorMessage: null, generatedAt: 1, frames: { start: 'https://x/rough-start.png', direction: 'https://x/rough-dir.png', end: 'https://x/rough-end.png' } }
const real = { url: 'https://x/real-start.png', status: 'completed', generatedAt: 2, frames: { start: 'https://x/real-start.png', direction: 'https://x/real-dir.png', end: 'https://x/real-end.png' } }

const data = vi.hoisted(() => ({
  project: { projectId: 'p1' },
  writer: {
    sceneManifest: { scenes: [{ sceneId: 's1', location: '', timeOfDay: '' }], characters: [{ characterId: 'mina', name: '미나' }], locations: [] },
    shots: [] as Array<Record<string, unknown>>,
  },
  images: { projectId: 'p1', images: {} as Record<string, unknown> },
  jobs: [] as unknown[],
  send: vi.fn(async (_text: string) => {}),
  collapse: vi.fn(),
  chatLoading: false,
}))
vi.mock('@/stores/project-store', () => ({ useProjectStore: (select: (s: unknown) => unknown) => select(data.project) }))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: (select: (s: unknown) => unknown) => select(data.writer) }))
vi.mock('@/lib/storyboard/real-images-store', () => ({ useStoryboardRealImages: (select: (s: unknown) => unknown) => select(data.images) }))
vi.mock('@/lib/generation-queue', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), useActiveGenerationJobs: () => data.jobs }))
vi.mock('@/stores/global-chat-store', () => ({ useGlobalChatStore: Object.assign(() => null, { getState: () => ({ sendMessage: data.send, loading: data.chatLoading }) }) }))
vi.mock('@/stores/locale-store', () => ({ useLocaleStore: Object.assign((select: (s: unknown) => unknown) => select({ locale: 'ko' }), { getState: () => ({ locale: 'ko' }) }) }))
vi.mock('@/stores/chat-ui-store', () => ({ useChatUiStore: Object.assign(() => null, { getState: () => ({ setCollapsed: data.collapse }) }) }))
vi.mock('@/components/lumi/lumi', () => ({ Lumi: () => null }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useLocale: () => 'ko', useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})
// 창은 열려 있을 때 내용을 그대로 그린다(정적 렌더에는 창 겉껍데기가 없다 — handoff-confirm-lumi 와 같은 방법).
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
import { fixInChatText, sendFixToChat } from '@/lib/storyboard/fix-in-chat'

function dialog(shotId: string | null = 'b'): string {
  return renderToStaticMarkup(createElement(RealShotDialog, { shotId, onOpenChange: () => {} }))
}

beforeEach(() => {
  data.writer.shots = [
    { shotId: 'a', sceneId: 's1', shotType: 'WS', durationSeconds: 3, actionDescription: '버스가 선다', dialogueLines: [], roughStoryboard: conti },
    { shotId: 'b', sceneId: 's1', shotType: 'MS', durationSeconds: 5, actionDescription: '미나가 돌아본다', dialogueLines: [{ characterId: 'mina', text: '거기 누구야?' }], roughStoryboard: conti },
  ]
  data.images = { projectId: 'p1', images: { b: real } }
  data.jobs = []
  data.send.mockClear()
  data.collapse.mockClear()
  data.chatLoading = false
})

describe('Storyboard 샷 상세', () => {
  // 왜(혼자 정한 것 g): 카드는 작아 고칠 점을 보기 어렵다 — 크게 보고, 이 샷의 글 · 대사를 같이 본다.
  it('카드를 누르면 열리는 샷 상세에 보드 이름 · 큰 실사 그림 · 샷 글 · 대사가 보인다', () => {
    const html = dialog('b')
    expect(html).toContain('씬 1 · 샷 2')
    expect(html).toContain('https://x/real-start.png')
    expect(html).toContain('미나가 돌아본다')
    expect(html).toContain('미나')
    expect(html).toContain('거기 누구야?')
  })

  // 왜(오너 S2): 실사가 아직 없으면 상세도 콘티 그림을 보이고 실사가 아니라고 알린다.
  it('실사가 없는 샷의 상세는 콘티 그림에 "콘티" 꼬리표를 붙여 보인다', () => {
    const html = dialog('a')
    expect(html).toContain('https://x/rough-start.png')
    expect(html).toContain('>콘티<')
  })

  // 왜(오너 O7 "고칠 글을 채팅에 보내면" · O5 Director 상세와 같은 단추): 상세에서 바꾸고 싶은 점을 적어 Lumi 에게 보낸다 — 빈 글은 보낼 것이 없다.
  it('상세에는 "바꾸고 싶은 점" 칸과 [Lumi 에게 고쳐 달라고 하기]가 있고, 칸이 비면 단추가 꺼져 있다', () => {
    const html = dialog('b')
    expect(html).toContain('바꾸고 싶은 점')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="storyboard-fix-in-chat"|<button[^>]*data-testid="storyboard-fix-in-chat"[^>]*disabled=""/)
    expect(html).toContain('Lumi 에게 고쳐 달라고 하기')
  })

  // 왜(혼자 정한 것 h): 같은 샷 두 번 맡기기는 서버가 거절하고 바꿀 점이 버려진다 — 그리는 동안은 고치기를 끄고 까닭을 보인다.
  it('그 샷을 그리는 중이면 고치기 칸이 꺼지고 "이 샷을 그리는 중이에요"를 보인다', () => {
    data.jobs = [{ id: 'j1', kind: 'shot_storyboard', target: { writerShotId: 'b' } }]
    const html = dialog('b')
    expect(html).toContain('이 샷을 그리는 중이에요. 다 그린 뒤 고칠 수 있어요.')
    expect(html).toMatch(/<textarea[^>]*disabled=""/)
  })

  // 왜(오너 O7 "이야기 · 화살표 · 대사는 Writer 콘티에서"): 실사 말고 다른 것을 고치려는 사람에게 어디로 가는지 알린다.
  //   2026-11-27 문장 바꿈(오너 N4b "실사 이미지에서 화살표 수정하면 뒤에 마지막 프레임 수정해줘"): 실사 그림의 화살표는 이제 이 창의
  //   [화살표 고치기]로 고친다 — 안내에서 화살표를 뺀다. (옛 이름: '상세에는 이야기 · 화살표 · 대사는 Writer 콘티에서 고친다는 안내가 있다')
  it('상세에는 이야기 · 대사는 Writer 콘티에서 고친다는 안내가 있다', () => {
    expect(dialog('b')).toContain('이야기 · 대사는 Writer 콘티에서 고쳐요.')
    expect(dialog('b')).not.toContain('이야기 · 화살표 · 대사는 Writer 콘티에서 고쳐요.')
  })

  // 왜(정상 경로 고정): 연 샷이 없으면 창이 없다.
  it('연 샷이 없으면 상세 창을 그리지 않는다', () => {
    expect(dialog(null)).toBe('')
  })
})

describe('Lumi 에게 고쳐 달라고 하기', () => {
  // 왜(오너 O7 · O5): Director 상세와 같은 말로 보낸다 — 채팅이 어느 샷인지 알게 보드 이름 멘션("@샷 2")을 앞에 붙인다(채팅 @ 고르기와 같은 이름).
  it('[Lumi 에게 고쳐 달라고 하기]를 누르면 채팅을 펴고 "@샷 N 이미지를 고쳐서 다시 만들어 줘: 바꿀 점"을 보낸다', () => {
    expect(fixInChatText('ko', '샷 2', '  표정을 더 슬프게 ')).toBe('@샷 2 이미지를 고쳐서 다시 만들어 줘: 표정을 더 슬프게')
    expect(sendFixToChat('샷 2', '표정을 더 슬프게')).toBe('sent')
    expect(data.collapse).toHaveBeenCalledWith(false)
    expect(data.send).toHaveBeenCalledWith('@샷 2 이미지를 고쳐서 다시 만들어 줘: 표정을 더 슬프게')
  })

  // 왜: 빈 글을 보내면 채팅이 무엇을 고칠지 모른다.
  it('바꿀 점이 비어 있으면 채팅에 보내지 않는다', () => {
    expect(sendFixToChat('샷 2', '   ')).toBe('empty')
    expect(data.send).not.toHaveBeenCalled()
  })

  // 왜(Director 상세와 같은 규칙): 채팅이 다른 말을 처리하는 중이면 보낸 말이 조용히 버려진다 — 보내지 않고 까닭을 보인다.
  it('채팅이 다른 말을 처리하는 중이면 보내지 않고 바쁘다고 돌려준다', () => {
    data.chatLoading = true
    expect(sendFixToChat('샷 2', '표정을 더 슬프게')).toBe('busy')
    expect(data.send).not.toHaveBeenCalled()
  })
})
