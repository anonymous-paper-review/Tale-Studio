// 실사 그림체 영상 지시문(설계 없음 · 설계 길)이 2026-11-27 main 과 글자까지 같은지 검사한다 — 실사가 아닌 그림체의 겹마침표 고침(오너 3차)이 실사 길을 건드리지 않게 (검토 rev-video 3 낮음 4)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildVideoPrompt, type BuildVideoPromptInput } from '@/lib/director/video-prompt'
import { REAL_VIDEO_CASES } from '../fixtures/real-video-cases.mjs'

const frozen = JSON.parse(readFileSync('tests/fixtures/real-video-prompts.json', 'utf8')) as Record<string, string>
const cases = REAL_VIDEO_CASES() as unknown as Record<string, BuildVideoPromptInput>
const now = (key: string) => buildVideoPrompt(cases[key]!).fullPrompt

describe('실사 그림체는 지금 그대로', () => {
  it('실사 그림체의 설계 없는 영상 지시문(움직임 약속 · 읽은 줄 없음)은 2026-11-27 main 과 글자까지 같다', () => {
    // 왜: 겹마침표 고침(오너 11/27 3차 "고쳐줘")은 실사가 아닌 그림체만이다 — 실사 지시문은 오너가 11/23 "모두 적용"으로 정한 그대로여야 한다.
    //   설계 없는 실사 길도 조각을 지금처럼 ". "로 잇는다(검토 rev-video 3 낮음 4: 이 길을 지키는 시험이 없었다).
    expect(now('real/no-design')).toBe(frozen['real/no-design'])
  })

  it('실사 그림체의 설계 길 영상 지시문(움직임 약속 · 설계 렌즈와 빛 · 인물 이름)은 2026-11-27 main 과 글자까지 같다', () => {
    // 왜: 실사 지시문의 흔한 모양(움직임 약속이 있는 설계 길)도 겹마침표 고침과 상관없이 한 글자도 바뀌면 안 된다.
    expect(now('real/design')).toBe(frozen['real/design'])
  })
})
