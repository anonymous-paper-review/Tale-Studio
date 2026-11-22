// 실사 그림 지시에 "끝 장을 그린 읽은 줄"을 움직임으로 싣는지 검사한다(D10 ② · 2026-11-22 오너 R1 "추천대로")
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildRealGridPrompt, buildRealStripPrompt } from '@/lib/director/storyboard-strip'
import { freshDirectionLine } from '@/lib/writer/direction-read'

const read = (rel: string) => readFileSync(rel, 'utf8')
// 이 시험을 위해 지은 샷 — 샷 글은 옛 움직임(앞으로 걸어감)이고, 사람이 화살표를 고쳐 읽은 줄은 돌아서 카메라 쪽으로 온다.
const SHOT_TEXT = 'Min-ho walks forward toward the vending machine.'
const LINE = 'The figure on the left turns around and walks toward the camera, ending large in the lower right.'
const strip = (opts: Partial<Parameters<typeof buildRealStripPrompt>[1]> = {}) =>
  buildRealStripPrompt(SHOT_TEXT, { characterRefCount: 1, hasStyleRef: false, ...opts })
const grid = (opts: Partial<Parameters<typeof buildRealGridPrompt>[1]> = {}) => buildRealGridPrompt(3, { characterRefCount: 1, hasStyleRef: false, ...opts })
const MOVEMENT = `- Movement (the director edited it after the shot description was written; where the two disagree, follow this movement and reference panel 3): ${LINE}`

describe('실사 지시의 읽은 줄', () => {
  // 왜(오너 R1): 끝 장을 고친 화살표대로 다시 그렸는데 실사 지시가 옛 샷 글만 따르면 실사 끝 그림이 옛 움직임으로 돌아간다.
  //   샷 글은 지우지 않는다(인물 · 소품 · 분위기가 들어 있다) — 다를 때 무엇을 따를지만 적는다(혼자 정한 것 a).
  it('실사 한 샷을 그릴 때 그 샷의 끝 장을 그린 읽은 줄이 있으면 그 줄을 움직임으로 싣고, 샷 글과 다르면 그 줄과 참고 끝 칸을 따르라고 적는다', () => {
    const prompt = strip({ directionLine: LINE })
    expect(prompt).toContain(MOVEMENT)
    expect(prompt).toContain(`- Shot description: ${SHOT_TEXT}`)
    expect(prompt.indexOf('- Shot description:')).toBeLessThan(prompt.indexOf('- Movement ('))
    expect(prompt.indexOf('- Movement (')).toBeLessThan(prompt.indexOf('- No text, letters or numbers anywhere'))
    const single = read('src/app/api/director/generate-storyboard/route.ts')
    expect(single).toMatch(/const directionLine = stripFrames \? freshDirectionLine\(shot\?\.rough_storyboard\) : null/)
    expect(single).toMatch(/buildRealStripPrompt\(guardedPrompt, \{[\s\S]*?\n\s+directionLine,\n/)
  })

  // 왜(오너 R1): 네 샷 시트는 칸마다 샷이 달라 칸 번호가 있어야 한다 — 줄 있는 칸만 싣는다(혼자 정한 것 b). 시트 길에는 샷 글이 없어 다툼이 없다.
  it('실사 네 샷 시트를 그릴 때 끝 장을 그린 읽은 줄이 있는 칸만 그 줄을 칸 번호와 함께 싣는다', () => {
    const prompt = grid({ directionLines: [LINE, null, 'The camera pulls back to a wide shot.'] })
    const at = prompt.indexOf('- Per-column movement')
    expect(at).toBeGreaterThan(0)
    const block = prompt.slice(at, prompt.indexOf('- No text, letters or numbers anywhere'))
    expect(block).toContain(`Column 1: ${LINE}`)
    expect(block).toContain('Column 3: The camera pulls back to a wide shot.')
    expect(block).not.toContain('Column 2:')
    const batch = read('src/app/api/director/generate-storyboard-batch/route.ts')
    expect(batch).toMatch(/directionLine: freshDirectionLine\(s\.rough_storyboard\),/)
    expect(batch).toMatch(/directionLines: group\.map\(\(s\) => s\.directionLine\),/)
  })

  // 왜(오너 R1 · 리드 Q-a · D2): 실사에는 끝 칸이 있어 끝 장에 쓴 줄만 싣는다. 줄이 없거나 낡았거나 [그대로]를 골라 아직 끝 장에 안 쓴 줄이면 지금 지시 그대로다.
  //   (영상은 2026-11-23 리드 D2 부터 끝 장과 상관없이 지금 연출 장을 읽은 줄을 쓴다 — 조건이 다르다.)
  it('읽은 줄이 없거나 낡았거나 아직 끝 장에 안 쓴 줄이면 실사 지시에 싣지 않는다', () => {
    expect(strip({ directionLine: null })).toBe(strip())
    expect(strip({ directionLine: '   ' })).toBe(strip())
    expect(strip()).not.toContain('- Movement (')
    expect(grid({ directionLines: [null, null, null] })).toBe(grid())
    expect(grid()).not.toContain('Per-column movement')
    const frames = { start: 's', direction: 'd', end: 'e2' }
    expect(freshDirectionLine({ frames, directionRead: { en: LINE, ko: null, source: 'ai', direction: 'd', at: 1, endDrawn: null } })).toBeNull()
    expect(freshDirectionLine({ frames, directionRead: { en: LINE, ko: null, source: 'ai', direction: 'd-old', at: 1, endDrawn: 'e2' } })).toBeNull()
  })

  // 왜(10/11 약속): 읽은 줄은 사용자 손글씨가 옮겨진 글이다 — 그림 지시에 싣기 전에 내용 검사를 거친다.
  it('실사 지시에 싣는 읽은 줄도 내용 검사를 거친다', () => {
    const single = read('src/app/api/director/generate-storyboard/route.ts')
    expect(single).toMatch(/assertUserTextAllowed\(\s*\[\s*promptEn,[\s\S]*?\n\s+directionLine,\n[\s\S]*?\],\s*\{ projectId, kind: 'shot_storyboard'/)
    const batch = read('src/app/api/director/generate-storyboard-batch/route.ts')
    expect(batch).toMatch(/assertUserTextAllowed\(\s*\[[\s\S]*?\.\.\.group\.map\(\(s\) => s\.directionLine\),[\s\S]*?\],\s*\{ projectId, kind: 'storyboard_real_grid'/)
  })
})
