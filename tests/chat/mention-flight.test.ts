// ⌘/Ctrl+클릭 멘션의 비행이, 채팅이 열려 있으면 지금처럼 입력칸으로 날고, 닫혀 있었으면(Director · Editor) 채팅이 다 열렸을 때의 입력칸 자리로 나는지 검사한다 (오너 D9 2026-11-22 · 리드 답 d)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { launchMentionFlight, restingChatInputRect } from '@/lib/mention-flight'

interface Box { left: number; top: number; width: number; height: number; right: number; bottom: number }
const box = (left: number, top: number, width: number, height: number): Box => ({ left, top, width, height, right: left + width, bottom: top + height })

/** 채팅 패널(폭 400, 화면 폭 1440)과 그 안 입력칸(패널 왼쪽에서 20 · 위 800 · 높이 52)을 가진 가짜 화면. shift = 패널이 오른쪽으로 밀린 거리. */
function fakeScreen({ shift = 0, reducedMotion = false, withInput = true }: { shift?: number; reducedMotion?: boolean; withInput?: boolean } = {}) {
  const flights: Array<{ left: string; top: string; text: string; keyframes: Array<{ transform: string }>; duration: number }> = []
  const panel = { getBoundingClientRect: () => box(1040 + shift, 0, 400, 900) }
  const input = {
    value: '',
    getBoundingClientRect: () => box(1060 + shift, 800, 360, 52),
    closest: (selector: string) => (selector === '[data-chat-panel]' ? panel : null),
  }
  vi.stubGlobal('document', {
    documentElement: { clientWidth: 1440 },
    querySelector: (selector: string) => (selector === '[data-chat-panel] textarea' && withInput ? input : null),
    createElement: () => {
      const el = { textContent: '', className: '', style: {} as Record<string, string>, remove: () => {} }
      return Object.assign(el, {
        animate: (keyframes: Array<{ transform: string }>, options: { duration: number }) => {
          flights.push({ left: el.style.left!, top: el.style.top!, text: el.textContent, keyframes, duration: options.duration })
          return { onfinish: null, oncancel: null }
        },
      })
    },
    body: { appendChild: () => {} },
  })
  vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 })
  vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }))
  return flights
}

afterEach(() => vi.unstubAllGlobals())

// 입력칸 왼쪽 + 20, 세로 가운데 — 비행이 내려앉는 자리(지금 그대로).
const CHAT = { x: 1060 + 20, y: 800 + 26 }

describe('멘션 비행', () => {
  it('채팅이 열려 있으면 @이름은 누른 자리에서 지금 입력칸 자리로 날아간다(Producer · Artist 지금 그대로)', () => {
    // 왜: Producer · Artist 는 채팅이 열린 채 일한다 — 이번 손질이 그 비행을 바꾸면 안 된다(리드 11/22 답 d).
    const flights = fakeScreen()
    launchMentionFlight({ label: '민준', clickX: 100, clickY: 200, toChat: true })
    expect(flights).toHaveLength(1)
    expect(flights[0]).toMatchObject({ left: '100px', top: '200px', text: '@민준', duration: 600 })
    expect(flights[0]!.keyframes[1]!.transform).toBe(`translate(calc(-50% + ${CHAT.x - 100}px), calc(-50% + ${CHAT.y - 200}px)) scale(0.72)`)
  })

  it('채팅이 열려 있으면 멘션이 빠질 때 @이름은 입력칸에서 누른 자리로 돌아온다', () => {
    // 왜: 다시 ⌘/Ctrl+클릭해 멘션을 빼면 반대로 난다(#b5 · #b2) — 지금 그대로.
    const flights = fakeScreen()
    launchMentionFlight({ label: '민준', clickX: 100, clickY: 200, toChat: false })
    expect(flights[0]).toMatchObject({ left: `${CHAT.x}px`, top: `${CHAT.y}px` })
    expect(flights[0]!.keyframes[1]!.transform).toBe(`translate(calc(-50% + ${100 - CHAT.x}px), calc(-50% + ${200 - CHAT.y}px)) scale(0.72)`)
  })

  it('채팅이 닫혀 있었으면 @이름은 채팅이 다 열렸을 때의 입력칸 자리로 날아간다', () => {
    // 왜: Director · Editor 는 채팅을 닫은 채 시작한다. 닫힌 채팅은 화면 오른쪽 밖에 있어 예전에는 @이름이 화면 밖으로 날아갔다(오너 D9 "애니메이션도 동일하게").
    //   멘션 요청이 채팅을 여는 동안(0.35초) @이름이 날아가(0.6초) 열린 입력칸에 내려앉는다.
    const flights = fakeScreen({ shift: 400 })
    launchMentionFlight({ label: '실사 샷 8', clickX: 300, clickY: 400, toChat: true })
    expect(flights[0]!.keyframes[1]!.transform).toBe(`translate(calc(-50% + ${CHAT.x - 300}px), calc(-50% + ${CHAT.y - 400}px)) scale(0.72)`)
  })

  it('채팅이 열리는 중이어도 @이름은 다 열렸을 때의 입력칸 자리로 날아간다', () => {
    // 왜: 반쯤 밀려 들어온 패널의 지금 자리로 날면 멈춘 패널 옆 빈 곳에 내려앉는다.
    expect(restingChatInputRect(box(1260, 800, 360, 52), box(1240, 0, 400, 900), 1440)).toMatchObject({ left: 1060, right: 1420, top: 800 })
    expect(restingChatInputRect(box(1060, 800, 360, 52), box(1040, 0, 400, 900), 1440)).toMatchObject({ left: 1060, right: 1420 })
  })

  it('움직임 줄이기를 켠 화면에서는 날지 않는다', () => {
    // 왜: prefers-reduced-motion 을 존중한다(지금 그대로). 멘션 자체는 requestMentionToggle 이 넣는다.
    const flights = fakeScreen({ reducedMotion: true })
    launchMentionFlight({ label: '민준', clickX: 100, clickY: 200, toChat: true })
    expect(flights).toHaveLength(0)
  })

  it('채팅 입력칸이 없는 화면에서는 날지 않는다', () => {
    // 왜: 채팅이 없는 화면(대시보드 등)에서 허공으로 날지 않는다(지금 그대로).
    const flights = fakeScreen({ withInput: false })
    launchMentionFlight({ label: '민준', clickX: 100, clickY: 200, toChat: true })
    expect(flights).toHaveLength(0)
  })

  it('Producer · Artist 카드는 지금처럼 멘션을 넣기 전에 방향을 보고 같은 비행을 부른다', () => {
    // 왜: 이 공용 부품을 고쳐도 두 화면의 부르는 법(입력칸 글로 방향 판정 → 멘션 토글 → 비행)은 그대로다. 파일이 옮겨져도 폴더 안 어디서든 찾는다.
    const callers = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) return callers(full)
        return /\.tsx?$/.test(entry) && readFileSync(full, 'utf8').includes('launchMentionFlight(') ? [readFileSync(full, 'utf8')] : []
      })
    for (const folder of ['src/features/producer', 'src/features/artist']) {
      const sources = callers(folder)
      expect(sources.length, folder).toBeGreaterThan(0)
      for (const source of sources) {
        expect(source).toMatch(/const removing = chatInputHasMention\(/)
        expect(source).toMatch(/toChat: !removing/)
      }
    }
  })
})
