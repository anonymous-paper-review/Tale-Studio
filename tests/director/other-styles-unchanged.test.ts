// 실사 그림체가 아닌 길(일본 멜로 · 애니 · 수채 · 그림체 없음 …)의 실사 샷 · 영상 · 인물 시트 지시문이 2026-11-23 main 과 글자까지 같은지 검사한다 (오너 "1 이전 버전을 일본 멜로 스타일로")
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildRealGridPrompt, buildRealStripPrompt } from '@/lib/director/storyboard-strip'
import { buildVideoPrompt } from '@/lib/director/video-prompt'
import { compileMotionContract } from '@/lib/director/motion-contract'
import { buildCharacterTurnaroundPrompt } from '@/lib/artist/turnaround'
import { CASES } from '../fixtures/other-style-cases.mjs'

const frozen = JSON.parse(readFileSync('tests/fixtures/other-style-prompts.json', 'utf8')) as Record<string, string>
const now = CASES({ buildRealGridPrompt, buildRealStripPrompt, buildVideoPrompt, compileMotionContract, buildCharacterTurnaroundPrompt }) as unknown as Record<string, string>

describe('일본 멜로와 다른 그림체는 지금 그대로', () => {
  for (const [kind, name] of [['strip/', '한 샷 실사'], ['grid/', '네 샷 실사 시트'], ['video/', '영상'], ['sheet/', '인물 시트']] as const) {
    it(`실사 그림체가 아니면 ${name} 지시문이 2026-11-23 main 과 글자까지 같다`, () => {
      // 왜: 오너가 일본 멜로는 "1 이전"으로 정했고 나머지 그림체는 정하지 않았다 — 실사만 바꾸면서 다른 그림체가 따라 바뀌면 안 된다.
      const keys = Object.keys(frozen).filter((key) => key.startsWith(kind))
      expect(keys.length).toBeGreaterThan(0)
      for (const key of keys) expect({ key, text: now[key] }).toEqual({ key, text: frozen[key] })
    })
  }
})
