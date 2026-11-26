// Director 스토리보드 보기의 카드 · 씬 이름을 ⌘/Ctrl+클릭하면 다른 탭과 같은 길(방향 보기 → 멘션 넣고 빼기 → 비행)로 @이름이 채팅 입력칸과 오간다 (오너 2026-11-26 G3 · dev D9)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const grid = () => readFileSync('src/features/director/canvas-views/StoryboardGridView.tsx', 'utf8')
/** 카드(ShotCell) 몸 · 보드(StoryboardGridView) 몸. */
function part(name: 'card' | 'board'): string {
  const src = grid()
  const card = src.indexOf('function ShotCell(')
  const board = src.indexOf('export function StoryboardGridView(')
  expect(card).toBeGreaterThan(-1)
  expect(board).toBeGreaterThan(card)
  return name === 'card' ? src.slice(card, board) : src.slice(board)
}
/** 다른 탭(Producer · Artist)과 같은 길 — 넣고 빼기 전에 입력칸 글로 방향을 보고, 멘션을 토글하고, 누른 자리에서 비행한다. */
const SAME_PATH = /const removing = chatInputHasMention\(label\)\s*requestMentionToggle\(label\)\s*launchMentionFlight\(\{ label, clickX: event\.clientX, clickY: event\.clientY, toChat: !removing \}\)/

describe('Director 스토리보드 보기 ⌘/Ctrl+클릭 멘션 비행', () => {
  it('스토리보드 보기 카드를 ⌘/Ctrl+클릭하면 @이름이 누른 자리에서 채팅 입력칸으로 날아간다', () => {
    // 왜: 오너 2026-11-26 G3 "Alt 좌클릭(storyboard 탭, director 탭에서 애니메이션 없음)" — Director 카드는 멘션만 들어가고 날아가는 연출이 없었다.
    //   비행이 닫힌 채팅의 "다 열린 입력칸 자리"로 나는 것은 tests/chat/mention-flight.test.ts 가 본다.
    const card = part('card')
    expect(card).toMatch(SAME_PATH)
    expect(grid()).toContain("import { chatInputHasMention, launchMentionFlight } from '@/lib/mention-flight'")
  })

  it('이미 멘션된 카드를 다시 ⌘/Ctrl+클릭하면 @이름이 빠지며 입력칸에서 누른 자리로 돌아온다', () => {
    // 왜: 같은 조작으로 붙이고 뗀다(#b5 · #b2) — 방향은 멘션을 넣고 빼기 전의 입력칸 글로 본다. 뺀 뒤에 보면 늘 "없음"이라 반대로 난다.
    const card = part('card')
    const check = card.indexOf('chatInputHasMention(label)')
    const toggle = card.indexOf('requestMentionToggle(label)')
    expect(check).toBeGreaterThan(-1)
    expect(toggle).toBeGreaterThan(check)
    expect(card).toContain('toChat: !removing')
  })

  it('씬 이름을 ⌘/Ctrl+클릭해도 같은 비행이 나온다', () => {
    // 왜: 오너 D9 "모든 탭에서 같게" — 씬 이름도 카드와 같은 멘션이라 같은 연출이어야 한다.
    expect(part('board')).toMatch(SAME_PATH)
  })

  it('⌘/Ctrl 없이 카드를 누르면 지금처럼 그 샷을 고르고 멘션 · 비행은 없다', () => {
    // 왜: 정상 경로 고정 — 카드 몸통 누르기 = 고르기(시안 D2 · R), ⌘/Ctrl 누르기만 멘션이다.
    const card = part('card')
    expect(card).toMatch(/onClick=\{\(event\) => \{\s*if \(isMentionModifierClick\(event\)\) return\s*togglePickedShot\(node\.id\)/)
    expect(card).toMatch(/const label = mentionLabelForModifierClick\(event, shotMention\)\s*if \(!label\) return false/)
  })
})
