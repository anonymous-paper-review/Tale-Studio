// 대사(Dialogue) 탭에서 대사 한 줄을 고칠 때의 규칙(한글 조합 · 한 줄로 저장 · 고친 글만 바꾸기 · 바꾼 것 없으면 그대로)과 줄의 모습 · 읽는 이름 · 샷 번호를 검사한다
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const data = vi.hoisted(() => ({
  writer: {
    sceneManifest: {
      characters: [{ characterId: 'min_ho', name: '민호' }, { characterId: 'su_jin', name: '수진' }],
      locations: [],
      scenes: [{ sceneId: 'sc_01', location: '복도', mood: '' }, { sceneId: 'sc_02', location: '옥상', mood: '' }],
    },
    shots: [
      { shotId: 'sh_01_01', sceneId: 'sc_01', shotType: 'MS', actionDescription: '민호가 자판기 앞에 선다.', dialogueLines: [{ characterId: 'min_ho', text: '아, 또야?', emotion: '', delivery: '', durationHint: 1 }] },
      { shotId: 'sh_01_02', sceneId: 'sc_01', shotType: 'CU', actionDescription: '동전이 떨어진다.', dialogueLines: [] },
      { shotId: 'sh_02_01', sceneId: 'sc_02', shotType: 'WS', actionDescription: '수진이 바람을 맞는다.', dialogueLines: [{ characterId: 'su_jin', text: '여기 있었구나.', emotion: '', delivery: '조용히', durationHint: 2 }] },
    ],
    loadProject: vi.fn(),
  },
  guarded: { locked: false },
}))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: (select: (s: unknown) => unknown) => select(data.writer) }))
vi.mock('@/stores/project-store', () => ({ useProjectStore: (select: (s: unknown) => unknown) => select({ projectId: 'p' }) }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})
vi.mock('@/hooks/use-guarded-action', () => ({ useGuardedAction: () => ({ run: vi.fn(), locked: data.guarded.locked }) }))
vi.mock('@/features/writer/writer-header', () => ({ WriterHeader: ({ description }: { description: string }) => description }))

import { DialogueView } from '@/features/writer/dialogue-view'
import { DialogueLineRow } from '@/features/writer/dialogue-line-row'
import { commitLineEdit, lineEditKey, oneLine, revertLineEdit } from '@/lib/writer/dialogue-line-edit'

const line = { characterId: 'min_ho', text: '아, 또야?', emotion: 'annoyed', delivery: 'sigh', durationHint: 1 }
const noop = () => {}
const row = (state: Parameters<typeof DialogueLineRow>[0]['state']) =>
  renderToStaticMarkup(createElement(DialogueLineRow, {
    speaker: '민호', speakerClassName: '', rowClassName: '', text: '아, 또야?', label: '샷 1의 대사 1 (민호) 고치기', state,
    onStart: noop, onDraftChange: noop, onCommit: noop, onCancel: noop, onRetry: noop, onRevert: noop,
  }))

beforeEach(() => {
  data.guarded.locked = false
})

describe('대사 탭에서 바로 고치기', () => {
  // 왜: 한글은 조합 중에 Enter 를 눌러 글자를 마친다 — 그 Enter 로 저장하면 마지막 글자가 빠지거나 반쪽 글이 저장된다.
  it('한글을 조합하는 중에 누른 Enter 로는 저장하지 않는다', () => {
    expect(lineEditKey({ key: 'Enter', isComposing: true })).toBeNull()
    expect(lineEditKey({ key: 'Enter', keyCode: 229 })).toBeNull()
  })

  // 왜(혼자 정한 것): 대사 한 줄은 한 줄로 저장된다 — 팝업의 대사 칸도 한 줄이고, 탭은 줄바꿈을 보여 주지 못한다.
  it('Shift+Enter 로도 줄을 바꾸지 않고 저장하며 붙여 넣은 줄바꿈은 빈칸으로 바꿔 저장한다', () => {
    expect(lineEditKey({ key: 'Enter', shiftKey: true })).toBe('save')
    expect(oneLine('아, 또\n먹었어?  ')).toBe('아, 또 먹었어?')
    const result = commitLineEdit({ lines: [line], index: 0, original: line, draft: '아, 또\r\n먹었어?' })
    expect(result).toEqual({ kind: 'save', lines: [{ ...line, text: '아, 또 먹었어?' }] })
  })

  // 왜: 바꾸지 않았는데 저장하면 같은 글을 헛저장한다(정상 경로 고정).
  it('바꾼 것이 없으면 저장하지 않는다', () => {
    expect(commitLineEdit({ lines: [line], index: 0, original: line, draft: ' 아, 또야? ' })).toEqual({ kind: 'unchanged' })
  })

  // 왜(혼자 정한 것): 여기서는 대사 글만 고친다 — 고친 줄의 화자 · 감정 · 말투 · 길이를 빼고 저장하면 그 칸이 지워진다(채팅 고치기의 같은 결함 2026-10-31).
  it('대사 글을 고쳐 저장해도 그 줄의 화자 · 감정 · 말투 · 길이는 그대로 둔다', () => {
    const other = { characterId: null, text: '밤이었다.', emotion: '', delivery: 'V.O.', durationHint: 2 }
    const result = commitLineEdit({ lines: [line, other], index: 0, original: line, draft: '아, 또 먹었어?' })
    expect(result).toEqual({ kind: 'save', lines: [{ ...line, text: '아, 또 먹었어?' }, other] })
  })

  // 왜: 리드 지시(실패하면 쓴 글을 그대로 두고 알리고 다시 할 수 있게) — 저장하는 동안에는 그 줄을 다시 고칠 수 없다.
  it('저장하는 동안 고친 글과 저장 중 표시를 보이고, 실패하면 쓴 글을 그대로 두고 실패 안내와 [다시 저장] · [되돌리기]를 보인다', () => {
    const saving = row({ kind: 'saving', draft: '아, 또 먹었어?' })
    expect(saving).toContain('아, 또 먹었어?')
    expect(saving).toContain('aria-busy="true"')
    expect(saving).toContain('저장 중')
    const failed = row({ kind: 'failed', draft: '아, 또 먹었어?' })
    expect(failed).toContain('아, 또 먹었어?')
    expect(failed).toContain('대사를 저장하지 못했어요. 다시 저장하거나 되돌려 주세요.')
    expect(failed).toContain('다시 저장')
    expect(failed).toContain('되돌리기')
    expect(revertLineEdit({ lines: [{ ...line, text: '아, 또 먹었어?' }], index: 0, original: line, saved: '아, 또 먹었어?' })).toEqual([line])
    expect(revertLineEdit({ lines: [{ ...line, text: '다른 글' }], index: 0, original: line, saved: '아, 또 먹었어?' })).toBeNull()
  })

  // 왜: 키보드로만 일하는 사람도 고칠 수 있어야 한다(디자인 원칙 4). 읽어 주는 이름에 샷 전체 글을 담으면 줄마다 한참을 듣는다(리드 지시).
  it('대사 줄은 키보드로 갈 수 있고 읽어 주는 이름은 샷 번호 · 몇 번째 대사 · 말하는 사람만 담는다', () => {
    const html = renderToStaticMarkup(createElement(DialogueView))
    expect(html).toContain('aria-label="샷 1의 대사 1 (민호) 고치기"')
    expect(html).toContain('aria-label="샷 3의 대사 1 (수진) 고치기"')
    expect(html).toMatch(/role="button" tabindex="0"[^>]*data-testid="dialogue-line"|data-testid="dialogue-line"[^>]*role="button" tabindex="0"/)
    const labels = [...html.matchAll(/aria-label="([^"]*고치기)"/g)].map((m) => m[1])
    expect(labels.some((label) => label.includes('자판기') || label.includes('바람'))).toBe(false)
  })

  // 왜: 리드 지시(샷 번호는 보드의 전체 번호) — 보드 카드 "Scene 2 · Shot 3"과 같은 번호여야 "그 샷"을 부를 수 있다.
  it('대사 탭의 샷 번호는 보드 카드와 같은 전체 번호다', () => {
    const html = renderToStaticMarkup(createElement(DialogueView))
    expect(html).toMatch(/Shot (<!-- -->)?3</)
  })

  // 왜(혼자 정한 것): 대사를 새로 쓰는 동안(1~2분) 고친 줄은 새 대사로 통째로 바뀐다 — 그동안은 고치지 못하게 한다.
  it('대사를 새로 쓰는 중에는 대사 줄을 고칠 수 없다', () => {
    data.guarded.locked = true
    const html = renderToStaticMarkup(createElement(DialogueView))
    expect(html).toMatch(/aria-disabled="true"[^>]*data-testid="dialogue-line"|data-testid="dialogue-line"[^>]*aria-disabled="true"/)
    expect(html).not.toMatch(/tabindex="0"[^>]*data-testid="dialogue-line"/)
  })

  // 왜: 고칠 수 있다는 것을 탭의 안내 줄이 알려 준다 — 화면 문구가 오너의 검수 표면이다.
  it('대사 탭 안내 줄은 대사를 누르면 그 자리에서 고칠 수 있다고 알려 준다', () => {
    const html = renderToStaticMarkup(createElement(DialogueView))
    expect(html).toContain('대사를 누르면 그 자리에서 고칠 수 있어요')
    expect(html).not.toContain('샷을 누르면 대사를 고칠 수 있어요')
  })
})
