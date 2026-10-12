// Grok Imagine 으로 그릴 때 화면 비율과 글 길이를 모델 약속에 맞춘다 (오너 2026-10-12 "고친다" — 시험 중 찾은 고장 2건)
import { describe, it, expect } from 'vitest'
import { buildFalImageInput, GROK_PROMPT_MAX_CHARS } from '@/lib/writer/llm/fal'
import {
  FACET_ADULT_PROPORTIONS,
  FACET_EXPRESSION_PRIORITY,
  applyStyleAnchor,
  parseStyleAnchorFacets,
  type ResolvedStyleAnchor,
} from '@/lib/style-anchor'

const GROK = 'xai/grok-imagine-image'
const GROK_EDIT = 'xai/grok-imagine-image/edit'

describe('Grok 화면 비율', () => {
  it('Grok 으로 고쳐 그릴 때 첫 참고가 그림체 그림이면 요청한 화면 비율을 보낸다 — 그림체 그림이 정사각형이어도 배경은 16:9 로 나온다', () => {
    // 왜: 그림체 그림(정사각형)이 첫 참고라 비율을 안 보내면 Grok 이 입력 비율을 따라 정사각형 배경을 냈다(2026-10-12 시험 4/4).
    const anchored = applyStyleAnchor(
      { key: 'real', imageUrl: 'anchor.png' },
      { prompt: 'An empty office.', aspect_ratio: '16:9' },
      'single',
    )
    const input = buildFalImageInput(anchored, GROK_EDIT)
    expect(input.image_urls).toEqual(['anchor.png'])
    expect(input.aspect_ratio).toBe('16:9')
  })

  it('그림체 그림이 첫 참고인 인물 시트도 Grok 에 16:9 를 보낸다', () => {
    // 왜: 시트 양식(16:9)이 둘째 참고라 첫 참고(그림체 그림)의 비율을 따르면 시트 칸이 찌그러진다.
    const anchored = applyStyleAnchor(
      { key: 'real', imageUrl: 'anchor.png' },
      { prompt: 'Fill in this character reference-sheet template.', reference_image_urls: ['template.png'] },
      'turnaround',
      { pinAspectRatio: '16:9', people: true },
    )
    expect(buildFalImageInput(anchored, GROK_EDIT).aspect_ratio).toBe('16:9')
  })

  it('화면 비율이 없으면 Grok 에 비율을 보내지 않아 입력 그림의 비율을 지킨다', () => {
    // 왜: 스토리보드 화살표 지우기는 입력 프레임 비율을 그대로 지켜야 한다(정상 경로 고정).
    expect(buildFalImageInput({ prompt: 'p', reference_image_urls: ['frame.png'] }, GROK_EDIT)).toEqual({ prompt: 'p', image_urls: ['frame.png'] })
    expect(buildFalImageInput({ prompt: 'p', aspect_ratio: 'auto', reference_image_urls: ['frame.png'] }, GROK_EDIT)).toEqual({ prompt: 'p', image_urls: ['frame.png'] })
  })

  it('프로젝트 화면 형식 이름과 Grok 이 받지 않는 비율은 Grok 이 받는 가장 가까운 비율로 바꿔 보낸다', () => {
    // 왜: Grok 은 정해진 비율 목록만 받는다(그 밖의 값은 거절) — 시네마 2.39:1 프로젝트도 그릴 수 있어야 한다.
    const ratio = (ar: string) => buildFalImageInput({ prompt: 'p', aspect_ratio: ar }, GROK).aspect_ratio
    expect(ratio('horizontal_16:9')).toBe('16:9')
    expect(ratio('vertical_9:16')).toBe('9:16')
    expect(ratio('square_1:1')).toBe('1:1')
    expect(ratio('cinema_2.39:1')).toBe('20:9')
    expect(ratio('5:4')).toBe('4:3')
  })
})

describe('Grok 글 길이', () => {
  const longFigure = Array.from({ length: 60 }, (_, i) => `Figure sentence number ${i + 1} describes one more realistic detail of the body.`).join(' ')
  const anchor: ResolvedStyleAnchor = {
    key: 'real',
    imageUrl: 'https://anchor/real.png',
    styleClause: 'Carry the style reference scene language.',
    facets: parseStyleAnchorFacets({
      probe_anchors: 'No outlines; photographic soft light.',
      figure: `Realistic figures throughout, about 7.9 heads tall. ${longFigure}`,
      priority: 'Priority order: photographic shading → soft light.',
      negative: 'Avoid anime, cel shading, logos.',
    }),
  }
  const body = `Fill in this character reference-sheet template with Maya. ${'A long appearance description sentence. '.repeat(40)}`
  const sheet = applyStyleAnchor(anchor, { prompt: body, reference_image_urls: ['template.png'] }, 'turnaround', { pinAspectRatio: '16:9', people: true })

  it('Grok 에 보내는 글이 8,000자를 넘으면 그림체 인물 규칙을 뒤 문장부터 줄여 8,000자 안에 맞춘다', () => {
    // 왜: 실사 그림체 인물 시트 요청은 9,000자가 넘어 Grok 이 통째로 거절했다(2026-10-12 시험 6/6) — 고른 모델로 그림은 나와야 한다.
    const padded = `${sheet.prompt}\n${'Extra scene detail. '.repeat(Math.ceil((GROK_PROMPT_MAX_CHARS - sheet.prompt.length + 500) / 20))}`
    expect(padded.length).toBeGreaterThan(GROK_PROMPT_MAX_CHARS)
    const sent = String(buildFalImageInput({ prompt: padded, reference_image_urls: sheet.reference_image_urls }, GROK_EDIT).prompt)
    expect(sent.length).toBeLessThanOrEqual(GROK_PROMPT_MAX_CHARS)
    const figureLine = sent.split('\n').find((line) => line.startsWith('Figure rules: '))
    expect(figureLine).toBeDefined()
    expect(figureLine!.length).toBeLessThan(padded.split('\n').find((line) => line.startsWith('Figure rules: '))!.length)
  })

  it('인물 규칙을 줄여도 그 첫 문장과 다른 줄(역할 문장 · 그림체 핵심 · 본문 · 피할 것)은 그대로 둔다', () => {
    // 왜: 첫 문장이 "실사 인물"이라는 핵심이고, 본문은 그 인물의 설명이다 — 줄여도 되는 것은 인물 규칙의 뒤쪽 세부뿐이다.
    const padded = `${sheet.prompt}\n${'Extra scene detail. '.repeat(Math.ceil((GROK_PROMPT_MAX_CHARS - sheet.prompt.length + 500) / 20))}`
    const sent = String(buildFalImageInput({ prompt: padded, reference_image_urls: sheet.reference_image_urls }, GROK_EDIT).prompt)
    const before = padded.split('\n')
    const after = sent.split('\n')
    expect(after.length).toBe(before.length)
    for (let i = 0; i < before.length; i++) {
      if (before[i].startsWith('Figure rules: ')) expect(after[i].startsWith('Figure rules: Realistic figures throughout, about 7.9 heads tall.')).toBe(true)
      else expect(after[i]).toBe(before[i])
    }
  })

  it('인물 규칙을 줄여도 끝에 붙는 "아이 · 노인은 제 비례" 문장과 "표정 우선" 문장은 남긴다', () => {
    // 왜: 어른 비례가 아이에게 실리지 않게 한 첨언(2026-10-08 오너 결정 4)과 표정 우선 문장은 조각 세부보다 앞선다.
    const padded = `${sheet.prompt}\n${'Extra scene detail. '.repeat(Math.ceil((GROK_PROMPT_MAX_CHARS - sheet.prompt.length + 500) / 20))}`
    const sent = String(buildFalImageInput({ prompt: padded, reference_image_urls: sheet.reference_image_urls }, GROK_EDIT).prompt)
    const figureLine = sent.split('\n').find((line) => line.startsWith('Figure rules: '))!
    expect(figureLine.endsWith(`${FACET_ADULT_PROPORTIONS} ${FACET_EXPRESSION_PRIORITY}`)).toBe(true)
  })

  it('8,000자 이하인 글은 한 글자도 바꾸지 않는다', () => {
    // 왜: 한도 안의 요청까지 건드리면 같은 요청이 다른 그림이 된다(정상 경로 고정).
    expect(sheet.prompt.length).toBeLessThanOrEqual(GROK_PROMPT_MAX_CHARS)
    expect(buildFalImageInput({ prompt: sheet.prompt, reference_image_urls: sheet.reference_image_urls }, GROK_EDIT).prompt).toBe(sheet.prompt)
  })

  it('인물 규칙 줄이 없는데 8,000자를 넘으면 낱말 경계에서 잘라 8,000자 안에 맞춘다', () => {
    // 왜: 배경 · 사물처럼 인물 규칙이 없는 긴 요청도 거절되지 않게 한다(마지막 수단).
    const long = `Wide empty room. ${'word '.repeat(2000)}`
    const sent = String(buildFalImageInput({ prompt: long }, GROK).prompt)
    expect(sent.length).toBeLessThanOrEqual(GROK_PROMPT_MAX_CHARS)
    expect(sent.startsWith('Wide empty room.')).toBe(true)
    expect(sent.endsWith('word')).toBe(true)
  })

  it('글 한도를 맞출 때 그림체 조각에 원래 들어 있던 표정 우선 문장도 남긴다', () => {
    // 왜: 사용자 그림 분석 조각은 표정 우선 문장을 스스로 가질 수 있고, 그때 제품은 같은 문장을 다시 붙이지 않는다(style-anchor) — 그 문장이 맨 끝이라 먼저 잘리면 표정 규칙이 사라진다.
    const own = 'When the scene calls for an expression, the expression takes priority over these eye defaults.'
    const withOwn: ResolvedStyleAnchor = {
      key: 'custom_x',
      imageUrl: 'anchor.png',
      facets: parseStyleAnchorFacets({ probe_anchors: 'No outlines.', figure: `Realistic figures throughout. ${longFigure} ${own}` }),
    }
    const out = applyStyleAnchor(withOwn, { prompt: body, reference_image_urls: ['template.png'] }, 'turnaround', { pinAspectRatio: '16:9', people: true })
    const padded = `${out.prompt}\n${'Extra scene detail. '.repeat(Math.ceil((GROK_PROMPT_MAX_CHARS - out.prompt.length + 500) / 20))}`
    const sent = String(buildFalImageInput({ prompt: padded, reference_image_urls: out.reference_image_urls }, GROK_EDIT).prompt)
    expect(sent.length).toBeLessThanOrEqual(GROK_PROMPT_MAX_CHARS)
    const figureLine = sent.split('\n').find((line) => line.startsWith('Figure rules: '))!
    expect(figureLine).toContain(own)
    expect(figureLine.endsWith(FACET_ADULT_PROPORTIONS)).toBe(true)
  })

  it('본문에 "Figure rules:" 로 시작하는 줄이 있어도 제품이 붙인 마지막 인물 규칙 줄을 줄인다', () => {
    // 왜: 사용자가 쓴 설명이 같은 머리로 시작하면 그 줄을 줄이고 진짜 인물 규칙은 남은 채 마지막 수단(자르기)으로 넘어가 피할 것 줄이 잘렸다.
    const longBody = `${body}${'Extra scene detail. '.repeat(160)}`
    const tricky = applyStyleAnchor(anchor, { prompt: `Figure rules: written by the user.\n${longBody}`, reference_image_urls: ['template.png'] }, 'turnaround', { pinAspectRatio: '16:9', people: true })
    expect(tricky.prompt.length).toBeGreaterThan(GROK_PROMPT_MAX_CHARS)
    const sent = String(buildFalImageInput({ prompt: tricky.prompt, reference_image_urls: tricky.reference_image_urls }, GROK_EDIT).prompt)
    expect(sent.length).toBeLessThanOrEqual(GROK_PROMPT_MAX_CHARS)
    expect(sent).toContain('Figure rules: written by the user.')
    expect(sent.endsWith('Avoid anime, cel shading, logos.')).toBe(true)
    expect(sent.split('\n').length).toBe(tricky.prompt.split('\n').length)
  })

  it('마지막 수단으로 자를 때 빈 글을 보내지 않고, 자르는 자리가 낱말 사이면 그 낱말을 남긴다', () => {
    // 왜: 공백 없는 긴 글은 낱말 경계를 찾다 통째로 지워졌고, 경계에 딱 맞는 낱말은 하나 더 잘렸다(검토 2026-10-12).
    const unbroken = `\n${'x'.repeat(GROK_PROMPT_MAX_CHARS + 1000)}`
    const sentA = String(buildFalImageInput({ prompt: unbroken }, GROK).prompt)
    expect(sentA.length).toBeGreaterThan(0)
    expect(sentA.length).toBeLessThanOrEqual(GROK_PROMPT_MAX_CHARS)
    // 8,000번째 글자에서 낱말 하나가 딱 끝나고 다음 글자가 띄어쓰기다 — 그 낱말까지 남아야 한다.
    const words = `abcde${' abcd'.repeat(2000)}`
    const sentB = String(buildFalImageInput({ prompt: words }, GROK).prompt)
    expect(sentB.length).toBe(GROK_PROMPT_MAX_CHARS)
    expect(sentB.endsWith('abcd')).toBe(true)
  })

  it('다른 모델에는 글을 줄이지 않는다', () => {
    // 왜: 한도는 Grok 만의 약속이다 — GPT Image 2(32,000자)로 가는 시트 요청은 그대로 가야 한다(정상 경로 고정).
    const long = `${'Detail sentence. '.repeat(600)}`
    expect(buildFalImageInput({ prompt: long, reference_image_urls: ['a.png'] }, 'openai/gpt-image-2/edit').prompt).toBe(long)
  })
})
