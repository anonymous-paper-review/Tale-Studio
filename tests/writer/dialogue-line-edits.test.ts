// 대사 줄 바로 고치기 한 벌(대사 탭 · Storyboard 샷 팝업 · Director 샷 상세가 같이 쓴다)이 누르기 · Enter · Esc · 바깥 누르기 · 빈 줄 · 그사이 바뀜 · 저장 실패를 대사 탭과 같은 규칙으로 다루는지, 빈 줄 알림이 화면마다 맞는 곳을 말하는지 검사한다 (오너 2026-11-02 "탭 안에서 바로 고치기" · 2026-11-27 Q1)
import { beforeEach, describe, expect, it } from 'vitest'
import { createLineEdits, emptyLineNoticeKey, lineKey, lineStateOf, type LineEditsState } from '@/lib/writer/dialogue-line-edits'
import { translate } from '@/lib/i18n/translate'
import type { DialogueLine } from '@/types'

// 이 시험을 위해 지은 샷 하나 — 대사 둘(둘째 줄은 칸이 다 찼다).
const first: DialogueLine = { characterId: 'mina', text: '가자.' } as DialogueLine
const second: DialogueLine = { characterId: 'joon', text: '응.', emotion: '담담', delivery: '낮게', durationHint: 1 } as DialogueLine
let board: Record<string, DialogueLine[]>
let saved: Array<{ shotId: string; lines: DialogueLine[] }>
let notices: string[]
let failNext: boolean
let states: LineEditsState[]
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
function edits() {
  return createLineEdits(() => ({
    lines: (shotId) => board[shotId] ?? null,
    save: async (shotId, lines) => {
      if (failNext) { failNext = false; throw new Error('network down') }
      saved.push({ shotId, lines })
      board[shotId] = lines
    },
    notify: (reason) => { notices.push(reason) },
  }), (state) => { states.push(state) })
}

beforeEach(() => {
  board = { sh_01_02: [first, second] }
  saved = []
  notices = []
  failNext = false
  states = []
})

describe('대사 줄 바로 고치기 — 대사 탭 · 두 팝업 공용', () => {
  // 왜(2026-11-02 리뷰 R8 · 오너 Q1 "팝업에서도"): 고치는 칸은 저장된 글 그대로에서 시작하고, 끝내면 그 줄 글만 바꾼다 — 말하는 사람 · 감정 · 말투 · 길이는 그대로다.
  it('줄을 누르면 저장된 글 그대로 고치기 시작하고, Enter 나 바깥 누르기로 끝내면 그 샷 대사에서 그 줄 글만 바꿔 저장한다', () => {
    const line = edits()
    expect(line.start('sh_01_02', 1, second)).toBe(true)
    expect(lineStateOf(line.state, lineKey('sh_01_02', 1), (text) => text)).toEqual({ kind: 'editing', draft: '응.' })
    line.setDraft(lineKey('sh_01_02', 1), '응, 가자.')
    expect(line.commit()).toBe(lineKey('sh_01_02', 1))
    expect(saved).toEqual([{ shotId: 'sh_01_02', lines: [first, { ...second, text: '응, 가자.' }] }])
  })

  // 왜: 고치다 그만두는 사람의 글이 저장되면 안 된다.
  it('Esc 로 끝내면 저장하지 않고 고치기 전 글로 돌아간다', () => {
    const line = edits()
    line.start('sh_01_02', 0, first)
    line.setDraft(lineKey('sh_01_02', 0), '안 가.')
    expect(line.cancel()).toBe(lineKey('sh_01_02', 0))
    expect(saved).toEqual([])
    expect(lineStateOf(line.state, lineKey('sh_01_02', 0), (text) => text)).toEqual({ kind: 'idle' })
  })

  // 왜(리드 지시 — 빈 글은 저장하지 않고 원래 글로): 실수로 다 지운 것과 줄 지우기를 가른다. 줄 지우기는 다른 곳에서 한다(알림이 말한다).
  it('줄을 다 지우고 끝내면 저장하지 않고 빈 줄 알림을 보인다', () => {
    const line = edits()
    line.start('sh_01_02', 0, first)
    line.setDraft(lineKey('sh_01_02', 0), '   ')
    line.commit()
    expect(saved).toEqual([])
    expect(notices).toEqual(['empty'])
  })

  // 왜(혼자 정한 것 — 대사 탭 그대로): 고치는 동안 채팅 · 다른 창이 같은 샷 대사를 바꾸면 줄 순서가 달라질 수 있다 — 엉뚱한 줄을 덮어쓰지 않는다.
  it('고치는 동안 그 줄이 다른 곳에서 바뀌었으면 저장하지 않고 다시 눌러 달라고 알린다', () => {
    const line = edits()
    line.start('sh_01_02', 0, first)
    line.setDraft(lineKey('sh_01_02', 0), '안 가.')
    board.sh_01_02 = [{ ...first, text: '채팅이 고친 글.' }, second]
    line.commit()
    expect(saved).toEqual([])
    expect(notices).toEqual(['conflict'])
  })

  // 왜: 저장이 실패했는데 저장된 것처럼 지나가면 고친 글을 잃는다 — 고친 글을 남기고 [다시 저장] · [되돌리기]를 준다(대사 탭과 같다).
  it('저장에 실패하면 고친 글을 실패로 남기고, [다시 저장]은 같은 글로 다시 저장하고 [되돌리기]는 고치기 전 글로 돌려 저장한다', async () => {
    const line = edits()
    const key = lineKey('sh_01_02', 0)
    failNext = true
    line.start('sh_01_02', 0, first)
    line.setDraft(key, '안 가.')
    line.commit()
    expect(lineStateOf(line.state, key, (text) => text)).toEqual({ kind: 'saving', draft: '안 가.' })
    await settle()
    expect(lineStateOf(line.state, key, (text) => text)).toEqual({ kind: 'failed', draft: '안 가.' })
    // 화면 값은 고친 글 그대로다(writer-store 가 먼저 바꾼다) — 다시 저장은 그 글을 다시 보낸다.
    board.sh_01_02 = [{ ...first, text: '안 가.' }, second]
    line.retry(key)
    await settle()
    expect(saved).toEqual([{ shotId: 'sh_01_02', lines: [{ ...first, text: '안 가.' }, second] }])
    expect(lineStateOf(line.state, key, (text) => text)).toEqual({ kind: 'idle' })

    failNext = true
    line.start('sh_01_02', 0, { ...first, text: '안 가.' })
    line.setDraft(key, '못 가.')
    line.commit()
    await settle()
    board.sh_01_02 = [{ ...first, text: '못 가.' }, second]
    line.revert(key)
    await settle()
    expect(saved.at(-1)).toEqual({ shotId: 'sh_01_02', lines: [{ ...first, text: '안 가.' }, second] })
  })

  // 왜: Enter 로 끝내면 고치는 칸이 사라지며 바깥 누르기(blur)가 한 번 더 온다 — 같은 고침을 두 번 저장하지 않는다.
  it('Enter 로 끝낸 뒤 칸이 사라지며 오는 바깥 누르기는 같은 고침을 두 번 저장하지 않는다', () => {
    const line = edits()
    line.start('sh_01_02', 0, first)
    line.setDraft(lineKey('sh_01_02', 0), '안 가.')
    line.commit()
    expect(line.commit()).toBeNull()
    expect(saved).toHaveLength(1)
  })

  // 왜: 저장 중 · 실패한 줄을 다시 고치기 시작하면 [다시 저장] · [되돌리기]가 가리키는 글이 흐려진다 — 먼저 끝낸다.
  it('저장 중이거나 저장에 실패한 줄은 그것을 끝내기 전에는 다시 고치기 시작하지 않는다', async () => {
    const line = edits()
    failNext = true
    line.start('sh_01_02', 0, first)
    line.setDraft(lineKey('sh_01_02', 0), '안 가.')
    line.commit()
    expect(line.start('sh_01_02', 0, first)).toBe(false)
    await settle()
    expect(line.start('sh_01_02', 0, first)).toBe(false)
    expect(line.start('sh_01_02', 1, second)).toBe(true)
  })

  // 왜(검토 rev-flow-2-4 낮음 2): 팝업에서 저장이 실패한 줄을 그대로 두고 닫으면 [다시 저장] · [되돌리기]가 사라진다 — 카드 · 대사 탭은 고친 글을 보이지만
  //   DB · 새 영상은 옛 대사다. 화면이 거짓말하지 않게, 닫을 때 실패한 줄은 저장된 글로 되돌리고 알린다(닫는 사이 저장 중이던 줄이 뒤에 실패해도 같다).
  it('창을 닫을 때 저장에 실패한 줄이 남아 있으면 저장된 글로 되돌리고 알리며, 닫는 사이 저장 중이던 줄이 뒤에 실패해도 같다', async () => {
    const key = lineKey('sh_01_02', 0)
    // ① 실패한 줄을 두고 닫는다.
    const line = edits()
    failNext = true
    line.start('sh_01_02', 0, first)
    line.setDraft(key, '안 가.')
    line.commit()
    await settle()
    // 화면 값은 고친 글이다(writer-store 가 먼저 바꾼다).
    board.sh_01_02 = [{ ...first, text: '안 가.' }, second]
    line.dispose()
    await settle()
    expect(saved.at(-1)).toEqual({ shotId: 'sh_01_02', lines: [first, second] })
    expect(notices).toEqual(['reverted'])
    // ② 저장 중에 닫고, 그 저장이 뒤에 실패한다.
    notices = []
    const closing = edits()
    failNext = true
    closing.start('sh_01_02', 0, first)
    closing.setDraft(key, '못 가.')
    closing.commit()
    board.sh_01_02 = [{ ...first, text: '못 가.' }, second]
    closing.dispose()
    await settle()
    expect(saved.at(-1)).toEqual({ shotId: 'sh_01_02', lines: [first, second] })
    expect(notices).toEqual(['reverted'])
    // ③ 다시 붙은 창(개발 모드의 두 번 붙이기)은 실패한 줄을 되돌리지 않고 [다시 저장] · [되돌리기]를 보인다.
    const reopened = edits()
    reopened.dispose()
    reopened.arm()
    failNext = true
    reopened.start('sh_01_02', 0, first)
    reopened.setDraft(key, '또 안 가.')
    reopened.commit()
    await settle()
    expect(lineStateOf(reopened.state, key, (text) => text)).toEqual({ kind: 'failed', draft: '또 안 가.' })
  })

  // 왜(혼자 정한 것 · 검토 rev-flow-2-4 낮음 2 후속): 저장에 실패한 뒤 채팅 · 다른 화면이 그 줄을 바꿨으면 화면 값은 그 새 고침이다 — 닫는다고 덮어 되돌리면
  //   다른 곳의 고침을 지우고, "되돌렸어요"는 틀린 말이다.
  it('창을 닫을 때 저장에 실패한 줄이 그새 다른 곳에서 바뀌었으면 그 값을 두고 되돌렸다고 알리지 않는다', async () => {
    const key = lineKey('sh_01_02', 0)
    const line = edits()
    failNext = true
    line.start('sh_01_02', 0, first)
    line.setDraft(key, '안 가.')
    line.commit()
    await settle()
    board.sh_01_02 = [{ ...first, text: '채팅이 고친 글.' }, second]
    line.dispose()
    await settle()
    expect(saved).toEqual([])
    expect(board.sh_01_02[0].text).toBe('채팅이 고친 글.')
    expect(notices).toEqual([])
  })

  // 왜(오너 Q1 — Storyboard 대사 탭의 틀린 안내 바로잡기): Writer 콘티의 연필은 줄을 지울 수 있는 샷 고치기 창을 열지만,
  //   Storyboard 의 연필은 대사 줄 글만 고치는 샷 팝업을 연다 — Storyboard · Director 에서는 줄 지우기를 채팅이나 Writer 콘티에서 한다.
  it('줄을 다 지웠을 때 알림은 화면마다 줄을 지우는 곳을 말한다 — Writer 콘티 대사 탭은 연필 단추로 여는 샷 고치기 창, Storyboard 대사 탭 · Storyboard 샷 팝업 · Director 샷 상세는 채팅이나 Writer 콘티', () => {
    expect(translate('ko', emptyLineNoticeKey('conti'))).toBe('빈 대사는 저장하지 않아요. 줄을 지우려면 연필 단추로 샷 고치기 창을 여세요.')
    for (const screen of ['storyboard', 'director'] as const) {
      expect(translate('ko', emptyLineNoticeKey(screen)), screen).toBe('빈 대사는 저장하지 않아요. 줄을 지우려면 채팅이나 Writer 콘티에서 지워요.')
      expect(translate('en', emptyLineNoticeKey(screen)), screen).toBe("Empty lines are not saved. To delete a line, use the chat or Writer's rough storyboard.")
    }
  })
})
