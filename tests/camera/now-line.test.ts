// Cinema 채팅 맨 위 "지금 할 일"이 다음 단계를 가리킬 때 화면 위 [다음] 단추와 같은 말("다음: Director로")인지 검사한다 (fb-camera QA F · 리드 2026-11-23)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lumiNowLine } from '@/lib/director/lumi-now-line'
import { nextStepAction } from '@/lib/handoff-intent'
import { translate } from '@/lib/i18n/translate'
import type { DirectorShotState } from '@/lib/director/shot-state'

const t = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
const allDone = new Map<string, DirectorShotState>([['s1', 'video_done'], ['s2', 'video_done']])
const input = (next?: string) => ({
  states: allDone,
  imageBusy: false,
  videoBusy: false,
  progress: null,
  canHandOff: true,
  chain: false,
  modelOf: () => 'seedance' as const,
  takesFor: () => 0,
  takesShown: true,
  ...(next ? { next } : {}),
})

describe('같이 정한 것(리드 11/23)', () => {
  it('Cinema 에서 만들 것이 없고 완성 영상이 있으면 지금 할 일 줄은 화면 위 단추와 같은 "지금 할 일 · 다음: Director로"다', () => {
    // 왜: Cinema 위 단추는 "다음: Director로"인데 채팅 맨 위 줄은 Director 의 "다음: Editor로"를 그대로 써서 한 화면에 "다음"이 둘이었다(QA F).
    const cinemaNext = nextStepAction('camera', { producerLocked: false })
    expect(cinemaNext?.label).toBe('Next: Director')
    expect(lumiNowLine(input(t(cinemaNext!.label)), t)).toBe('지금 할 일 · 다음: Director로')
    // Director 는 지금 그대로 "다음: Editor로"(다음 단계를 건네지 않으면 Editor).
    expect(lumiNowLine(input(), t)).toBe('지금 할 일 · 다음: Editor로')
    expect(lumiNowLine(input(t(nextStepAction('director', { producerLocked: false })!.label)), t)).toBe('지금 할 일 · 다음: Editor로')
    // 줄을 그리는 곳은 지금 단계의 [다음] 단추와 같은 말을 건넨다.
    const ui = readFileSync('src/features/director/lumi-now-line.tsx', 'utf8')
    expect(ui).toMatch(/const nextAction = nextStepAction\(stage, \{ producerLocked \}\)/)
    expect(ui).toMatch(/next: nextAction \? t\(nextAction\.label\) : undefined,/)
  })
})
