// 채팅 언어는 웹페이지 언어를 물려받고, 다른 언어로 여러 번 말하거나 바꿔 달라고 하면 프로젝트 언어가 바뀐다 (#chat-locale-follow v2, 2026-09-08 오너 결정)
//   왜: 종전 규칙은 한국어 쪽으로만·작가가 돌기 전에만 따라가서, 다른 언어로 계속 말해도 채팅이 옛 언어에 고착됐다.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  LOCALE_FOLLOW_STREAK,
  decideLocaleFollow,
  detectMessageLocale,
  explicitLocaleRequest,
  recentUserMessages,
} from '@/lib/chat-locale'
import { pickContentLocale } from '@/lib/i18n/content'

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: () => ({}) } }))
vi.mock('@/stores/project-store', () => ({ useProjectStore: { getState: () => ({ projectLocale: null, projectLocaleLocked: null }) } }))
vi.mock('@/stores/locale-store', () => ({ useLocaleStore: { getState: () => ({ locale: 'en' }) } }))

import { resolveChatLocale, type ChatLocaleDeps } from '@/lib/chat-format'

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')

function deps(state: { locale: 'ko' | 'en'; locked: boolean } | null) {
  const update = vi.fn(async () => true)
  const d: ChatLocaleDeps = {
    fetchState: vi.fn(async () => (state ? { ...state, writerRan: true } : null)),
    update,
  }
  return { d, update }
}
const history = (...userMessages: string[]) => userMessages.flatMap((m) => [{ role: 'user', content: m }, { role: 'model', content: '…' }])

describe('언어 읽기', () => {
  it('글자가 없는 말(숫자·이모지)은 언어로 세지 않고, 한글이 섞이면 한국어로 센다', () => {
    // 왜: "👍"·"2" 같은 말이 연속 발화를 끊거나 채우면 안 된다.
    expect(detectMessageLocale('👍')).toBeNull()
    expect(detectMessageLocale('2')).toBeNull()
    expect(detectMessageLocale('ok')).toBe('en')
    expect(detectMessageLocale('make it darker')).toBe('en')
    expect(detectMessageLocale('주인공을 더 dark 하게')).toBe('ko')
  })

  it('"영어로 말해줘"·"switch to English"·"한국어로 바꿔줘"는 바꿔 달라는 요청이고, 대사·자막 언어 얘기는 아니다', () => {
    // 왜: 대사 언어(프로듀서 설정)와 채팅 언어는 다른 것이다 — "영어 대사로 해줘"로 채팅이 영어가 되면 안 된다.
    expect(explicitLocaleRequest('영어로 말해줘')).toBe('en')
    expect(explicitLocaleRequest('앞으로는 영어로 대답해')).toBe('en')
    expect(explicitLocaleRequest('switch to English')).toBe('en')
    expect(explicitLocaleRequest('Can we continue in English from now on?')).toBe('en')
    expect(explicitLocaleRequest('Please reply in Korean')).toBe('ko')
    expect(explicitLocaleRequest('한국어로 바꿔줘')).toBe('ko')
    expect(explicitLocaleRequest('영어 대사로 해줘')).toBeNull()
    expect(explicitLocaleRequest('subtitles in English please')).toBeNull()
    expect(explicitLocaleRequest('I like English tea')).toBeNull()
  })
})

describe('바꿀지 결정', () => {
  it('채팅에서 다른 언어로 세 번 연속 말하면 프로젝트 언어가 그 언어로 바뀐다', () => {
    // 왜: 오너 결정 — "여러 번 말하면" = 3회 연속(LOCALE_FOLLOW_STREAK).
    expect(LOCALE_FOLLOW_STREAK).toBe(3)
    expect(decideLocaleFollow({ current: 'ko', recentUserMessages: ['make it darker', 'add a villain', 'shorter please'] })).toEqual({ locale: 'en', reason: 'repeated' })
    expect(decideLocaleFollow({ current: 'en', recentUserMessages: ['더 어둡게', '악당 추가', '짧게'] })).toEqual({ locale: 'ko', reason: 'repeated' })
  })

  it('두 번까지는 바뀌지 않고, 사이에 원래 언어가 끼면 처음부터 다시 센다', () => {
    // 왜: 잠깐 섞어 쓴 말로 언어가 바뀌면 안 된다.
    expect(decideLocaleFollow({ current: 'ko', recentUserMessages: ['make it darker', 'add a villain'] })).toBeNull()
    expect(decideLocaleFollow({ current: 'ko', recentUserMessages: ['make it darker', '짧게', 'add a villain'] })).toBeNull()
    expect(decideLocaleFollow({ current: 'ko', recentUserMessages: ['좋아', '좋아', '좋아'] })).toBeNull()
  })

  it('글자 없는 말은 세지도 끊지도 않고, 바꿔 달라는 말은 한 번에 바꾼다', () => {
    // 왜: 이모지 사이에 낀 영어 세 마디도 연속이고, 명시 요청은 횟수와 무관하다.
    expect(decideLocaleFollow({ current: 'ko', recentUserMessages: ['make it darker', '👍', 'add a villain', 'shorter'] })).toEqual({ locale: 'en', reason: 'repeated' })
    expect(decideLocaleFollow({ current: 'ko', recentUserMessages: ['영어로 말해줘'] })).toEqual({ locale: 'en', reason: 'explicit' })
    expect(decideLocaleFollow({ current: 'en', recentUserMessages: ['switch to English'] })).toBeNull()
  })

  it('대화 기록에서 사용자 말만 오래된 순서로 뽑고 마지막에 지금 말을 붙인다', () => {
    // 왜: 모델 답변이 섞여 세면 안 된다. 최근 3개(지금 말 포함)만 본다.
    expect(recentUserMessages(history('a1', 'a2', 'a3'), 'now')).toEqual(['a2', 'a3', 'now'])
    expect(recentUserMessages(undefined, 'now')).toEqual(['now'])
  })
})

describe('서버 규칙 — 상속과 전환', () => {
  it('잠기지 않은 프로젝트의 채팅 언어는 웹페이지(UI) 언어를 물려받는다(잠그지 않고 따라간다)', async () => {
    // 왜: 오너 결정 "웹페이지 언어 상속받아서 표시". 잠긴 프로젝트는 그대로다.
    const { d, update } = deps({ locale: 'en', locked: false })
    const r = await resolveChatLocale({ projectId: 'p', message: '안녕', history: [], uiLocale: 'ko' }, d)
    expect(r).toEqual({ locale: 'ko', switched: null, reason: 'inherit' })
    expect(update).toHaveBeenCalledWith('p', 'ko', { lock: false })
    const locked = deps({ locale: 'en', locked: true })
    const r2 = await resolveChatLocale({ projectId: 'p', message: '안녕', history: [], uiLocale: 'ko' }, locked.d)
    expect(r2).toEqual({ locale: 'en', switched: null, reason: null })
    expect(locked.update).not.toHaveBeenCalled()
  })

  it('다른 언어로 세 번 연속 말하거나 바꿔 달라고 하면 그 언어로 바꾸고 잠근다 — 작가가 이미 돌았어도', async () => {
    // 왜: 오너 결정 2026-09-08 — 종전 "작가가 돌면 안 바꿈"·"영어로는 안 바꿈" 가드 폐기.
    const { d, update } = deps({ locale: 'ko', locked: true })
    const r = await resolveChatLocale({ projectId: 'p', message: 'shorter please', history: history('make it darker', 'add a villain'), uiLocale: 'ko' }, d)
    expect(r).toEqual({ locale: 'en', switched: 'en', reason: 'repeated' })
    expect(update).toHaveBeenCalledWith('p', 'en')
    const e = deps({ locale: 'en', locked: true })
    const r2 = await resolveChatLocale({ projectId: 'p', message: '한국어로 바꿔줘', history: [], uiLocale: 'en' }, e.d)
    expect(r2).toEqual({ locale: 'ko', switched: 'ko', reason: 'explicit' })
  })

  it('프로젝트를 못 읽으면 언어를 바꾸지 않고 종전대로(미주입) 둔다', async () => {
    // 왜: 소유 확인 실패·조회 실패에서 언어를 뒤집으면 안 된다.
    const { d, update } = deps(null)
    expect(await resolveChatLocale({ projectId: 'p', message: 'hello there', history: [], uiLocale: 'en' }, d)).toEqual({ locale: null, switched: null, reason: null })
    expect(update).not.toHaveBeenCalled()
  })

  it('네 단계(Producer·Writer·Artist·Director) 채팅이 같은 규칙을 쓰고, 바뀐 언어를 응답에 싣는다', () => {
    // 왜: 한 단계에서만 바뀌면 다음 단계 채팅이 옛 언어로 돌아간다.
    for (const rel of ['produce', 'writer', 'artist', 'director']) {
      const src = read(`src/app/api/${rel}/chat/route.ts`)
      expect(src, rel).toMatch(/resolveChatLocale\(\{/)
      expect(src, rel).toMatch(/uiLocale/)
      expect(src, rel).toMatch(/localeSwitched,/)
      expect(src, rel).not.toMatch(/detectLocaleFromText\(message\)/)
    }
    const store = read('src/stores/global-chat-store.ts')
    expect(store).toMatch(/uiLocale: useLocaleStore\.getState\(\)\.locale/)
    expect(store).toMatch(/Chat language switched to \{lang\}/)
  })
})

describe('화면 표시 언어', () => {
  it('잠기지 않은 프로젝트는 웹페이지 언어로, 잠긴 프로젝트는 프로젝트 언어로 표시한다', () => {
    // 왜: 오너 결정 "웹페이지 언어 상속받아서 표시하되" — 잠김을 모르면 종전대로 프로젝트 언어.
    expect(pickContentLocale({ projectLocale: 'ko', locked: false, uiLocale: 'en' })).toBe('en')
    expect(pickContentLocale({ projectLocale: 'ko', locked: true, uiLocale: 'en' })).toBe('ko')
    expect(pickContentLocale({ projectLocale: 'ko', locked: null, uiLocale: 'en' })).toBe('ko')
    expect(pickContentLocale({ projectLocale: null, locked: null, uiLocale: 'en' })).toBe('en')
  })
})
