// 대사(Dialogue) 탭에서 대사 한 줄을 그 자리에서 고치는지(누르면 고치는 칸 · Enter/벗어나면 저장 · Esc 취소 · 빈 글은 되돌림)와 줄 · 연필 단추의 읽는 이름을 검사한다
import { readFileSync } from 'node:fs'
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
import { useBoardUiStore } from '@/features/writer/board-ui-store'

const view = readFileSync('src/features/writer/dialogue-view.tsx', 'utf8')
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
  // 왜: 2026-11-02 오너가 고른 방식 "탭 안에서 바로 고치기"(대사 글을 탭 안에서 바로 고치고 저장해요). 예전에는 샷을 누르면 팝업이 열렸다(2026-10-31 QA).
  it('대사 탭에서 대사 줄을 누르면 그 자리에서 대사 글을 고치는 칸이 열린다', () => {
    const html = renderToStaticMarkup(createElement(DialogueView))
    expect(html.match(/data-testid="dialogue-line"/g)?.length).toBe(2)
    expect(view).toMatch(/onStart=\{\(\) => startEdit\(/)
    const editing = row({ kind: 'editing', draft: '아, 또 먹었어?' })
    expect(editing).toContain('<textarea')
    expect(editing).toContain('아, 또 먹었어?')
    expect(editing).toContain('Enter 저장 · Esc 취소')
  })

  // 왜: 앱의 다른 바로 고치기(프로젝트 제목 등)와 같은 조작이다 — Enter 나 바깥을 누르면 저장, Esc 는 고치기 전 글로 돌아간다(혼자 정한 것).
  it('Enter 를 누르거나 칸 밖을 누르면 저장하고 Esc 를 누르면 고치기 전 글로 돌아간다', () => {
    expect(lineEditKey({ key: 'Enter' })).toBe('save')
    expect(lineEditKey({ key: 'Escape' })).toBe('cancel')
    expect(lineEditKey({ key: 'a' })).toBeNull()
    expect(view).toMatch(/onBlur=\{\(\) => commitEdit\('blur'\)\}|onCommit=\{\(via\) => commitEdit\(via\)\}/)
    expect(view).toMatch(/onCancel=\{cancelEdit\}/)
  })

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

  // 왜: 리드 지시(빈 글은 저장하지 않고 원래 글로) — 실수로 다 지운 것과 줄 지우기를 구분한다. 줄 지우기는 샷 고치기 창에서 한다.
  it('대사 글을 다 지우고 끝내면 저장하지 않고 원래 글로 되돌린다', () => {
    expect(commitLineEdit({ lines: [line], index: 0, original: line, draft: '   ' })).toEqual({ kind: 'empty' })
    expect(view).toContain("t('Empty lines are not saved. To delete a line, open the shot editor with the pencil button.')")
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

  // 왜(혼자 정한 것): 고치는 동안 채팅이 같은 샷의 대사를 바꾸면 줄 순서가 달라질 수 있다 — 엉뚱한 줄을 덮어쓰지 않는다.
  it('고치는 동안 그 대사가 다른 곳에서 바뀌었으면 덮어쓰지 않고 다시 눌러 고쳐 달라고 알린다', () => {
    const changed = { ...line, text: '어? 나왔다!' }
    expect(commitLineEdit({ lines: [changed], index: 0, original: line, draft: '아, 또 먹었어?' })).toEqual({ kind: 'conflict' })
    expect(view).toContain("t('This line changed while you were editing. Click it to edit again.')")
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

  // 왜: 저장한 뒤 키보드 사용자가 같은 자리에서 이어 갈 수 있어야 한다(리드 지시) — Enter · Esc 로 끝내면 그 줄로 포커스를 돌린다.
  it('Enter 로 저장하거나 Esc 로 취소하면 포커스가 그 대사 줄로 돌아온다', () => {
    expect(view).toMatch(/via === 'key'[\s\S]{0,80}setFocusKey\(/)
    expect(view).toMatch(/const cancelEdit = [\s\S]{0,200}setFocusKey\(/)
    expect(view).toMatch(/rowRefs\.current\.get\(focusKey\)\?\.focus\(\)/)
  })

  // 왜: 리드 지시(샷 번호는 보드의 전체 번호) — 보드 카드 "Scene 2 · Shot 3"과 같은 번호여야 "그 샷"을 부를 수 있다.
  it('대사 탭의 샷 번호는 보드 카드와 같은 전체 번호다', () => {
    const html = renderToStaticMarkup(createElement(DialogueView))
    expect(html).toMatch(/Shot (<!-- -->)?3</)
    expect(view).toContain('boardShots(sceneManifest, shots)')
  })

  // 왜(혼자 정한 것): 화자 바꾸기 · 줄 더하기 · 빼기는 샷 고치기 창에 있다(프로토타입 대본 보기의 ✎) — 대사가 없는 샷도 여기서 대사를 더한다.
  it('샷마다 연필 단추가 있고 누르면 그 샷 고치기 창이 열린다', () => {
    const html = renderToStaticMarkup(createElement(DialogueView))
    expect(html).toContain('aria-label="샷 1 고치기 창 열기"')
    expect(html).toContain('aria-label="샷 2 고치기 창 열기"')
    expect(html).toContain('aria-label="샷 3 고치기 창 열기"')
    expect(view).toMatch(/useBoardUiStore\.getState\(\)\.setShotEditId\(shot\.shotId\)/)
    useBoardUiStore.getState().setShotEditId('sh_02_01')
    expect(useBoardUiStore.getState().shotEditId).toBe('sh_02_01')
    useBoardUiStore.getState().setShotEditId(null)
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
