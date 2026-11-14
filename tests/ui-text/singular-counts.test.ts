// 영어 첫 안내(Artist 인물 · 배경, Storyboard 씬 · 샷)는 수가 1이면 단수로 말하고, 한국어는 그대로다
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { artistBriefText } from '@/lib/artist/brief'
import { translate } from '@/lib/i18n/translate'
import { storyboardBriefing } from '@/lib/writer/board-summary'

const en = (text: string, params?: Record<string, string | number>) => translate('en', text, params)
const ko = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
const firstLine = (text: string) => text.split('\n')[0]

describe('Artist 첫 안내의 인물 · 배경 수', () => {
  it('영어 첫 안내는 인물 · 배경이 1이면 "1 character · 1 background"로 단수로 말한다', () => {
    // 왜: "1 backgrounds"처럼 수가 하나여도 복수형으로 나왔다.
    expect(firstLine(artistBriefText(en, { count: 1, worldCount: 1 }))).toBe('I have concepts ready for the characters and backgrounds: 1 character · 1 background.')
    expect(firstLine(artistBriefText(en, { count: 2, worldCount: 1 }))).toBe('I have concepts ready for the characters and backgrounds: 2 characters · 1 background.')
    expect(firstLine(artistBriefText(en, { count: 1, worldCount: 3 }))).toBe('I have concepts ready for the characters and backgrounds: 1 character · 3 backgrounds.')
  })

  it('영어 첫 안내는 수가 둘 이상이거나 0이면 지금처럼 복수로 말한다', () => {
    // 왜: 정상 경로 고정 — 0 도 영어에서는 복수형이다("0 characters").
    expect(firstLine(artistBriefText(en, { count: 6, worldCount: 12 }))).toBe('I have concepts ready for the characters and backgrounds: 6 characters · 12 backgrounds.')
    expect(firstLine(artistBriefText(en, { count: 0, worldCount: 0 }))).toBe('I have concepts ready for the characters and backgrounds: 0 characters · 0 backgrounds.')
  })

  it('한국어 첫 안내는 수가 1이어도 그대로다', () => {
    // 왜: 한국어는 단수 · 복수가 없다 — 네 경우가 모두 같은 문장이어야 한다.
    const lines = [
      artistBriefText(ko, { count: 1, worldCount: 1 }),
      artistBriefText(ko, { count: 1, worldCount: 5 }),
      artistBriefText(ko, { count: 4, worldCount: 1 }),
    ]
    expect(firstLine(lines[0])).toBe('인물과 배경의 컨셉을 준비했어요: 캐릭터 1명 · 배경 1곳.')
    expect(firstLine(lines[1])).toBe('인물과 배경의 컨셉을 준비했어요: 캐릭터 1명 · 배경 5곳.')
    expect(firstLine(lines[2])).toBe('인물과 배경의 컨셉을 준비했어요: 캐릭터 4명 · 배경 1곳.')
    // 나머지 두 줄(고치고 싶은 곳 · "@" 안내)은 네 경우가 같다.
    expect(lines[0].split('\n').slice(1)).toEqual(artistBriefText(ko, { count: 6, worldCount: 12 }).split('\n').slice(1))
  })

  it('Artist 화면은 첫 안내를 수에 맞는 문장으로 짓는다', () => {
    // 왜: 문장을 고르는 함수가 있어도 화면이 옛 한 줄 키를 그대로 부르면 단수 고침이 화면에 닿지 않는다.
    const page = readFileSync('src/app/studio/artist/page.tsx', 'utf8')
    expect(page).toMatch(/artistBriefText\(t, briefCounts\)/)
  })
})

describe('Storyboard 첫 안내의 씬 · 샷 수', () => {
  it('영어 첫 안내는 씬 · 샷이 1이면 "Split into 1 scene, 1 shot"으로 단수로 말한다', () => {
    // 왜: "Split into 1 scenes, 1 shots"처럼 수가 하나여도 복수형으로 나왔다.
    const split = (sceneCount: number, shotCount: number) => storyboardBriefing('en', { sceneCount, shotCount }).split('\n').find((line) => line.includes('Split into'))
    expect(split(1, 1)).toBe('· Split into 1 scene, 1 shot')
    expect(split(1, 8)).toBe('· Split into 1 scene, 8 shots')
    expect(split(3, 1)).toBe('· Split into 3 scenes, 1 shot')
  })

  it('영어 첫 안내는 수가 둘 이상이면 지금처럼 복수로 말하고, 한국어는 그대로다', () => {
    // 왜: 정상 경로 고정 — 보드 첫 안내의 기존 문장(씬 3개, 샷 8개)을 바꾸지 않는다.
    expect(storyboardBriefing('en', { sceneCount: 3, shotCount: 8 })).toContain('· Split into 3 scenes, 8 shots')
    for (const [sceneCount, shotCount] of [[1, 1], [1, 8], [3, 1], [3, 8]] as const) {
      expect(storyboardBriefing('ko', { sceneCount, shotCount })).toContain(`· 씬 ${sceneCount}개, 샷 ${shotCount}개로 나눴어요`)
    }
  })

  it('Storyboard 첫 안내는 수와 상관없이 나머지 문장이 같다', () => {
    // 왜: 단수 문장 키를 짝으로 더하다 뒤 줄(러프 안내 · "@" 안내)이 어긋나면 한 경우만 말이 달라진다.
    const rest = (text: string) => text.split('\n').filter((line) => !line.includes('Split into') && !line.includes('로 나눴어요'))
    expect(rest(storyboardBriefing('en', { sceneCount: 1, shotCount: 1 }))).toEqual(rest(storyboardBriefing('en', { sceneCount: 3, shotCount: 8 })))
    expect(rest(storyboardBriefing('ko', { sceneCount: 1, shotCount: 1 }))).toEqual(rest(storyboardBriefing('ko', { sceneCount: 3, shotCount: 8 })))
  })
})
