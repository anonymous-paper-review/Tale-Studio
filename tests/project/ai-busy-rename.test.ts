// AI가 일하는 잠금 화면이 떠 있어도 위 막대에서 프로젝트 이름은 바꿀 수 있고, 나머지는 그대로 막히는지 검사한다 (2026-11-03 v3 2단계)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lockForAiWork, overlayClipPath, type LockNode } from '@/lib/ai-busy-lock'

const read = (file: string) => readFileSync(file, 'utf8')

/** 화면 조각 하나 — 이 시험이 보는 것은 부모 · 자식 · 속성뿐이다. */
class Piece implements LockNode {
  parentElement: Piece | null = null
  children: Piece[] = []
  private attributes = new Map<string, string>()
  constructor(readonly name: string) {}
  append(...pieces: Piece[]) {
    for (const piece of pieces) {
      piece.parentElement = this
      this.children.push(piece)
    }
    return this
  }
  hasAttribute(name: string) {
    return this.attributes.has(name)
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }
  removeAttribute(name: string) {
    this.attributes.delete(name)
  }
}

/** 자기나 조상 중 하나라도 inert 면 누르기 · 키보드가 닿지 않는다. */
function blocked(piece: Piece): boolean {
  for (let at: Piece | null = piece; at; at = at.parentElement) if (at.hasAttribute('inert')) return true
  return false
}

/** 스튜디오 화면: 단계 화면(위 막대 + 화면) · 오른쪽 채팅. */
function studio() {
  const titleButton = new Piece('이름 단추')
  const keep = new Piece('이름 칸').append(titleButton)
  const chip = new Piece('단계 칩')
  const nextButton = new Piece('다음 단계 단추')
  const actions = new Piece('위 막대 오른쪽').append(nextButton)
  const bar = new Piece('위 막대').append(chip, keep, actions)
  const content = new Piece('단계 내용')
  const page = new Piece('화면').append(content)
  const stage = new Piece('단계 화면').append(bar, page)
  const input = new Piece('채팅 입력')
  const chat = new Piece('채팅').append(input)
  return { stage, bar, keep, titleButton, chip, actions, nextButton, page, content, chat, input }
}

describe('AI가 일하는 동안 프로젝트 이름 바꾸기', () => {
  it('AI가 일하는 잠금 화면이 떠 있어도 위 막대의 프로젝트 이름 칸은 막히지 않는다', () => {
    // 왜: 예전에는 레일 홈 카드로 AI 작업 중에도 이름을 바꿀 수 있었는데, 1단계에서 이름 바꾸기가 위 막대 연필로 옮겨 가며 잠금 막에 덮였다.
    const s = studio()
    const lock = lockForAiWork({ stage: s.stage, chats: [s.chat], keep: [s.keep] })
    expect(blocked(s.titleButton)).toBe(false)
    lock.release()
    // 위 막대는 이름 칸을 남길 칸으로 표시하고, 단계 화면 위 잠금 화면은 그 칸을 남겨 둔다.
    expect(read('src/components/layout/studio-top-bar.tsx')).toMatch(/<div data-ai-lock-keep className="contents">\s*\{title \?\? <CurrentProjectTitle \/>\}/)
    expect(read('src/components/ai-busy-overlay.tsx')).toMatch(/keep: layer === 'stage' && stage \? Array\.from\(stage\.querySelectorAll<HTMLElement>\('\[data-ai-lock-keep\]'\)\) : \[\]/)
  })

  it('AI가 일하는 동안 이름 칸 말고 단계 화면 · 위 막대의 다른 단추 · 채팅은 그대로 막힌다', () => {
    // 왜: 잠금 막의 원래 일(일하는 동안 다른 조작 막기)은 그대로다 — 이름 칸을 열어 두려다 다음 단계 단추까지 열리면 안 된다.
    const s = studio()
    const lock = lockForAiWork({ stage: s.stage, chats: [s.chat], keep: [s.keep] })
    for (const piece of [s.content, s.nextButton, s.chip, s.input]) expect(blocked(piece), piece.name).toBe(true)
    lock.release()
  })

  it('잠금 화면이 닫히면 막았던 곳을 모두 푼다', () => {
    // 왜: 막이 남으면 일이 끝난 뒤에도 화면이 눌리지 않는다.
    const s = studio()
    lockForAiWork({ stage: s.stage, chats: [s.chat], keep: [s.keep] }).release()
    for (const piece of Object.values(s)) {
      expect(blocked(piece), piece.name).toBe(false)
      expect(piece.hasAttribute('data-ai-locked'), piece.name).toBe(false)
    }
  })

  it('잠금 화면이 떠 있는 동안 화면에 새로 붙은 조각도 막는다', () => {
    // 왜: 일하는 동안 화면이 바뀌어(예: 시작 화면이 다음 칸으로 넘어갈 때) 새 조각이 붙으면 그 조각만 막히지 않은 채 남는다(혼자 정함).
    const s = studio()
    const lock = lockForAiWork({ stage: s.stage, chats: [s.chat], keep: [s.keep] })
    expect(lock.watch).toEqual(expect.arrayContaining([s.stage, s.bar]))
    const banner = new Piece('새로 붙은 띠')
    s.stage.append(banner)
    lock.refresh()
    expect(blocked(banner)).toBe(true)
    expect(blocked(s.titleButton)).toBe(false)
    lock.release()
    expect(blocked(banner)).toBe(false)
  })

  it('잠금 화면 두 개가 겹치면 하나가 닫혀도 남은 잠금 화면이 막은 곳은 그대로 막혀 있다', () => {
    // 왜: 먼저 닫힌 잠금 화면이 막을 다 풀어 버리면 아직 일하는 잠금 화면 뒤가 눌린다(혼자 정함).
    const s = studio()
    const first = lockForAiWork({ stage: s.stage, chats: [s.chat], keep: [s.keep] })
    const second = lockForAiWork({ stage: s.stage, chats: [s.chat], keep: [s.keep] })
    first.release()
    expect(blocked(s.content)).toBe(true)
    expect(blocked(s.input)).toBe(true)
    second.release()
    expect(blocked(s.content)).toBe(false)
    expect(blocked(s.input)).toBe(false)
  })

  it('열린 팝업 위의 잠금 화면은 지금처럼 이름 칸까지 모두 막는다', () => {
    // 왜: 팝업에서 시작한 일(그림 다시 그리기 · 샷 고치기)은 팝업 뒤를 통째로 덮는다 — 예전에도 이때는 레일까지 덮여 이름을 바꿀 수 없었다(혼자 정함).
    const s = studio()
    const lock = lockForAiWork({ stage: s.stage, chats: [s.chat], keep: [] })
    expect(blocked(s.titleButton)).toBe(true)
    expect(blocked(s.content)).toBe(true)
    lock.release()
    expect(blocked(s.titleButton)).toBe(false)
  })

  it('잠금 화면은 위 막대 자리를 덮지 않고 그 아래만 덮어 이름 칸을 누를 수 있다', () => {
    // 왜: 막이 위 막대 위에 놓이면 이름 칸이 막히지 않아도 손이 닿지 않는다. 막대를 못 찾으면 지금처럼 다 덮는다.
    const overlay = { left: 96, top: 0, right: 1440, bottom: 900, width: 1344, height: 900 }
    const bar = { left: 96, top: 0, right: 1072, bottom: 50, width: 976, height: 50 }
    expect(overlayClipPath(overlay, bar)).toBe('polygon(0px 0px, 0px 0px, 0px 50px, 976px 50px, 976px 0px, 100% 0px, 100% 100%, 0px 100%)')
    expect(overlayClipPath(overlay, null)).toBeUndefined()
    expect(read('src/components/ai-busy-overlay.tsx')).toMatch(/overlayClipPath\(/)
  })
})
