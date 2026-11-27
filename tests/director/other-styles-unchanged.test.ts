// 실사 그림체가 아닌 길(일본 멜로 · 애니 · 수채 · 그림체 없음 …)의 실사 샷 · 인물 시트 지시문이 2026-11-23 main 과, 영상 지시문이 2026-11-27 main(영상 방식 넷)과 글자까지 같은지 검사한다 (오너 "1 이전 버전을 일본 멜로 스타일로" · 11/27 "추천대로" 다시 고정)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildRealGridPrompt, buildRealStripPrompt } from '@/lib/director/storyboard-strip'
import { buildVideoPrompt } from '@/lib/director/video-prompt'
import { compileMotionContract } from '@/lib/director/motion-contract'
import { buildCharacterTurnaroundPrompt } from '@/lib/artist/turnaround'
import { SHOT_REFERENCE_LABEL } from '@/lib/director/video-mode-frames'
import { VIDEO_MODES } from '@/lib/director/video-modes'
import { CASES, VIDEO_CASES } from '../fixtures/other-style-cases.mjs'

const frozen = JSON.parse(readFileSync('tests/fixtures/other-style-prompts.json', 'utf8')) as Record<string, string>
const parts = { buildRealGridPrompt, buildRealStripPrompt, buildVideoPrompt, compileMotionContract, buildCharacterTurnaroundPrompt, SHOT_REFERENCE_LABEL }
const now = CASES(parts) as unknown as Record<string, string>
type VideoCase = { videoMode?: string | null; generationMethod: string; referenceImageRoles?: string[] }
const videoCases = VIDEO_CASES(parts) as unknown as Record<string, VideoCase>

function expectFrozen(kind: string) {
  const keys = Object.keys(frozen).filter((key) => key.startsWith(kind))
  expect(keys.length).toBeGreaterThan(0)
  for (const key of keys) expect({ key, text: now[key] }).toEqual({ key, text: frozen[key] })
}

describe('일본 멜로와 다른 그림체는 지금 그대로', () => {
  for (const [kind, name] of [['strip/', '한 샷 실사'], ['grid/', '네 샷 실사 시트'], ['sheet/', '인물 시트']] as const) {
    it(`실사 그림체가 아니면 ${name} 지시문이 2026-11-23 main 과 글자까지 같다`, () => {
      // 왜: 오너가 일본 멜로는 "1 이전"으로 정했고 나머지 그림체는 정하지 않았다 — 실사만 바꾸면서 다른 그림체가 따라 바뀌면 안 된다.
      expectFrozen(kind)
    })
  }

  it('실사 그림체가 아니면 영상 지시문이 2026-11-27 main(영상 방식 넷)과 글자까지 같다', () => {
    // 왜: 오너가 영상 방식 넷을 모든 그림체에 정했다(11/27) — 그 뒤 다른 그림체의 영상 지시문이 모르게 바뀌면 안 된다.
    expectFrozen('video/')
    expect(Object.keys(now).filter((key) => key.startsWith('video/')).sort()).toEqual(Object.keys(frozen).filter((key) => key.startsWith('video/')).sort())
  })
})

describe('혼자 정한 것', () => {
  // 왜: 옛 고정은 서버가 더는 보내지 않는 모양(시작 · 끝 두 장 · 방식 없음)을 지키고 있었다(11/27 리드) — 고정 경우가 다시 그렇게 되지 않게 경우 쪽 규칙 셋만 본다
  //   (방식이 늘면 경우도 늘린다). 서버가 넘기는 모양이 바뀌는 것은 이 시험이 아니라 video-modes 시험이 잡는다.
  it('다른 그림체 영상 고정 경우는 방식 넷을 모두 담고, 끝 그림 역할이 없고, 그림이 있는 영상만 그림 역할을 싣는다', () => {
    const cases = Object.values(videoCases)
    expect(cases.length).toBeGreaterThan(0)
    expect([...new Set(cases.map((c) => c.videoMode).filter(Boolean))].sort()).toEqual([...VIDEO_MODES].sort())
    for (const [key, c] of Object.entries(videoCases)) {
      expect({ key, end: (c.referenceImageRoles ?? []).includes('end') }).toEqual({ key, end: false })
      expect({ key, roles: (c.referenceImageRoles ?? []).length > 0 }).toEqual({ key, roles: c.generationMethod === 'I2V' })
    }
  })
})
