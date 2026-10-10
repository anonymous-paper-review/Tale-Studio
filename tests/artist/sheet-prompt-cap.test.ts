// 인물 설명이 길어 프롬프트 상한을 넘어도 끝의 지시문은 그대로 두고 인물 설명을 뒤 문장부터 줄인다 (오너 2026-10-10)
import { describe, expect, it } from 'vitest'
import { buildCharacterMainPrompt, buildCharacterTurnaroundPrompt, buildCharacterViewPrompt } from '@/lib/artist/turnaround'

const LAST_SHEET_LINE = 'follow the declared art style exactly — never fall back to a generic anime, chibi or mascot look'
const S1 = 'Small-statured girl with very light (platinum-blonde) long, wavy pigtails tied with two large black ribbons, an X-shaped hair clip and two star-shaped hair clips on one side of her bangs, and gray eyes.'
const S2 = 'She wears a white blouse with long puffed sleeves, a black ribbon tie, a high-waisted pleated skirt with black suspenders, and black tights.'
const S3 = 'Usually she rests her chin on her hand and smiles playfully; in her default model pose, she looks the same but sits upright with both hands on her knees and a blank expression.'
// 10/10 운영 806e2cc2 의 소녀 카드 그대로.
const GIRL = {
  name: '소녀',
  role: 'protagonist',
  appearance: `${S1} ${S2} ${S3}`,
  costumes: ['풍성한 퍼프 소매의 흰색 블라우스', '검은색 네크라인 리본 타이', '검은색 멜빵이 달린 하이웨이스트 플리츠 스커트', '양갈래를 묶은 커다란 검은색 리본 2개', 'X자 및 별 모양의 헤어핀', '검은색 타이츠'],
  artStyle: '2d_anime',
  lineQuality: 'clean',
  shapeLanguage: 'round',
  texturePhilosophy: 'flat',
  characterProportion: '6:1',
  palette: ['#F7FAFC', '#2D3748', '#ED8936'],
}
const LONG = Array.from({ length: 14 }, (_, i) => `Detail sentence ${i + 1} describes another visible trait of the character in plain words.`).join(' ')

describe('인물 그림 프롬프트 상한', () => {
  it('806e2cc2 소녀처럼 설명이 긴 인물도 시트 지시문이 끝까지 들어간다', () => {
    // 왜: 10/10 운영 — 소녀는 1,500자에서 "(a dynamic action and"로 끊겨 디테일 · 팔레트 칸과 "흔한 애니로 돌아가지 말 것"이 빠졌다.
    const prompt = buildCharacterTurnaroundPrompt(GIRL)
    expect(prompt.endsWith(LAST_SHEET_LINE)).toBe(true)
    expect(prompt).toContain('DETAIL tiles')
    expect(prompt).toContain('PALETTE strip')
    expect(prompt).toContain(S3)
  })

  it('인물 설명이 길어 시트 프롬프트 상한을 넘으면 시트 지시문은 끝까지 남기고 인물 설명을 뒤 문장부터 줄인다', () => {
    // 왜: 상한은 지키되 잘리는 쪽은 지시문이 아니라 설명이어야 한다(10/10 오너). 의상 목록 · 그림체 값은 남긴다.
    const prompt = buildCharacterTurnaroundPrompt({ ...GIRL, appearance: LONG })
    expect(prompt.length).toBeLessThanOrEqual(2400)
    expect(prompt.endsWith(LAST_SHEET_LINE)).toBe(true)
    expect(prompt).toContain('Detail sentence 1 ')
    expect(prompt).not.toContain('Detail sentence 14 ')
    expect(prompt).toContain('wearing 풍성한 퍼프 소매의 흰색 블라우스')
    expect(prompt).toContain('palette: #F7FAFC, #2D3748, #ED8936')
  })

  it('설명이 상한 안이면 시트 프롬프트는 줄이지 않는다', () => {
    // 정상 경로 고정
    const prompt = buildCharacterTurnaroundPrompt({ ...GIRL, appearance: S1 })
    expect(prompt).toContain(S1)
    expect(prompt.endsWith(LAST_SHEET_LINE)).toBe(true)
  })

  it('대표 그림 · 방향 뷰 프롬프트도 상한을 넘으면 끝의 지시문은 남기고 인물 설명을 줄인다', () => {
    // 왜: 같은 상한 규칙 — 설명이 길면 "글자 · 로고 없음" 같은 끝 지시가 잘린다.
    const main = buildCharacterMainPrompt(GIRL)
    const view = buildCharacterViewPrompt(GIRL, 'back')
    expect(main.length).toBeLessThanOrEqual(900)
    expect(main.endsWith('no text, no logo')).toBe(true)
    expect(view.length).toBeLessThanOrEqual(900)
    expect(view.endsWith('no text, no logo')).toBe(true)
    expect(main).toContain(S1.slice(0, 60))
  })
})
