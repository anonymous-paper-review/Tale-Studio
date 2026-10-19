// Producer 시작 화면의 AI 추천: 모델 답을 검사해 쓰고, 모델이 실패하면 규칙으로 장르·분위기 · 길이 · 바꿈 정도를 고른다 (리뉴얼 1차 2026-10-19)
import { describe, expect, it } from 'vitest'
import { buildRecommendPrompt, cleanOcrText, resolveRecommendation } from '@/lib/entry/recommend'
import type { EntryFileMeta } from '@/lib/entry/draft'

// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const SCREENPLAY = [
  'S#1. 회사 복도 - 낮',
  '민호가 자판기 버튼을 누른다. 아무것도 나오지 않는다.',
  '민호: 또 안 나와?',
  '팀장: 뭐 해?',
  '',
  'S#2. 회사 복도 - 낮',
  '캔이 우르르 쏟아진다.',
  '팀장: 고마워.',
  '민호: 그거 제 건데요.',
].join('\n')

const fileOf = (over: Partial<EntryFileMeta>): EntryFileMeta => ({
  name: '자판기_촬영대본.txt',
  ext: 'txt',
  kind: 'text',
  size: 1200,
  chars: 0,
  uploadedAt: '2026-10-19T00:00:00.000Z',
  ...over,
})
const scriptFile = fileOf({ text: SCREENPLAY, chars: SCREENPLAY.length })
const SHORT_IDEA = '회사 복도 자판기가 고장 나서 캔이 우르르 쏟아진다'
const LONG_IDEA = '두 사람이 매일 같은 버스를 타고 출근한다. 서로 말을 걸지 못한 채 계절이 바뀌고, 어느 날 한 사람이 버스에 타지 않는다. 남은 사람은 정류장에서 기다린다.'

describe('모델 답 검사', () => {
  it('모델이 정해진 값으로 답하면 장르·분위기 · 길이 · 바꿈 정도 · 이유 · 제목을 그대로 쓴다', () => {
    // 왜: 정상 경로 고정. 모델이 글을 읽고 고른 값과 이유가 화면에 그대로 보인다.
    const rec = resolveRecommendation(
      { kind: '1-3', mood: 'comedy', moodWhy: '엉뚱한 사건이라 코미디로 읽었어요', runtime: 'r60', runtimeWhy: '짧은 아이디어라 짧게 잡았어요', level: 'grow', title: '자판기의 반란' },
      { idea: SHORT_IDEA, file: null, locale: 'ko' },
    )
    expect(rec).toEqual({
      kind: '1-3', mood: 'comedy', moodWhy: '엉뚱한 사건이라 코미디로 읽었어요', runtime: 'r60', runtimeWhy: '짧은 아이디어라 짧게 잡았어요', level: 'grow', title: '자판기의 반란', source: 'llm',
    })
  })

  it('모델 답이 정해진 값 밖이거나 비어 있으면 규칙으로 고른 추천을 쓴다', () => {
    // 왜: 모델이 목록에 없는 장르(western 등)를 지어내거나 실패해도 설정 화면은 추천을 채워야 한다.
    const bad = resolveRecommendation({ kind: '1-3', mood: 'western', moodWhy: 'x', runtime: 'r60', runtimeWhy: 'y', level: 'grow', title: 't' }, { idea: SHORT_IDEA, file: null, locale: 'ko' })
    expect(bad.source).toBe('rules')
    expect(resolveRecommendation(null, { idea: SHORT_IDEA, file: null, locale: 'ko' }).source).toBe('rules')
    expect(resolveRecommendation('not json', { idea: SHORT_IDEA, file: null, locale: 'ko' }).source).toBe('rules')
  })

  it('이미지만 올린 자료는 모델이 다른 종류라고 해도 글이 담긴 이미지로 둔다', () => {
    // 왜: 이번 버전은 이미지를 글이 담긴 이미지(사진 찍은 대본 · 메모)로만 읽는다. 대본 질문 방식도 그에 맞춘다.
    const photo = fileOf({ name: '대본_사진.jpg', ext: 'jpg', kind: 'image', text: '민호: 또 안 나와?', chars: 10, storagePath: 'w/p/uploads/x/original.jpg' })
    const rec = resolveRecommendation({ kind: '1-1', mood: 'comedy', moodWhy: 'a', runtime: 'r60', runtimeWhy: 'b', level: 'polish', title: '자판기' }, { idea: '', file: photo, locale: 'ko' })
    expect(rec.kind).toBe('img')
  })

  it('지킬 원문이 없는데 모델이 그대로를 추천하면 가장 가까운 다듬기로 바꾼다', () => {
    // 왜: "그대로"는 지킬 원문이 있을 때만 고를 수 있다. 고를 수 없는 값을 추천으로 미리 골라 두지 않는다.
    const rec = resolveRecommendation({ kind: '1-3', mood: 'drama', moodWhy: 'a', runtime: 'r60', runtimeWhy: 'b', level: 'keep', title: '버스' }, { idea: SHORT_IDEA, file: null, locale: 'ko' })
    expect(rec.level).toBe('polish')
  })
})

describe('규칙 추천 (모델이 실패했을 때)', () => {
  it('글에 "30초"처럼 길이가 적혀 있으면 그 길이로 정하고, 장르 이름이 적혀 있으면 그 장르로 정하며 그 말을 이유로 알려준다', () => {
    // 왜: 사용자가 직접 적은 값이 가장 확실하다(프로토타입 recommend).
    const rec = resolveRecommendation(null, { idea: '30초짜리 회사 복도 자판기 코미디, 민호는 하나도 못 먹는다', file: null, locale: 'ko' })
    expect(rec).toMatchObject({ runtime: 'r60', runtimeWhy: '글에 "30초"라고 적혀 있어요', mood: 'comedy', moodWhy: '글에 "코미디"라고 적혀 있어요' })
  })

  it('장르 이름이 없으면 이야기 낱말로 고르고, 그것도 없으면 드라마로 고른 이유를 알려준다', () => {
    // 왜: 추천에는 언제나 이유 한 줄이 붙는다. 근거가 없으면 없다고 말한다.
    expect(resolveRecommendation(null, { idea: SHORT_IDEA, file: null, locale: 'ko' })).toMatchObject({ mood: 'comedy', moodWhy: '엉뚱한 사건이라 코미디로 읽었어요' })
    expect(resolveRecommendation(null, { idea: '야근하던 직원의 모니터에 회사 CCTV 화면이 뜬다', file: null, locale: 'ko' })).toMatchObject({ mood: 'horror' })
    expect(resolveRecommendation(null, { idea: LONG_IDEA, file: null, locale: 'ko' })).toMatchObject({ mood: 'drama', moodWhy: '뚜렷한 장르가 없어 드라마로 골랐어요' })
  })

  it('60자 넘는 아이디어는 다듬기, 짧은 아이디어는 새롭게 키우기로 추천하고 길이는 글 분량으로 짐작한다', () => {
    // 왜: 긴 줄거리는 지킬 재료가 많고 짧은 아이디어는 AI가 살을 붙여야 한다(프로토타입 recLevel).
    expect(resolveRecommendation(null, { idea: LONG_IDEA, file: null, locale: 'ko' })).toMatchObject({ level: 'polish', runtime: 'r300', runtimeWhy: '줄거리 분량으로 짐작했어요' })
    expect(resolveRecommendation(null, { idea: SHORT_IDEA, file: null, locale: 'ko' })).toMatchObject({ level: 'grow', runtime: 'r60', runtimeWhy: '짧은 아이디어라 짧게 잡았어요' })
  })

  it('대본 파일이면 바꿈 정도를 그대로(바로 영상화)로, 글이 담긴 이미지면 다듬기로, 아이디어 노트면 새롭게 키우기로 추천하고 길이는 대본 분량으로 짐작한다', () => {
    // 왜: 대본은 이미 쓴 글을 지키는 것이 기본이다. 사진 찍은 글은 옮기며 다듬고, 메모는 키워야 한다.
    const script = resolveRecommendation(null, { idea: '', file: scriptFile, locale: 'ko' })
    expect(script).toMatchObject({ kind: '1-1', level: 'keep', runtimeWhy: '대본 분량으로 짐작했어요' })
    const photo = fileOf({ name: '메모.png', ext: 'png', kind: 'image', text: '자판기 이야기 메모', chars: 9, storagePath: 'w/p/u/original.png' })
    expect(resolveRecommendation(null, { idea: '', file: photo, locale: 'ko' })).toMatchObject({ kind: 'img', level: 'polish' })
    const notes = fileOf({ name: '아이디어_메모.txt', text: '자판기가 고장 난다. 캔이 쏟아진다. 민호만 못 먹는다.', chars: 30 })
    expect(resolveRecommendation(null, { idea: '', file: notes, locale: 'ko' })).toMatchObject({ kind: '1-3', level: 'grow' })
  })

  it('AI가 제목을 붙이지 못하면 아이디어 첫 마디나 파일 이름으로 임시 제목을 붙인다', () => {
    // 왜: 제목 없음으로 남은 프로젝트는 목록에서 구분할 수 없다.
    expect(resolveRecommendation(null, { idea: '자판기의 반란. 회사 복도 자판기가 고장 나서 캔이 쏟아진다', file: null, locale: 'ko' }).title).toBe('자판기의 반란')
    expect(resolveRecommendation(null, { idea: '', file: scriptFile, locale: 'ko' }).title).toBe('자판기 촬영대본')
  })

  it('추천 이유는 프로젝트 언어로 쓴다', () => {
    // 왜: 영어 사이트로 시작한 프로젝트에 한국어 이유가 나오면 읽을 수 없다.
    const rec = resolveRecommendation(null, { idea: 'A 30 second comedy about a vending machine that breaks in the office hallway', file: null, locale: 'en' })
    expect(rec).toMatchObject({ mood: 'comedy', moodWhy: 'Your text says "comedy"', runtime: 'r60', runtimeWhy: 'Your text says "30 second"' })
  })
})

describe('AI에게 보내는 글과 이미지 글자 읽기', () => {
  it('추천을 묻는 글에는 아이디어 · 파일 글 · 파일 길이 · 프로젝트 언어 · 고를 수 있는 값을 싣는다', () => {
    // 왜: 모델이 목록 밖 값을 지어내지 않게 고를 값을 못박고, 이유와 제목을 프로젝트 언어로 쓰게 한다.
    const { system, prompt } = buildRecommendPrompt({ idea: SHORT_IDEA, file: scriptFile, locale: 'ko' })
    expect(system).toMatch(/JSON/)
    expect(prompt).toContain(SHORT_IDEA)
    expect(prompt).toContain('S#1. 회사 복도 - 낮')
    expect(prompt).toContain(String(SCREENPLAY.length))
    expect(prompt).toContain('Korean')
    for (const key of ['comedy', 'slice_of_life', 'r15', 'r1200', 'keep', 'polish', 'grow', '1-1', '1-2', '1-3']) expect(prompt).toContain(key)
  })

  it('이미지 글자 읽기가 글이 없다고 답하거나 빈 답이면 글 없음으로 본다', () => {
    // 왜: 글이 없는 그림(풍경 사진 등)은 "다른 파일 올리기 / 파일 빼고 진행"을 고르게 해야 한다.
    expect(cleanOcrText('NO_TEXT')).toBe('')
    expect(cleanOcrText('   ')).toBe('')
    expect(cleanOcrText('```\n민호: 또 안 나와?\n```')).toBe('민호: 또 안 나와?')
    expect(cleanOcrText('  민호: 또 안 나와?\r\n팀장: 고마워.  ')).toBe('민호: 또 안 나와?\n팀장: 고마워.')
  })
})
