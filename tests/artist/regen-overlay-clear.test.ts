// Artist 작품 스타일을 다시 그리는 동안 기다리는 창은 화면을 덮지 않고(잠금은 그대로) 카드가 보인다(11/5 시안 AR, 리드 추천안 ㉠ · 오너 2026-11-09)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = () => readFileSync('src/app/studio/artist/page.tsx', 'utf8')
const overlayOf = (source: string, name: string) => source.match(new RegExp(`const ${name} = [\\s\\S]*?<AiBusyOverlay[\\s\\S]*?\\/>`))?.[0] ?? ''

describe('다시 그리는 동안 기다리는 창 모양', () => {
  it('다시 그리는 동안 기다리는 창은 화면을 덮지 않고(투명 덮개) Artist 옷 Lumi 카드로 뜬다', () => {
    // 왜: 11/5 시안 AR "화면에 반영" — 카드마다 새로 그렸어요 · 그리는 중 · 순서 기다리는 중을 덮개 너머로 본다.
    //   고치기 · 채팅 입력 잠금은 그대로(리드 2026-11-09 ㉠). 카드에는 Artist 옷 Lumi(오너 2026-11-09 결정 4 추천대로).
    const regen = overlayOf(page(), 'regenOverlay')
    expect(regen).toContain('scrim="clear"')
    expect(regen).toContain('lumi="artist"')
  })

  it('Artist 카드 칸은 투명 덮개 너머로 휠 · 손가락 끌기로 스크롤된다', () => {
    // 왜: 투명 덮개가 받은 휠 · 끌기는 [data-ai-busy-scroll] 칸으로만 넘어간다 — 표시가 없으면 아래 카드까지 내려 볼 수 없다.
    expect(page()).toMatch(/<div className="min-h-0 flex-1 overflow-y-auto[^"]*" data-ai-busy-scroll>/)
  })

  it('처음 그림을 기다리는 화면은 지금처럼 덮고 Artist 옷 Lumi 카드로 뜬다', () => {
    // 왜: 정상 경로 고정 — 산문을 넘겨 아직 카드가 없는 기다림은 단계를 넘어가는 자리라 큰 Lumi 가 화면을 덮는다(오너 결정 8).
    const making = overlayOf(page(), 'makingOverlay')
    expect(making).toContain('lumi="artist"')
    expect(making).not.toContain('scrim="clear"')
  })
})
