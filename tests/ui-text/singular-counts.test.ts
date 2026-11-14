// 영어 첫 안내(Artist 인물 · 배경, Storyboard 씬 · 샷)는 수가 1이면 단수로 말하고, 한국어는 그대로다
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { artistBriefText } from '@/lib/artist/brief'
import { gapNudgeText } from '@/lib/completeness'
import { translate } from '@/lib/i18n/translate'
import { storyboardBriefing } from '@/lib/writer/board-summary'
import { INITIAL_BOARD_LOCK, advanceBoardLock, storyboardBusyView } from '@/lib/writer/board-busy'

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

describe('Director 채워 두면 좋은 것 안내의 항목 수', () => {
  it('영어 안내는 항목이 1개면 "There is 1 thing worth filling in"으로 단수로 말하고, 둘 이상이면 지금처럼 복수로 말한다', () => {
    // 왜: 항목이 하나뿐일 때 "There are 1 things worth filling in"으로 나왔다.
    expect(gapNudgeText('en', 1, '• Shot 1: no storyboard yet')).toBe('There is 1 thing worth filling in:\n• Shot 1: no storyboard yet')
    expect(gapNudgeText('en', 7, '• Shot 1: no storyboard yet')).toBe('There are 7 things worth filling in:\n• Shot 1: no storyboard yet')
  })

  it('한국어 안내는 항목 수가 1이어도 그대로다', () => {
    // 왜: 한국어는 단수 · 복수가 없다 — 한 문장 꼴이어야 한다.
    expect(gapNudgeText('ko', 1, '• 샷 1: 스토리보드 미생성')).toBe('채워두면 좋을 항목이 1건 있어요:\n• 샷 1: 스토리보드 미생성')
    expect(gapNudgeText('ko', 7, '• 샷 1: 스토리보드 미생성')).toBe('채워두면 좋을 항목이 7건 있어요:\n• 샷 1: 스토리보드 미생성')
  })

  it('Director 화면은 채워 두면 좋은 것 안내를 항목 수에 맞는 문장으로 짓는다', () => {
    // 왜: 문장을 고르는 함수가 있어도 화면이 옛 한 줄 키를 그대로 부르면 단수 고침이 화면에 닿지 않는다.
    expect(readFileSync('src/app/studio/director/page.tsx', 'utf8')).toMatch(/gapNudgeText\(chatLocale, gaps\.length, summarizeGaps\(gaps, 3, chatLocale\)\)/)
  })
})

describe('Writer 진행 화면의 씬 수', () => {
  // 씬 · 샷을 나누는 중(decoupage)인 보드의 잠금 표시 — 단계 목록의 두 번째 줄이 "Splitting into N scenes"다.
  const splitting = { runActive: true, reloading: false, hasShots: false, generating: 0, failed: 0, pumpActive: false, autoDrawPending: false }
  const splitLabel = (locale: 'en' | 'ko', sceneCount: number) =>
    storyboardBusyView(
      {
        status: { started: true, engine: 'v1', pipeline_completed: false, pipeline_failed: false, current_status: 'running', current_stage: 'decoupage' },
        facts: splitting,
        lock: advanceBoardLock(INITIAL_BOARD_LOCK, splitting),
        rough: { total: 0, completed: 0, generating: 0, waiting: 0, failed: 0 },
        sceneCount,
      },
      locale,
    ).steps?.[1]?.label

  it('영어 진행 화면은 씬이 1개면 "Splitting into 1 scene"으로 단수로 말하고, 둘 이상이면 지금처럼 복수로 말한다', () => {
    // 왜: 씬이 하나뿐일 때 "Splitting into 1 scenes"로 나왔다.
    expect(splitLabel('en', 1)).toBe('Splitting into 1 scene')
    expect(splitLabel('en', 3)).toBe('Splitting into 3 scenes')
    expect(splitLabel('ko', 1)).toBe('씬 1개로 나누기')
    expect(splitLabel('ko', 3)).toBe('씬 3개로 나누기')
  })
})

describe('Storyboard 잠금 창의 못 그린 러프 수', () => {
  // 러프를 한 번 그리다 실패가 남은 채 끝난 보드의 잠금 표시 — 제목이 "N roughs could not be drawn"이다.
  const failedTitle = (locale: 'en' | 'ko', failed: number) => {
    const splitting = { runActive: true, reloading: false, hasShots: false, generating: 0, failed: 0, pumpActive: false, autoDrawPending: false }
    const drawing = { runActive: false, reloading: false, hasShots: true, generating: 8, failed: 0, pumpActive: true, autoDrawPending: false }
    const ended = { runActive: false, reloading: false, hasShots: true, generating: 0, failed, pumpActive: false, autoDrawPending: false }
    const lock = [splitting, drawing, ended].reduce(advanceBoardLock, INITIAL_BOARD_LOCK)
    return storyboardBusyView(
      {
        status: { started: true, engine: 'v1', pipeline_completed: true, pipeline_failed: false, current_status: 'completed', current_stage: 'persistShots' },
        facts: ended,
        lock,
        rough: { total: 8, completed: 8 - failed, generating: 0, waiting: 0, failed },
        sceneCount: 3,
      },
      locale,
    ).title
  }

  it('영어 잠금 창은 못 그린 러프가 1개면 "1 rough could not be drawn"으로 단수로 말하고, 둘 이상이면 지금처럼 복수로 말한다', () => {
    // 왜: 못 그린 러프가 하나뿐일 때 "1 roughs could not be drawn"으로 나왔다.
    expect(failedTitle('en', 1)).toBe('1 rough could not be drawn')
    expect(failedTitle('en', 2)).toBe('2 roughs could not be drawn')
    expect(failedTitle('ko', 1)).toBe('러프 1컷을 그리지 못했어요')
    expect(failedTitle('ko', 2)).toBe('러프 2컷을 그리지 못했어요')
  })
})
