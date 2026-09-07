// 선택한 언어로 답변과 대사를 만들고, 언어가 정해지지 않으면 기존 방식으로 처리한다 (#i18n-s5 #20)
import { describe, it, expect } from 'vitest'
import { outputLanguageClause, speechRateGuide } from '@/lib/writer/pipeline/util/output-language'
import { resolveOutputLocale } from '@/lib/locale'

// #i18n-s5 출력 언어 강제 — 절 주입·발화 속도·start 1.6 결정 로직의 계약 (#20 유닛).

describe('outputLanguageClause', () => {
  it('영어를 선택하면 영어로 답하고 필요한 예외 안내를 함께 넣는다', () => {
    const c = outputLanguageClause('en')
    expect(c).toContain('[출력 언어 — 강제]')
    expect(c).toContain('영어(English)')
    expect(c).toContain('그 규칙이 우선한다')
  })
  it('영어 문장은 대문자로 시작하게 한다 (오너 지시 2026-08-31)', () => {
    const c = outputLanguageClause('en')
    expect(c).toContain('대문자로 시작')
  })
  it('한국어를 선택하면 한국어로 답하게 한다', () => {
    expect(outputLanguageClause('ko')).toContain('한국어로 작성한다')
  })
  it('언어를 정하지 않으면 별도 안내 없이 예전 답변 방식을 유지한다', () => {
    expect(outputLanguageClause(undefined)).toBe('')
  })
})

describe('speechRateGuide', () => {
  it('영어는 단어 수로, 한국어와 언어가 없을 때는 음절 수로 말하기 속도를 정한다', () => {
    expect(speechRateGuide('en')).toContain('2~3단어')
    expect(speechRateGuide('ko')).toContain('4~6음절')
    expect(speechRateGuide(undefined)).toContain('4~6음절')
  })
})

describe('resolveOutputLocale (Writer 단계의 답변 언어)', () => {
  it('언어를 고정한 프로젝트는 그 언어로 답하고 다시 묻지 않는다', () => {
    expect(resolveOutputLocale({ locale: 'en', locale_locked: true }, '한국어 스토리')).toEqual({
      outputLocale: 'en',
      lockTo: null,
    })
    expect(resolveOutputLocale({ locale: 'ko', locale_locked: true }, 'english story')).toEqual({
      outputLocale: 'ko',
      lockTo: null,
    })
  })
  it('언어를 아직 정하지 않았으면 이야기에서 알아낸 언어로 답하고 그 언어를 고정한다', () => {
    expect(resolveOutputLocale({ locale: 'en', locale_locked: false }, '주인공이 달린다')).toEqual({
      outputLocale: 'ko',
      lockTo: 'ko',
    })
    expect(resolveOutputLocale(null, 'the hero runs')).toEqual({ outputLocale: 'en', lockTo: 'en' })
  })
  it('고정한 언어를 알 수 없으면 별도 언어를 정하지 않는다', () => {
    expect(resolveOutputLocale({ locale: 'jp', locale_locked: true }, 's').outputLocale).toBeUndefined()
  })
})

// #dialogue-language — 대사 언어는 출력 언어와 독립된 축 (프로듀서 설정이 line·narration 지배)
import {
  dialogueLanguageClause,
  parseDialogueLanguage,
  speechRateGuideForDialogue,
} from '@/lib/writer/pipeline/util/output-language'

describe('대사 언어 규칙', () => {
  it('지원하는 네 가지 언어만 대사 언어로 정하고 나머지는 출력 언어를 따른다', () => {
    expect(parseDialogueLanguage('ko')).toBe('ko')
    expect(parseDialogueLanguage('ja')).toBe('ja')
    expect(parseDialogueLanguage('fr')).toBeUndefined()
    expect(parseDialogueLanguage(undefined)).toBeUndefined()
  })
  it('대사 언어를 정하면 답변 언어와 관계없이 그 언어로 말하라고 안내한다', () => {
    expect(dialogueLanguageClause(undefined)).toBe('')
    const ko = dialogueLanguageClause('ko')
    expect(ko).toContain('한국어')
    expect(ko).toContain('dialogue[].line')
    expect(ko).toContain('출력 언어 규칙과 무관하게')
  })
  it('대사 언어를 정하면 그 기준을 우선하고 없으면 답변 언어를 따른다', () => {
    expect(speechRateGuideForDialogue('ko', 'en')).toContain('음절')
    expect(speechRateGuideForDialogue('ja', 'en')).toContain('모라')
    expect(speechRateGuideForDialogue(undefined, 'en')).toContain('wpm')
    expect(speechRateGuideForDialogue(undefined, undefined)).toContain('음절')
  })
})
