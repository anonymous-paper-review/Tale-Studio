// AI가 일하는 동안 바탕을 칠하지 않는 투명 덮개도 같은 잠금을 걸고, 덮개가 받은 휠 · 손가락 끌기는 아래 보기 칸을 스크롤하는지 검사한다
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AI_BUSY_SCROLL_ATTR, createScrollRelay, type ScrollPane } from '@/lib/ai-busy-scroll'
import { aiBusyOverlayFrame } from '@/components/ai-busy-overlay'
import { ScrollArea } from '@/components/ui/scroll-area'

/** 화면의 스크롤 칸 하나 — 이 시험이 보는 것은 자리와 스크롤한 양뿐이다. */
class Pane implements ScrollPane {
  scrolled = { x: 0, y: 0 }
  constructor(
    readonly name: string,
    private readonly rect: { left: number; top: number; right: number; bottom: number },
  ) {}
  get clientHeight() {
    return this.rect.bottom - this.rect.top
  }
  getBoundingClientRect() {
    return this.rect
  }
  scrollBy(x: number, y: number) {
    this.scrolled.x += x
    this.scrolled.y += y
  }
}

/** Writer 화면: 왼쪽 산문 칸 · 오른쪽 채팅 칸. */
function writer() {
  const prose = new Pane('산문', { left: 96, top: 50, right: 1000, bottom: 900 })
  const chat = new Pane('채팅', { left: 1000, top: 0, right: 1440, bottom: 900 })
  return { prose, chat, relay: createScrollRelay(() => [prose, chat]) }
}
const wheel = (x: number, y: number, deltaY: number, deltaMode = 0, ctrlKey = false) => ({ clientX: x, clientY: y, deltaX: 0, deltaY, deltaMode, ctrlKey })
const touches = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] })

describe('투명 덮개(scrim="clear")', () => {
  // 왜: 11/5 시안 WL · AR — Lumi 가 다시 쓰는 동안에도 산문 · 그림이 보여야 한다(prose 갈래 추천안 ㉠ "모양은 시안, 잠금은 그대로").
  //   덮개를 투명하게 해도 고치기 · 보내기는 끝날 때까지 막혀 있어야 같은 글을 두 번 고치지 않는다.
  it('덮개가 투명이어도 AI가 일하는 동안 단계 화면과 채팅은 잠겨 있다', () => {
    const source = readFileSync('src/components/ai-busy-overlay.tsx', 'utf8')
    // 잠금(inert)과 레일 붙잡기는 덮개 모양을 읽지 않는다 — 열려 있는 동안 늘 건다.
    expect(source).toMatch(/useEffect\(\(\) => \{\s*if \(!open\) return\s*const stage = [\s\S]*?lockForAiWork[\s\S]*?\}, \[open, layer\]\)/)
    expect(source).toMatch(/aiBusyHolds\(\{ open, busy \}\)/)
    // 투명 덮개도 단계 화면 위를 덮고 누르기를 받는다(뒤로 새지 않는다).
    for (const layer of ['stage', 'dialog'] as const) {
      const clear = aiBusyOverlayFrame(layer, 'clear')
      expect(clear).toMatch(/\bfixed\b/)
      expect(clear).not.toMatch(/pointer-events-none/)
      expect(clear).not.toMatch(/\bbg-/)
      expect(aiBusyOverlayFrame(layer, 'dim')).toMatch(/\bbg-background\/85\b/)
    }
  })

  // 왜: 잠근 칸(inert)은 휠을 받지 못한다 — 덮개가 받은 휠을 넘기지 않으면 보이기만 하고 읽을 수가 없다.
  it('투명 덮개 위에서 굴린 휠은 포인터 아래 산문 칸을 그만큼 스크롤한다', () => {
    const { prose, chat, relay } = writer()
    relay.wheel(wheel(400, 500, 120))
    expect(prose.scrolled).toEqual({ x: 0, y: 120 })
    expect(chat.scrolled).toEqual({ x: 0, y: 0 })
    // 줄 단위로 오는 휠(일부 마우스 · 브라우저)도 화면 픽셀로 옮긴다.
    relay.wheel(wheel(400, 500, 3, 1))
    expect(prose.scrolled.y).toBe(120 + 48)
    // 스크롤 칸이 없는 자리(위 막대 등)에서 굴리면 아무것도 움직이지 않는다.
    relay.wheel(wheel(40, 20, 120))
    expect(prose.scrolled.y).toBe(168)
    expect(chat.scrolled.y).toBe(0)
  })

  // 왜: 태블릿에서도 기다리는 동안 산문을 읽을 수 있어야 한다.
  it('투명 덮개 위에서 손가락으로 끌면 아래 칸이 손가락을 따라 스크롤한다', () => {
    const { prose, relay } = writer()
    relay.touchStart(touches(400, 600))
    relay.touchMove(touches(400, 500))
    expect(prose.scrolled.y).toBe(100)
    relay.touchMove(touches(400, 520))
    expect(prose.scrolled.y).toBe(80)
    relay.touchEnd()
    relay.touchMove(touches(400, 300))
    expect(prose.scrolled.y).toBe(80)
  })

  // 왜: 검토 A2 N1 — 오너 결정 4 "보기 · 스크롤은 되고"에는 채팅도 든다. 채팅 메시지는 Radix ScrollArea 라 실제로 스크롤하는 것은
  //   뿌리가 아니라 안쪽 viewport 다(뿌리에 표시를 달면 scrollBy 가 먹지 않는다).
  it('투명 덮개 위에서 굴린 휠은 채팅 메시지 칸도 스크롤한다 — 표시는 채팅의 실제 스크롤 칸에 붙는다', () => {
    const html = renderToStaticMarkup(createElement(ScrollArea, { viewportProps: { [AI_BUSY_SCROLL_ATTR]: '' } }, '대화'))
    const viewport = html.match(/<div[^>]*data-slot="scroll-area-viewport"[^>]*>/)?.[0] ?? ''
    const root = html.match(/<div[^>]*data-slot="scroll-area"[^>]*>/)?.[0] ?? ''
    expect(viewport).toContain(`${AI_BUSY_SCROLL_ATTR}=""`)
    expect(root).not.toContain(AI_BUSY_SCROLL_ATTR)
    expect(readFileSync('src/components/layout/global-chat.tsx', 'utf8')).toMatch(/<ScrollArea\b[^>]*viewportProps=\{\{ \[AI_BUSY_SCROLL_ATTR\]: '' \}\}/)
  })

  // 왜: 검토 A2 N2 — 트랙패드 오므리기 · Ctrl+휠은 확대 · 축척(Artist 보드)이다. 아래 칸을 스크롤하면 안 된다.
  it('Ctrl 을 누른 채 굴린 휠(트랙패드 오므리기)은 아래 칸으로 넘기지 않는다', () => {
    const { prose, relay } = writer()
    relay.wheel(wheel(400, 500, 120, 0, true))
    expect(prose.scrolled.y).toBe(0)
    relay.wheel(wheel(400, 500, 120))
    expect(prose.scrolled.y).toBe(120)
  })

  // 왜: 산문 칸 안에 작은 스크롤 칸(문단 목록 등)이 있으면 손이 닿은 안쪽 칸이 움직여야 한다.
  it('스크롤 칸이 겹치면 투명 덮개는 포인터 아래 가장 안쪽 칸을 스크롤한다', () => {
    const outer = new Pane('산문', { left: 96, top: 50, right: 1000, bottom: 900 })
    const inner = new Pane('문단 목록', { left: 200, top: 300, right: 600, bottom: 500 })
    const relay = createScrollRelay(() => [outer, inner])
    relay.wheel(wheel(300, 400, 60))
    expect(inner.scrolled.y).toBe(60)
    expect(outer.scrolled.y).toBe(0)
    relay.wheel(wheel(800, 400, 60))
    expect(outer.scrolled.y).toBe(60)
  })
})
