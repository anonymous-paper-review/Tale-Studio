// 그림체 분석기(고성능 판 v1.2.3, 유저 경로) — 그림 한 장 → 서식 318칸(입력 9 + 본문 309)을 두 덩어리로 나눠 채움 → 조각 네 개
//   (2026-10-10 오너 "프리셋과 같은 309칸, 나눠서 동시에" · "인물 조각 한도 없음"). 프리셋 12종 v5 레시피와 같은 규칙:
//   채움(spec-fill) → 컴파일 v3(앵커 등급별 상한 · 인물 상한 없음 · 표정 기본값 제외) + 우선순위 줄(방향어 상한) → 신장 % 문장(코드).
//   여기는 지시문 조립 · 답 확인 · 조각 만들기(순수)만 둔다. 모델 호출은 hp-llm.ts, 저장은 /api/produce/style-facets.
//   조각 모양은 경량 판 · 프리셋 시드와 같다 — parseStyleAnchorFacets 가 그대로 읽고 applyStyleAnchor 가 싣는다.
import {
  HP_BRANCH_ORDER,
  HP_GUIDE_COMPILE,
  HP_GUIDE_FILL,
  HP_PART_KEYS,
  HP_PART_LEAVES,
  HP_SPEC_COMPILE,
  HP_SPEC_FILL,
  HP_TEMPLATE_A,
  HP_TEMPLATE_B,
} from '@/lib/style-facets/hp-assets.generated'

export const HP_FACET_VERSION = 'hp-v1.2.3+compile-v3+priority-cap+height-pct+user-split'
export type HpPart = 'A' | 'B'
export const HP_LEAVES = HP_PART_LEAVES.A + HP_PART_LEAVES.B
export const HP_TAGS = ['[실측]', '[추정]', '[보정]', '[외삽]', '[해당 없음]'] // i18n-ok: 분석기 서식의 값 태그
/** 태그 없이 쓰는 칸 — "피할 것" 영문 목록과 게이트 판정 목록(채움 규격 "filled.json 채우는 법" 2항). */
const UNTAGGED_PATHS: ReadonlyArray<readonly string[]> = [
  ['생성 규칙', '부정 절'], // i18n-ok: 분석기 서식의 칸 이름
  ['생성 규칙', '게이트 판정'], // i18n-ok: 분석기 서식의 칸 이름
]
/** 그 밖에 태그가 빠져도 받는 비율 — 덩어리 하나를 채우는 데 150~200초가 걸려(10/10 실측) 다시 채울 시간이 없다. 태그만 빠진 값도
 *  쓸 만하므로 덩어리의 10%까지는 받고 빠진 칸을 기록한다(10/10 실측: 153칸 중 1칸 · 165칸 중 4칸 이상이 한 번씩 빠졌다). */
export const HP_UNTAGGED_RATIO = 0.1
export const untaggedSlack = (part: HpPart) => Math.floor(HP_PART_LEAVES[part] * HP_UNTAGGED_RATIO)
export const HP_SECTIONS = ['PROBE_ANCHORS', 'FIGURE', 'PRIORITY', 'NEGATIVE', 'SCENE'] as const
export type HpSection = (typeof HP_SECTIONS)[number]
/** 단어 상한(컴파일 v3 · 우선순위 줄 규격) — 지시문이 모델에게 주는 목표. 앵커는 묘사 밀도 등급별(probeCapFor), 인물은 상한 없음. */
export const HP_WORD_CAPS = { PRIORITY: 35, NEGATIVE: 55, SCENE: 60 } as const
/** 받는 선: 앵커는 상한의 110%(경량 판과 같다 — 앵커가 길면 장면을 덜 따른다). 우선순위 줄 · 피할 것은 130% — 컴파일러가 상한까지
 *  꽉 채워 쓰다 몇 단어 넘기는 일이 잦은데(10/10 실측) 컴파일을 다시 부를 시간이 없고, 끝에 붙는 두 줄은 몇 단어 길어도 해가 작다.
 *  장면(SCENE)은 기록용이라 프롬프트에 싣지 않으므로 길이를 보지 않는다. */
const PROBE_OVER_RATIO = 1.1
const LINE_OVER_RATIO = 1.3

const PART_HEAD: Record<HpPart, string[]> = {
  A: [
    '## 이번 호출: 덩어리 A', // i18n-ok: 분석기 지시문
    '서식은 두 덩어리로 나뉘어 동시에 채워진다. 이 호출은 덩어리 A(입력 · 디테일 · 그림체 · 사진성 · 분위기 · 분류 · 생성 규칙)만 채운다. 공간 · 재질 · 인물 · 장식은 다른 호출이 같은 그림으로 채운다 — 분류 · 생성 규칙은 그 가지까지 포함한 그림 전체를 보고 쓴다.', // i18n-ok: 분석기 지시문
    '답은 ```json 블록(이 덩어리의 가지만)과 ```md 블록(scene_summary.md) 두 개다.', // i18n-ok: 분석기 지시문
  ],
  B: [
    '## 이번 호출: 덩어리 B', // i18n-ok: 분석기 지시문
    '서식은 두 덩어리로 나뉘어 동시에 채워진다. 이 호출은 덩어리 B(공간 · 재질 · 인물 · 장식)만 채운다. 입력 · 디테일 · 그림체 · 분류 · 생성 규칙은 다른 호출이 같은 그림으로 채운다.', // i18n-ok: 분석기 지시문
    '그 호출의 판독 한계와 묘사 밀도 개수는 여기서 볼 수 없다 — 채우기 전에 채우는 순서 1~2(판독 한계 · 표본 개체의 개수 세기)를 같은 방법으로 스스로 먼저 하고(답에는 적지 않는다), 개수 리프는 그 센 값을 인용한다.', // i18n-ok: 분석기 지시문
    '답은 ```json 블록(이 덩어리의 가지만) 하나다. scene_summary.md 는 덩어리 A가 쓴다.', // i18n-ok: 분석기 지시문
  ],
}

/** 채움 지시문 — 덩어리 머리말 + 채움 규격 + 작성 규칙(가이드 §4) + 덩어리 서식. */
export function buildHpFillPrompt(part: HpPart): string {
  return [
    ...PART_HEAD[part],
    '',
    HP_SPEC_FILL,
    '',
    '## 작성 규칙 (facet-template-v1.2.guide.md §4)', // i18n-ok: 분석기 지시문
    '',
    HP_GUIDE_FILL,
    '',
    `## 서식 (덩어리 ${part})`, // i18n-ok: 분석기 지시문
    '',
    '```jsonc',
    part === 'A' ? HP_TEMPLATE_A : HP_TEMPLATE_B,
    '```',
    '',
  ].join('\n')
}

/** 답의 코드블록 하나 — ```json / ```md(또는 markdown). */
export function hpFence(text: string, lang: string): string | null {
  const match = new RegExp('```' + lang + '\\s*\\n([\\s\\S]*?)\\n```').exec(text ?? '')
  return match ? match[1] : null
}

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value)

/** 채움의 값(잎) — 객체는 내려가고 나머지는 한 칸(경량 판 countFilledLeaves 와 같은 셈). */
function leafEntries(value: unknown, path: string[] = []): Array<[string[], unknown]> {
  return isObject(value) ? Object.entries(value).flatMap(([key, child]) => leafEntries(child, [...path, key])) : [[path, value]]
}

const tagged = (value: unknown) => typeof value === 'string' && HP_TAGS.some((tag) => value.trimStart().startsWith(tag))
const untaggedOk = (path: string[]) => UNTAGGED_PATHS.some((prefix) => prefix.every((key, i) => path[i] === key))

export type HpFillCheck =
  | { ok: true; filled: Json; sceneSummary: string; untagged: string[] }
  | { ok: false; reason: 'no_json' | 'bad_json' | 'branches' | 'leaves' | 'tags' }

/** 덩어리 하나의 답 확인 — json 블록 · 그 덩어리의 가지만 · 칸 수 · 태그(목록 칸 제외, 빠진 칸은 덩어리의 10%까지). */
export function checkHpFill(text: string, part: HpPart): HpFillCheck {
  const js = hpFence(text, 'json')
  if (!js) return { ok: false, reason: 'no_json' }
  let data: unknown
  try {
    data = JSON.parse(js)
  } catch {
    return { ok: false, reason: 'bad_json' }
  }
  if (!isObject(data)) return { ok: false, reason: 'bad_json' }
  const filled: Json = data
  const keys: readonly string[] = HP_PART_KEYS[part]
  if (Object.keys(filled).length !== keys.length || keys.some((key) => !isObject(filled[key]))) return { ok: false, reason: 'branches' }
  const entries = leafEntries(filled)
  if (entries.length !== HP_PART_LEAVES[part]) return { ok: false, reason: 'leaves' }
  const untagged = entries.filter(([path, value]) => !tagged(value) && !untaggedOk(path)).map(([path]) => path.join('.'))
  if (untagged.length > untaggedSlack(part)) return { ok: false, reason: 'tags' }
  const md = hpFence(text, 'md') ?? hpFence(text, 'markdown') ?? ''
  return { ok: true, filled, sceneSummary: md.trim(), untagged }
}

/** 두 덩어리 → 한 채움(정본 가지 순서). */
export function mergeHpFill(a: Json, b: Json): Json {
  const all = { ...a, ...b }
  return Object.fromEntries(HP_BRANCH_ORDER.filter((key) => key in all).map((key) => [key, all[key]]))
}

function valueAt(filled: Json, path: string[]): string | null {
  let value: unknown = filled
  for (const key of path) {
    if (!isObject(value)) return null
    value = value[key]
  }
  return typeof value === 'string' ? value : null
}

/** 묘사 밀도 등급(1~5) — "[추정] 2 적음" 꼴. 못 읽으면 null. */
export function detailGrade(filled: Json): number | null {
  const raw = valueAt(filled, ['디테일', '묘사 밀도', '등급']) // i18n-ok: 분석기 서식의 칸 이름
  const match = raw ? /([1-5])/.exec(raw.replace(/^\s*\[[^\]]*\]/, '')) : null
  return match ? Number(match[1]) : null
}

/** 앵커 조각 절대 상한(컴파일 v3 머리말 2 · 가이드 §6 38) — 등급 1~2 → 130, 3 → 150, 4~5(또는 모름) → 160. */
export function probeCapFor(grade: number | null): number {
  if (grade !== null && grade <= 2) return 130
  if (grade === 3) return 150
  return 160
}

/** 컴파일 지시문 — 컴파일 규격(우선순위 줄 포함) + 컴파일 규칙(가이드 §6) + 채움 + 장면 요약. 원본 그림은 보내지 않는다. */
export function buildHpCompilePrompt(filledJson: string, sceneSummary: string): string {
  return [
    HP_SPEC_COMPILE,
    '',
    '## 컴파일 규칙 (facet-template-v1.2.guide.md §6)', // i18n-ok: 분석기 지시문
    '',
    HP_GUIDE_COMPILE,
    '',
    '## filled.json',
    '',
    '```json',
    filledJson,
    '```',
    '',
    '## scene_summary.md',
    '',
    sceneSummary,
  ].join('\n')
}

/** 컴파일 답의 절 하나 — 헤더 아래 문단을 한 줄로 모은다(경량 판 liteSection 과 같다). */
function hpSection(text: string, name: HpSection): string | null {
  const lines = (text ?? '').split('\n')
  const start = lines.findIndex((line) => new RegExp(`^## ${name}\\b`).test(line))
  if (start < 0) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => /^## /.test(line))
  return (end < 0 ? rest : rest.slice(0, end)).join(' ').split(/\s+/).filter(Boolean).join(' ')
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length

export type HpCompileCheck =
  | { ok: true; sections: Record<HpSection, string> }
  | { ok: false; reason: 'missing_header' | 'empty' | 'priority_prefix' | 'negative_prefix' | 'over_cap'; section?: HpSection; words?: number }

/** 컴파일 답 확인 — 헤더 5개 · 조각 비지 않음 · 앞말 · 받는 선(앵커는 등급별 110%, 우선순위 줄 · 피할 것은 130%, 인물 · 장면은 없음). */
export function checkHpCompile(text: string, probeCap: number): HpCompileCheck {
  const sections = {} as Record<HpSection, string>
  for (const name of HP_SECTIONS) {
    const body = hpSection(text, name)
    if (body === null) return { ok: false, reason: 'missing_header' }
    sections[name] = body
  }
  if (!sections.PROBE_ANCHORS || !sections.PRIORITY || !sections.NEGATIVE) return { ok: false, reason: 'empty' }
  if (!sections.PRIORITY.startsWith('Priority order:')) return { ok: false, reason: 'priority_prefix' }
  if (!sections.NEGATIVE.startsWith('Avoid ')) return { ok: false, reason: 'negative_prefix' }
  const limits: Array<[HpSection, number]> = [
    ['PROBE_ANCHORS', Math.floor(probeCap * PROBE_OVER_RATIO)],
    ['PRIORITY', Math.floor(HP_WORD_CAPS.PRIORITY * LINE_OVER_RATIO)],
    ['NEGATIVE', Math.floor(HP_WORD_CAPS.NEGATIVE * LINE_OVER_RATIO)],
  ]
  for (const [name, limit] of limits) {
    const count = words(sections[name])
    if (count > limit) return { ok: false, reason: 'over_cap', section: name, words: count }
  }
  return { ok: true, sections }
}

/** 파이썬 round 와 같은 반올림(반은 짝수 쪽) — 프리셋 v5 스크립트(make_v5.py)와 같은 수를 낸다. */
function roundHalfEven(x: number): number {
  const floor = Math.floor(x)
  const diff = x - floor
  if (Math.abs(diff - 0.5) > 1e-9) return Math.round(x)
  return floor % 2 === 0 ? floor : floor + 1
}

/**
 * 신장 % 문장(프리셋 v5, 2026-10-09 오너 결정) — 인물.비례에서 계산한다: 머리 % = 100 ÷ 등신, 가랑이 % = 다리 비율,
 *   무릎 % = 다리 비율 × r ÷ (1 + r)(r = 분절 비의 하퇴 : 허벅지, "팔" 앞에 적힌 다리 비만). 분절 비가 대리값이거나 못 읽으면 무릎은 적지 않는다.
 *   등신 · 다리 비율을 못 읽으면 null(문장 없음). 글자는 make_v5.py 와 같다.
 */
export function heightPercentSentence(filled: Json): string | null {
  const heads = Number(/([\d.]+)\s*등신/.exec(valueAt(filled, ['인물', '비례', '등신']) ?? '')?.[1]) // i18n-ok: 분석기 서식의 칸 이름 · 단위
  const legs = Number(/([\d.]+)\s*%/.exec(valueAt(filled, ['인물', '비례', '다리 비율']) ?? '')?.[1]) // i18n-ok: 분석기 서식의 칸 이름
  if (!Number.isFinite(heads) || heads <= 0 || !Number.isFinite(legs) || legs <= 0) return null
  const segment = valueAt(filled, ['인물', '비례', '분절 비']) ?? '' // i18n-ok: 분석기 서식의 칸 이름
  const proxy = ['대리', '표식 없음', '고정 금지'].some((word) => segment.includes(word)) // i18n-ok: 분석기 서식 값의 표지어
  const ratio = Number(/([\d.]+)\s*:\s*1\b/.exec(segment.split('팔')[0])?.[1]) // i18n-ok: 분석기 서식 값의 표지어
  const head = roundHalfEven(100 / heads)
  const crotch = roundHalfEven(legs)
  const knee = Number.isFinite(ratio) && ratio > 0 && !proxy ? roundHalfEven((legs * ratio) / (1 + ratio)) : null
  return knee
    ? `Measured on the standing height from the ground up: the knee (top of the lower leg, shoe included) is at about ${knee}% of the height, the crotch at about ${crotch}%, and the head from chin to skull top is about ${head}% of the height; draw the knee and the crotch at these heights, not higher, and the head at this size.`
    : `Measured on the standing height from the ground up: the crotch is at about ${crotch}% of the height and the head from chin to skull top is about ${head}% of the height; draw the crotch at this height, not higher, and the head at this size.`
}

/** 신장 % 문장을 등신 문장 바로 뒤(진짜 문장 경계 — 마침표 + 공백 + 대문자, 소수점은 건너뛴다)에 끼운다. 자리가 없으면 그대로. */
export function withHeightPercent(figure: string, sentence: string | null): string {
  if (!sentence || figure.includes('Measured on the standing height')) return figure
  const at = figure.indexOf('heads tall')
  if (at < 0) return figure
  const boundary = /\.(?=\s+[A-Z]|\s*$)/g
  boundary.lastIndex = at
  const end = boundary.exec(figure)
  if (!end) return figure
  const cut = end.index + 1
  return `${figure.slice(0, cut)} ${sentence}${figure.slice(cut)}`
}

/** 프로젝트 사용자 앵커에 싣는 조각 — 경량 판 · 프리셋 시드와 같은 이름. */
export interface HpFacetsRecord {
  version: string
  extracted_at: string
  probe_anchors: string
  figure: string | null
  figure_extrapolated: boolean
  priority: string
  negative: string
  scene: string
  model: string
  leaves: number
  usage?: unknown
  timing?: unknown
}

/** 컴파일 답 → 조각. 형식이 틀리면 null. 인물 표본이 없으면(첫 토큰 [EXTRAPOLATED] 또는 none) Figure 를 싣지 않는다. */
export function hpFacetsFromCompile(
  text: string,
  filled: Json,
  meta: { model: string; extractedAt: string; usage?: unknown; timing?: unknown },
): HpFacetsRecord | null {
  const check = checkHpCompile(text, probeCapFor(detailGrade(filled)))
  if (!check.ok) return null
  const rawFigure = check.sections.FIGURE
  const extrapolated = rawFigure.startsWith('[EXTRAPOLATED]')
  const none = !rawFigure || rawFigure.toLowerCase().replace(/\.$/, '') === 'none'
  const figure = extrapolated || none ? null : withHeightPercent(rawFigure, heightPercentSentence(filled))
  return {
    version: HP_FACET_VERSION,
    extracted_at: meta.extractedAt,
    probe_anchors: check.sections.PROBE_ANCHORS,
    figure,
    figure_extrapolated: extrapolated,
    priority: check.sections.PRIORITY,
    negative: check.sections.NEGATIVE,
    scene: check.sections.SCENE,
    model: meta.model,
    leaves: HP_LEAVES,
    ...(meta.usage !== undefined ? { usage: meta.usage } : {}),
    ...(meta.timing !== undefined ? { timing: meta.timing } : {}),
  }
}
