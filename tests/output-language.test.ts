import { describe, it, expect } from 'vitest'
import { outputLanguageClause, speechRateGuide } from '@/lib/writer/pipeline/util/output-language'
import { resolveOutputLocale } from '@/lib/locale'

// #i18n-s5 출력 언어 강제 — 절 주입·발화 속도·start 1.6 결정 로직의 계약 (#20 유닛).

describe('outputLanguageClause', () => {
  it('en: 영어 강제 절 — 생성기 필드 예외 조항 포함', () => {
    const c = outputLanguageClause('en')
    expect(c).toContain('[출력 언어 — 강제]')
    expect(c).toContain('영어(English)')
    expect(c).toContain('그 규칙이 우선한다')
  })
  it('ko: 한국어 강제 절', () => {
    expect(outputLanguageClause('ko')).toContain('한국어로 작성한다')
  })
  it('미지정(레거시): 빈 문자열 — 종전 프롬프트 바이트 불변', () => {
    expect(outputLanguageClause(undefined)).toBe('')
  })
})

describe('speechRateGuide', () => {
  it('en 은 wpm 기준, ko/미지정은 음절 기준(종전 유지)', () => {
    expect(speechRateGuide('en')).toContain('2~3단어')
    expect(speechRateGuide('ko')).toContain('4~6음절')
    expect(speechRateGuide(undefined)).toContain('4~6음절')
  })
})

describe('resolveOutputLocale (writer/start 1.6)', () => {
  it('잠긴 프로젝트: 잠긴 값이 출력 언어, 재잠금 없음', () => {
    expect(resolveOutputLocale({ locale: 'en', locale_locked: true }, '한국어 스토리')).toEqual({
      outputLocale: 'en',
      lockTo: null,
    })
    expect(resolveOutputLocale({ locale: 'ko', locale_locked: true }, 'english story')).toEqual({
      outputLocale: 'ko',
      lockTo: null,
    })
  })
  it('레거시(unlocked): 스토리 감지값을 쓰고 그 값으로 잠근다 — 종전 산출과 동일', () => {
    expect(resolveOutputLocale({ locale: 'en', locale_locked: false }, '주인공이 달린다')).toEqual({
      outputLocale: 'ko',
      lockTo: 'ko',
    })
    expect(resolveOutputLocale(null, 'the hero runs')).toEqual({ outputLocale: 'en', lockTo: 'en' })
  })
  it('잠겼는데 locale 값이 미상: 미주입(undefined) — 절 없이 종전 관례', () => {
    expect(resolveOutputLocale({ locale: 'jp', locale_locked: true }, 's').outputLocale).toBeUndefined()
  })
})

// #dialogue-language — 대사 언어는 출력 언어와 독립된 축 (프로듀서 설정이 line·narration 지배)
import {
  dialogueLanguageClause,
  parseDialogueLanguage,
  speechRateGuideForDialogue,
} from '@/lib/writer/pipeline/util/output-language'

describe('dialogueLanguage — 발화 언어 계약', () => {
  it('파싱: 4개 값만 통과, 그 외·미지정은 undefined(레거시 = 출력 언어 추종)', () => {
    expect(parseDialogueLanguage('ko')).toBe('ko')
    expect(parseDialogueLanguage('ja')).toBe('ja')
    expect(parseDialogueLanguage('fr')).toBeUndefined()
    expect(parseDialogueLanguage(undefined)).toBeUndefined()
  })
  it('절: 설정 시에만 발화 필드 덮어쓰기 문구, 미지정은 빈 문자열(무주입)', () => {
    expect(dialogueLanguageClause(undefined)).toBe('')
    const ko = dialogueLanguageClause('ko')
    expect(ko).toContain('한국어')
    expect(ko).toContain('dialogue[].line')
    expect(ko).toContain('출력 언어 규칙과 무관하게')
  })
  it('발화 속도: 대사 언어 우선, 미지정이면 출력 언어 기준(종전)', () => {
    expect(speechRateGuideForDialogue('ko', 'en')).toContain('음절')
    expect(speechRateGuideForDialogue('ja', 'en')).toContain('모라')
    expect(speechRateGuideForDialogue(undefined, 'en')).toContain('wpm')
    expect(speechRateGuideForDialogue(undefined, undefined)).toContain('음절')
  })
})
