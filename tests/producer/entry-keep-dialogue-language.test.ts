// 그대로(Keep as is)로 시작하면 대사 언어는 원고 언어를 따른다 — 화면 언어로 옮기지 않는다 (오너 2026-11-10)
import { describe, expect, it } from 'vitest'
import { planEntryStart } from '@/lib/entry/start-plan'
import { emptyEntryDraft, type EntryDraft, type EntryFileMeta } from '@/lib/entry/draft'
import { manuscriptDialogueLanguage } from '@/lib/writer/pipeline/util/output-language'
import { SERIES_VERSION, type SeriesSnapshot } from '@/lib/series/snapshot'

// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const KO_PAGE = '오늘도 야근이야?\n\n응, 금방 끝나.\n\n띵\n\n배달 왔습니다!'
const EN_PAGE = 'Are you working late again?\n\nYes, almost done.\n\nDing\n\nDelivery!'
// 장면 머리 · 인물 이름은 영어, 대사는 한국어인 대본(검토 C 예시).
const SCRIPT_EN_HEADINGS = 'INT. CAFE - DAY\nMINHO: 커피 한 잔 주세요.\nBARISTA: 네.\nEXT. STREET - NIGHT\nMINHO: 춥다.'

function fileOf(text: string, name = 'page_1.png'): EntryFileMeta {
  return { name, ext: 'png', kind: 'image', size: 4096, chars: text.length, text, uploadedAt: '2026-11-10T00:00:00.000Z' }
}

function draftWith(over: Partial<EntryDraft> = {}): EntryDraft {
  return {
    ...emptyEntryDraft(),
    idea: '',
    file: fileOf(KO_PAGE),
    picks: { mood: 'comedy', runtime: null, level: 'keep', ratio: '9:16' },
    ...over,
  }
}

function seriesWith(over: Partial<SeriesSnapshot> = {}): SeriesSnapshot {
  return {
    version: SERIES_VERSION,
    prevProjectId: 'project-1',
    prevTitle: 'Night Shift',
    copiedAt: '2026-11-10T00:00:00.000Z',
    characters: [],
    locations: [],
    voices: [],
    styleId: null,
    format: 'vertical_9:16',
    dialogueLanguage: 'en',
    continuesLastScene: false,
    copyFailures: [],
    designTokens: null,
    world: null,
    ...over,
  }
}

const languageOf = (draft: EntryDraft, locale: 'ko' | 'en', series: SeriesSnapshot | null = null) => {
  const result = planEntryStart({ projectId: 'project-2', draft, locale, currentTitle: 'Untitled', series })
  if (!result.ok) throw new Error(result.code)
  // 저장되는 설정과 Producer 카드 초안(잠금 창 · 내보내기가 읽는다)이 같은 값이어야 한다.
  expect(result.producerDraft.settings.dialogueLanguage).toBe(result.settings.dialogueLanguage)
  return result.settings.dialogueLanguage
}

describe('그대로로 시작할 때의 대사 언어', () => {
  it('영어 화면에서 한국어 원고를 그대로로 시작하면 대사 언어는 원고 언어인 한국어다', () => {
    // 왜: 오너 2026-11-10 "원고 언어 그대로 둔다 — '그대로'의 약속대로". 만화 글자를 그대로로 넣은 프로젝트(C05 · C06)에서
    //   산문은 한국어 원문인데, 대사 언어가 묻지 않고 화면 언어(en)로 정해져 Storyboard 대사가 영어로 옮겨졌다.
    expect(languageOf(draftWith(), 'en')).toBe('ko')
  })

  it('한국어 화면에서 영어 원고를 그대로로 시작하면 대사 언어는 원고 언어인 영어다', () => {
    // 왜: 같은 약속의 반대쪽 — 화면 언어가 무엇이든 그대로는 원고에 적힌 말 그대로 말한다.
    expect(languageOf(draftWith({ file: fileOf(EN_PAGE) }), 'ko')).toBe('en')
  })

  it('원고 언어가 화면 언어와 같으면 대사 언어는 지금처럼 그 언어다', () => {
    // 왜: 정상 경로 고정 — 한국어 화면 · 한국어 원고, 영어 화면 · 영어 원고는 바뀌는 것이 없다.
    expect(languageOf(draftWith(), 'ko')).toBe('ko')
    expect(languageOf(draftWith({ file: fileOf(EN_PAGE) }), 'en')).toBe('en')
  })

  it('파일 없이 아이디어 칸에 적은 원고를 그대로로 시작해도 대사 언어는 원고 언어다', () => {
    // 왜: 그대로는 파일이 없으면 아이디어 칸의 글을 원문으로 쓴다 — 어디에 적었든 같은 약속이다.
    const idea = '민호: 오늘도 야근이야?\n팀장: 응, 금방 끝나. 이 보고서만 넘기면 돼.\n민호: 그럼 저 먼저 가 볼게요. 내일 아침에 커피 사 올게요.'
    expect(languageOf(draftWith({ idea, file: null }), 'en')).toBe('ko')
  })

  it('원고에 여러 언어가 섞여 있으면 음절로 세어 더 많은 쪽 언어를 대사 언어로 한다 — 로마자는 세 글자를 한 음절로 센다', () => {
    // 왜: 한글 · 한자 · 가나는 한 글자가 한 음절쯤인데 영어는 한 낱말이 네다섯 글자다 — 글자 수로 견주면 영어가 두 배쯤 무겁게 셈해져
    //   한국어 원고에 섞인 효과음 · 제목 몇 개로 대사 언어가 영어가 됐다(검토 C 2026-11-10). 반대로 영어 대사에 한국어 이름만 섞인 원고는 영어다(혼자 정한 것).
    expect(manuscriptDialogueLanguage('AI: 오늘도 야근이야? 민호: OK, 금방 끝나. Ding')).toBe('ko')
    expect(manuscriptDialogueLanguage('오늘도 야근이야?\nOFFICE\n응, 금방 끝나.\nDING\nBANG')).toBe('ko')
    expect(manuscriptDialogueLanguage('민호: Are you working late again? 팀장: Yes, almost done.')).toBe('en')
  })

  it('원고에 프로젝트 언어가 열에 셋 이상 있으면 효과음 · 간판 · 제목 · 장면 머리가 다른 언어여도 대사 언어는 프로젝트 언어다', () => {
    // 왜: 검토 C(2026-11-10) — 한국어 화면 · 한국어 원고에 영어 효과음 · 간판 · 제목 · 장면 머리가 섞이면 대사 언어가 en 이 됐다(예전엔 ko).
    //   대본 꼴이 아닌 원고는 Writer 가 대사를 새로 쓰니 한국어 만화 대사가 영어로 써진다 — 고치려던 증상이 반대쪽에서 생긴다(혼자 정한 것).
    expect(languageOf(draftWith({ file: fileOf('오늘도 야근이야?\nOFFICE\n응, 금방 끝나.\nDING\nBANG') }), 'ko')).toBe('ko')
    expect(languageOf(draftWith({ file: fileOf('NIGHT SHIFT\nEpisode 12\n또 야근?\n응.') }), 'ko')).toBe('ko')
    expect(languageOf(draftWith({ file: fileOf(SCRIPT_EN_HEADINGS, 'cafe.txt') }), 'ko')).toBe('ko')
  })

  it('대본 꼴 원고는 장면 머리 · 인물 이름을 빼고 대사 줄만 세어 원고 언어를 정한다', () => {
    // 왜: INT. CAFE - DAY · MINHO 처럼 영어로 적은 장면 머리 · 인물 이름은 인물이 말하는 글이 아니다 — 영어 화면에서도 대사가 한국어면 한국어다(혼자 정한 것).
    expect(languageOf(draftWith({ file: fileOf(SCRIPT_EN_HEADINGS, 'cafe.txt') }), 'en')).toBe('ko')
  })

  it('일본어 원고는 일본어로, 한자만 쓴 원고는 중국어로 대사 언어를 정한다', () => {
    // 왜: 대사 언어는 한국어 · 영어 · 일본어 · 중국어 넷 중 하나다 — 일본어는 한자와 가나를 같이 쓰고, 중국어는 가나를 쓰지 않는다(혼자 정한 것).
    expect(manuscriptDialogueLanguage('今日も残業なの？ うん、すぐ終わる。')).toBe('ja')
    expect(manuscriptDialogueLanguage('今天又加班吗？ 嗯，马上就好。')).toBe('zh')
  })

  it('원고에 글자가 없어 언어를 알 수 없으면 대사 언어는 지금처럼 프로젝트 언어다', () => {
    // 왜: 숫자 · 기호뿐인 글처럼 원고 언어를 알 수 없을 때는 지금 규칙(프로젝트 언어)으로 돌아간다(혼자 정한 것).
    expect(manuscriptDialogueLanguage('1 2 3 ... !!! ?!')).toBeNull()
    expect(languageOf(draftWith({ file: fileOf('1 2 3 ... !!! ?! 4 5 6 7 8 9 10') }), 'en')).toBe('en')
  })

  it('조금 다듬기 · 새로로 시작하면 대사 언어는 지금처럼 프로젝트 언어다', () => {
    // 왜: 오너 결정은 "그대로"에 대한 것이다 — 다듬기 · 새로는 대사를 새로 쓰므로 지금 규칙을 그대로 둔다(혼자 정한 것).
    expect(languageOf(draftWith({ picks: { mood: 'comedy', runtime: 'r60', level: 'polish', ratio: '9:16' } }), 'en')).toBe('en')
    expect(languageOf(draftWith({ picks: { mood: 'comedy', runtime: 'r60', level: 'grow', ratio: '9:16' } }), 'en')).toBe('en')
  })

  it('시리즈 다음 화는 그대로로 시작해도 대사 언어가 앞 화 대사 언어를 따른다', () => {
    // 왜: 앞 화 말투를 이어 쓰는 규칙(2026-10-26 오너 확정 "대사 언어는 앞 화를 따른다")을 이번 결정이 덮지 않게 한다.
    //   둘이 부딪히는 드문 경우라 지금 규칙을 지키고 리드에게 묻는다(혼자 정한 것). 앞 화 언어를 모르면 원고 언어다.
    expect(languageOf(draftWith(), 'en', seriesWith({ dialogueLanguage: 'en' }))).toBe('en')
    expect(languageOf(draftWith(), 'en', seriesWith({ dialogueLanguage: null }))).toBe('ko')
  })
})
