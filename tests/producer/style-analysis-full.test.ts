// 올린 그림체는 프리셋과 같은 309칸 서식을 두 덩어리로 나눠 동시에 채워 분석하고, 인물 조각은 한도 없이 싣는다 (오너 결정 2026-10-10)
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const anthropic = vi.hoisted(() => ({ stream: vi.fn() }))
vi.mock('@/lib/claude', () => ({ CLAUDE_MODEL: 'claude-sonnet-5-5', getAnthropicClient: () => ({ messages: { stream: anthropic.stream } }) }))

import {
  HP_FACET_VERSION,
  HP_LEAVES,
  buildHpFillPrompt,
  checkHpCompile,
  checkHpFill,
  heightPercentSentence,
  hpFacetsFromCompile,
  mergeHpFill,
  probeCapFor,
  withHeightPercent,
} from '@/lib/style-facets/hp'
import { extractHpFacets } from '@/lib/style-facets/hp-llm'
import * as assets from '@/lib/style-facets/hp-assets.generated'
import { HP_SOURCES, buildHpAssets } from '../../scripts/facet-hp-assets.mjs'

const SC = '.claude/skills/artist-style-anchor/scaffolds/'
const template = { ...JSON.parse(readFileSync(SC + 'facet-input-v1.2.json', 'utf8')), ...JSON.parse(readFileSync(SC + 'facet-template-v1.2.json', 'utf8')) } as Record<string, unknown>

/** 서식과 같은 모양의 채움 — 모든 값에 태그를 붙인다. over 로 몇 칸만 바꾼다. */
function filledFrom(keys: readonly string[], over: Record<string, string> = {}): Record<string, unknown> {
  const fill = (value: unknown, path: string[]): unknown =>
    value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, fill(v, [...path, k])]))
      : over[path.join('/')] ?? '[실측] 값'
  return Object.fromEntries(keys.map((key) => [key, fill(template[key], [key])]))
}
const fence = (filled: Record<string, unknown>, md = '교실 장면, 인물 9명.') => '```json\n' + JSON.stringify(filled) + '\n```\n```md\n' + md + '\n```'
const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ')
function compileText(over: Partial<Record<'PROBE_ANCHORS' | 'FIGURE' | 'PRIORITY' | 'NEGATIVE' | 'SCENE', string>> = {}) {
  const s = {
    PROBE_ANCHORS: 'Thin red brown colour outlines with hard cel fills. Detail budget: sparse.',
    FIGURE: 'Anime face on a compressed body. The figure is about 2.8 heads tall, measured to the top of the hair or hat, so keep the skull itself small. The torso is short. Keep every proportion close to the stated values; do not exaggerate beyond them.',
    PRIORITY: 'Priority order: thin colour lines → big heads → smooth hair masses',
    NEGATIVE: 'Avoid generic modern anime rendering, thick black outlines, readable text.',
    SCENE: 'A classroom with nine students.',
    ...over,
  }
  return Object.entries(s).map(([k, v]) => `## ${k}\n${v}`).join('\n\n')
}
/** 비례 · 묘사 밀도가 든 합친 채움 */
const PROPORTIONS = { '인물/비례/등신': '[추정] 약 2.8등신(머리카락 꼭대기까지)', '인물/비례/다리 비율': '[추정] 신장의 약 45%', '인물/비례/분절 비': '[추정] 다리 1.2 : 1 / 팔 1 : 1' }
const merged = (over: Record<string, string> = {}) => mergeHpFill(filledFrom(assets.HP_PART_KEYS.A, { '디테일/묘사 밀도/등급': '[추정] 2 적음', ...over }), filledFrom(assets.HP_PART_KEYS.B, { ...PROPORTIONS, ...over }))

/** 모델 답을 흉내 낸다 — 프롬프트 머리말(덩어리 A · B · 컴파일)로 가른다. 답 목록을 차례로 쓴다. */
function stubModel(answers: { A: string[]; B: string[]; compile: string[] }, hold?: Promise<void>) {
  const calls: Array<{ kind: 'A' | 'B' | 'compile'; max_tokens: number }> = []
  anthropic.stream.mockImplementation((params: { max_tokens: number; messages: Array<{ content: Array<{ type: string; text?: string }> }> }) => {
    const text = params.messages[0].content.find((c) => c.type === 'text')?.text ?? ''
    const kind = text.includes('## 이번 호출: 덩어리 A') ? 'A' : text.includes('## 이번 호출: 덩어리 B') ? 'B' : 'compile'
    calls.push({ kind, max_tokens: params.max_tokens })
    const answer = answers[kind].shift() ?? ''
    return { finalMessage: async () => { if (hold && kind !== 'compile') await hold; return { content: [{ type: 'text', text: answer }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } } }
  })
  return calls
}

beforeEach(() => {
  anthropic.stream.mockReset()
})

describe('올린 그림체 분석 — 프리셋과 같은 309칸', () => {
  it('제품에 실은 분석 서식 · 규칙 · 지시문은 facet 프로그램의 정본과 같다', () => {
    // 왜: 정본(서식 · 가이드)이 바뀌었는데 제품에 옛 사본이 남으면 프리셋과 다른 규칙으로 분석한다.
    const r = (p: string) => readFileSync(p, 'utf8')
    const built = buildHpAssets({ template: r(HP_SOURCES.template), templateJson: r(HP_SOURCES.templateJson), input: r(HP_SOURCES.input), inputJson: r(HP_SOURCES.inputJson), guide: r(HP_SOURCES.guide), specFill: r(HP_SOURCES.specFill), specCompile: r(HP_SOURCES.specCompile) })
    expect(assets.HP_TEMPLATE_A).toBe(built.parts.A)
    expect(assets.HP_TEMPLATE_B).toBe(built.parts.B)
    expect(assets.HP_GUIDE_FILL).toBe(built.guideFill)
    expect(assets.HP_GUIDE_COMPILE).toBe(built.guideCompile)
    expect(assets.HP_SPEC_FILL).toBe(built.specFill)
    expect(assets.HP_SPEC_COMPILE).toBe(built.specCompile)
  })

  it('올린 그림체는 프리셋과 같은 309칸 서식(입력 9칸 포함 318칸)을 두 덩어리로 나눠 채운다', () => {
    // 왜: 경량 판(96칸)은 재질 · 조명 · 구도 · 눈 · 포즈 대부분을 뺐다. 오너 결정 — 프리셋과 같은 깊이로 분석한다.
    expect(HP_LEAVES).toBe(318)
    expect([...assets.HP_PART_KEYS.A, ...assets.HP_PART_KEYS.B].sort()).toEqual([...assets.HP_BRANCH_ORDER].sort())
    const a = buildHpFillPrompt('A')
    const b = buildHpFillPrompt('B')
    expect(a).toContain(assets.HP_TEMPLATE_A)
    expect(b).toContain(assets.HP_TEMPLATE_B)
    expect(a).not.toContain(assets.HP_TEMPLATE_B)
    // 덩어리 B 는 묘사 밀도를 못 보므로 같은 방법으로 스스로 센다.
    expect(b).toMatch(/스스로|먼저 센다|먼저 하고/)
  })

  it('두 덩어리는 동시에 채운다', async () => {
    // 왜: 309칸을 한 번에 채우면 230초가 걸려 서버 요청 한도(300초) 안에 컴파일까지 못 끝낸다(10/10 실측). 나누면 158초.
    let release!: () => void
    const hold = new Promise<void>((r) => { release = r })
    const calls = stubModel({ A: [fence(filledFrom(assets.HP_PART_KEYS.A))], B: [fence(filledFrom(assets.HP_PART_KEYS.B))], compile: [compileText()] }, hold)
    const running = extractHpFacets('https://media.test/a.png')
    await vi.waitFor(() => expect(calls.filter((c) => c.kind !== 'compile')).toHaveLength(2))
    release()
    const { facets } = await running
    expect(facets?.version).toBe(HP_FACET_VERSION)
  })

  it('한 덩어리의 답이 틀리면 시간이 남을 때 그 덩어리만 다시 채운다', async () => {
    // 왜: 나머지 덩어리까지 다시 부르면 시간과 비용이 두 배가 된다.
    const calls = stubModel({ A: [fence(filledFrom(assets.HP_PART_KEYS.A))], B: ['```json\n{"공간": {}}\n```', fence(filledFrom(assets.HP_PART_KEYS.B))], compile: [compileText()] })
    const { facets } = await extractHpFacets('https://media.test/a.png')
    expect(facets).not.toBeNull()
    expect(calls.map((c) => c.kind).sort()).toEqual(['A', 'B', 'B', 'compile'])
  })

  it('남은 시간이 모자라면 다시 부르지 않고 분석 없이 끝낸다(그림만 참고)', async () => {
    // 왜: 서버 요청 한도(300초)를 넘기면 요청 자체가 끊겨 미뤄 둔 Artist 그림도 못 그린다.
    let clock = 0
    stubModel({ A: [fence(filledFrom(assets.HP_PART_KEYS.A))], B: ['```json\n{}\n```', fence(filledFrom(assets.HP_PART_KEYS.B))], compile: [compileText()] })
    anthropic.stream.mockImplementationOnce(() => ({ finalMessage: async () => { clock = 200_000; return { content: [{ type: 'text', text: fence(filledFrom(assets.HP_PART_KEYS.A)) }], stop_reason: 'end_turn', usage: {} } } }))
    const { facets, attempts } = await extractHpFacets('https://media.test/a.png', { now: () => clock })
    expect(facets).toBeNull()
    expect(attempts.filter((a) => a.step === 'fill')).toHaveLength(2)
  })

  it('"피할 것" · 게이트 판정 목록은 태그 없이 받고, 그 밖에 태그가 빠진 칸이 덩어리의 10% 이하면 그 덩어리를 받는다', () => {
    // 왜: 덩어리 하나를 채우는 데 150~200초가 걸려 다시 채울 시간이 없다(10/10 실측 — 165칸 중 몇 칸의 태그가 빠져 분석 전체가 실패했다). 태그만 빠진 값도 쓸 만하다.
    const avoid = { '생성 규칙/부정 절/인접 계열': 'generic anime, gacha art', '생성 규칙/게이트 판정/삽입': 'figure_rules' }
    expect(checkHpFill(fence(filledFrom(assets.HP_PART_KEYS.A, avoid)), 'A').ok).toBe(true)
    const leafPaths = (value: unknown, path: string[]): string[] => value && typeof value === 'object' ? Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => leafPaths(v, [...path, k])) : [path.join('/')]
    const bPaths = assets.HP_PART_KEYS.B.flatMap((key) => leafPaths(template[key], [key]))
    const untag = (n: number) => Object.fromEntries(bPaths.slice(0, n).map((p) => [p, '판독 불가']))
    expect(Math.floor(assets.HP_PART_LEAVES.B * 0.1)).toBe(15)
    expect(checkHpFill(fence(filledFrom(assets.HP_PART_KEYS.B, untag(15))), 'B').ok).toBe(true)
    expect(checkHpFill(fence(filledFrom(assets.HP_PART_KEYS.B, untag(16))), 'B')).toMatchObject({ ok: false, reason: 'tags' })
    expect(checkHpFill(fence(filledFrom(assets.HP_PART_KEYS.A)), 'B')).toMatchObject({ ok: false, reason: 'branches' })
  })

  it('컴파일 답이 비거나 형식이 틀리면 토큰을 1.5배로 늘려 한 번 더 부른다', async () => {
    // 왜: 생각 단계가 토큰을 다 먹으면 답이 빈다(경량 판 사이클 11 — 6장 중 3장).
    const calls = stubModel({ A: [fence(filledFrom(assets.HP_PART_KEYS.A))], B: [fence(filledFrom(assets.HP_PART_KEYS.B))], compile: ['', compileText()] })
    const { facets } = await extractHpFacets('https://media.test/a.png')
    expect(facets).not.toBeNull()
    const compiles = calls.filter((c) => c.kind === 'compile')
    expect(compiles.map((c) => c.max_tokens)).toEqual([compiles[0].max_tokens, compiles[0].max_tokens * 1.5])
  })

  it('앵커 조각은 묘사 밀도 등급별 상한(1~2등급 130 · 3등급 150 · 4~5등급 160단어)을 넘으면 받지 않는다', () => {
    // 왜: 프리셋과 같은 상한(가이드 §6 38) — 넘으면 생성기가 앵커 문장에 끌려 장면을 덜 따른다. 10% 여유는 경량 판과 같다.
    expect([probeCapFor(1), probeCapFor(2), probeCapFor(3), probeCapFor(4), probeCapFor(5), probeCapFor(null)]).toEqual([130, 130, 150, 160, 160, 160])
    expect(checkHpCompile(compileText({ PROBE_ANCHORS: words(150) }), 130)).toMatchObject({ ok: false, reason: 'over_cap' })
    expect(checkHpCompile(compileText({ PROBE_ANCHORS: words(170) }), 160).ok).toBe(true)
  })

  it('인물 조각은 길이 한도 없이 싣는다', () => {
    // 왜: 오너 결정 — 프리셋 12종은 인물 절 553~929단어로 운영 중이다. 10/10 측정에서 806e2cc2 그림은 610단어.
    const figure = `The figure is about 2.8 heads tall. ${words(900)}.`
    const facets = hpFacetsFromCompile(compileText({ FIGURE: figure }), merged(), { model: 'm', extractedAt: 'now' })
    expect(facets?.figure?.split(/\s+/).length).toBeGreaterThan(900)
  })

  it('인물 조각에는 신장 대비 무릎 · 가랑이 · 머리 높이 문장을 등신 문장 바로 뒤에 끼운다', () => {
    // 왜: 프리셋 v5 레시피(10/9 오너 결정) — 수치를 등신으로만 주면 생성기가 무릎과 가랑이를 높게 그렸다.
    const filled = merged()
    const sentence = heightPercentSentence(filled)
    expect(sentence).toBe('Measured on the standing height from the ground up: the knee (top of the lower leg, shoe included) is at about 25% of the height, the crotch at about 45%, and the head from chin to skull top is about 36% of the height; draw the knee and the crotch at these heights, not higher, and the head at this size.')
    const figure = withHeightPercent('Anime face. The figure is about 2.8 heads tall, measured to the top of the hair. The torso is short.', sentence)
    expect(figure).toBe(`Anime face. The figure is about 2.8 heads tall, measured to the top of the hair. ${sentence} The torso is short.`)
    // 분절 비를 못 읽었으면 무릎은 적지 않는다.
    expect(heightPercentSentence(merged({ '인물/비례/분절 비': '다리: 판독 불가 / 팔: 판독 불가' }))).toBe('Measured on the standing height from the ground up: the crotch is at about 45% of the height and the head from chin to skull top is about 36% of the height; draw the crotch at this height, not higher, and the head at this size.')
    const facets = hpFacetsFromCompile(compileText(), filled, { model: 'm', extractedAt: 'now' })
    expect(facets?.figure).toContain(sentence!)
  })

  it('우선순위 줄은 "Priority order:"로, 피할 것은 "Avoid "로 시작해야 받고, 목표 길이(35 · 55단어)는 30%까지 넘어도 받는다', () => {
    // 왜: 프리셋과 같은 형식 — 조립이 이 두 줄을 그대로 프롬프트 끝에 싣는다. 컴파일러가 상한까지 꽉 채워 쓰다 몇 단어 넘기는 일이 잦은데
    //   (10/10 실측) 컴파일을 다시 부를 시간이 없고, 끝에 붙는 두 줄은 몇 단어 길어도 해가 작다.
    expect(checkHpCompile(compileText(), 160).ok).toBe(true)
    expect(checkHpCompile(compileText({ PRIORITY: 'thin lines first' }), 160)).toMatchObject({ ok: false, reason: 'priority_prefix' })
    expect(checkHpCompile(compileText({ PRIORITY: `Priority order: ${words(40)}` }), 160).ok).toBe(true)
    expect(checkHpCompile(compileText({ PRIORITY: `Priority order: ${words(50)}` }), 160)).toMatchObject({ ok: false, reason: 'over_cap', section: 'PRIORITY' })
    expect(checkHpCompile(compileText({ NEGATIVE: 'No outlines.' }), 160)).toMatchObject({ ok: false, reason: 'negative_prefix' })
    expect(checkHpCompile(compileText({ NEGATIVE: `Avoid ${words(70)}.` }), 160).ok).toBe(true)
    expect(checkHpCompile(compileText({ NEGATIVE: `Avoid ${words(75)}.` }), 160)).toMatchObject({ ok: false, reason: 'over_cap', section: 'NEGATIVE' })
  })

  it('장면 문단은 기록용이라 길이를 보지 않는다', () => {
    // 왜: 장면 문단은 프롬프트에 싣지 않는다 — 길다는 이유로 분석 전체를 버리지 않는다.
    expect(checkHpCompile(compileText({ SCENE: words(120) }), 160).ok).toBe(true)
  })

  it('그림에 인물 표본이 없으면 인물 조각을 싣지 않는다', () => {
    // 정상 경로 고정 — 경량 판과 같다. 인물 없는 그림의 외삽 인물 절은 싣지 않는다.
    const extrapolated = hpFacetsFromCompile(compileText({ FIGURE: '[EXTRAPOLATED] Keep the observed line grammar.' }), merged(), { model: 'm', extractedAt: 'now' })
    expect(extrapolated).toMatchObject({ figure: null, figure_extrapolated: true })
    expect(hpFacetsFromCompile(compileText({ FIGURE: 'none' }), merged(), { model: 'm', extractedAt: 'now' })?.figure).toBeNull()
  })
})
