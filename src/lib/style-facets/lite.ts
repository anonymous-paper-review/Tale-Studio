// 그림체 분석기(경량 facet lite v0.1) — 그림 한 장 → 서식 96칸 채움 → 조각 네 개(2026-10-09 오너 "그림체도 이미지 분석기 이용해서 facet화").
//   계약 정본: .claude/docs/2026-10-08/facet-presets/lite/README.md · 참조 구현 facet_lite_extract.py.
//   여기는 지시문 조립 · 답 확인 · 조각 만들기(순수)만 둔다. 모델 호출은 lite-llm.ts, 저장은 /api/produce/style-facets.
//   조각 모양은 style_anchors.facets 시드와 같다 — parseStyleAnchorFacets 가 그대로 읽고 applyStyleAnchor 가 싣는다.
import { LITE_GUIDE_COMPILE, LITE_GUIDE_FILL, LITE_TEMPLATE } from '@/lib/style-facets/lite-assets.generated'

export const LITE_FACET_VERSION = 'lite-v0.1'
export const LITE_LEAVES = 96
export const LITE_TAGS = ['[실측]', '[추정]', '[외삽]', '[해당 없음]'] // i18n-ok: 분석기 서식의 값 태그
export const LITE_SECTIONS = ['PROBE_ANCHORS', 'FIGURE', 'PRIORITY', 'NEGATIVE', 'SCENE'] as const
export type LiteSection = (typeof LITE_SECTIONS)[number]
/** 단어 상한(인계 검증 3) — 110%까지 통과, FIGURE 는 넘어도 자르지 않고 싣는다. */
export const LITE_WORD_CAPS: Record<LiteSection, number> = { PROBE_ANCHORS: 110, FIGURE: 150, PRIORITY: 30, NEGATIVE: 40, SCENE: 40 }
const OVER_RATIO = 1.1

/** 호출 1(채움) 지시문 — 참조 구현 fill_prompt 와 같은 글. */
export function buildLiteFillPrompt(): string {
  return [
    '# 작업: 그림 한 장의 스타일을 facet 템플릿 lite v0.1에 채우기', // i18n-ok: 분석기 지시문(참조 구현 그대로)
    '',
    '아래 서식(주석이 곧 작성법)과 채우기 규칙 8항을 읽고, 첨부한 그림 한 장을 보고 값을 채운다. 답은 두 개의 코드블록만으로 한다: ```json 블록에 filled.json(같은 구조, 값만 바꾼 JSON, 주석 없음)```, ```md 블록에 scene_summary.md(장면 종류·대상·인물 유무 2~3줄)```. 다른 말은 쓰지 않는다.', // i18n-ok: 분석기 지시문
    '',
    '- 96개 값을 전부 채운다. 첫 토큰은 `[실측]` `[추정]` `[외삽]` `[해당 없음]` 중 하나. `[n개 중 1개 선택]`은 그 후보 중에서만.', // i18n-ok: 분석기 지시문
    '- **수치는 재지 않는다** — 등급을 눈으로 고른다. 확대 측정·픽셀 계산에 시간을 쓰지 않는다. 이 판은 빠르게 채우는 것이 목적이다.', // i18n-ok: 분석기 지시문
    '- 보이지 않는 것은 "없음", 작아서 못 읽는 것은 "판독 불가". 장르의 보통 값으로 채우지 않는다.', // i18n-ok: 분석기 지시문
    '- 작가·작품·브랜드·캐릭터 이름 금지. 특정 캐릭터의 색·의상·소품·포즈는 적지 않는다(스타일만).', // i18n-ok: 분석기 지시문
    '- 외부 검색 금지.', // i18n-ok: 분석기 지시문
    '',
    '## 채우기 규칙', // i18n-ok: 분석기 지시문
    '',
    LITE_GUIDE_FILL,
    '',
    '## 서식 (facet-template-lite-v0.1.jsonc)', // i18n-ok: 분석기 지시문
    '',
    '```jsonc',
    LITE_TEMPLATE,
    '```',
    '',
  ].join('\n')
}

/** 호출 2(컴파일) 지시문 — 참조 구현 compile_prompt 와 같은 글. 원본 그림 없이 채움만 근거로 쓴다. */
export function buildLiteCompilePrompt(filledJson: string, sceneSummary: string): string {
  return [
    '# 작업: facet 템플릿 lite 채움 → 이미지 생성 프롬프트 컴파일', // i18n-ok: 분석기 지시문(참조 구현 그대로)
    '',
    '당신은 프롬프트 컴파일러다. 아래 `filled.json`(그림 한 장의 스타일을 경량 서식에 적은 것)과 `scene_summary.md`(그 그림의 내용 요약)만 보고 영문 프롬프트를 쓴다. **원본 이미지는 없다. 서식에 적힌 것만이 근거다.** 서식에 없는 속성을 지어내지 않는다. 답은 `prompts.md`의 내용만(아래 형식 그대로, 코드블록 없이) 쓴다.', // i18n-ok: 분석기 지시문
    '',
    '규칙은 아래 컴파일 규칙 12항을 그대로 따른다 — 특히 단어 상한(PROBE_ANCHORS 110 · FIGURE 150 · PRIORITY 30 · NEGATIVE 40 · SCENE 40), 등급을 방향어로 바꾸는 표(7항), 없음은 "no …"(8항).', // i18n-ok: 분석기 지시문
    '',
    '- 작가·작품·브랜드·회사 고유명사 금지. hex는 그대로. 한국어 값을 영문으로 옮길 때 의미를 바꾸지 않는다.', // i18n-ok: 분석기 지시문
    '- 외부 검색 금지. 길이를 맞추려고 다시 쓰기를 되풀이하지 않는다 — 한 번에 쓰고 끝낸다.', // i18n-ok: 분석기 지시문
    '',
    '## prompts.md 형식 (헤더 글자 그대로, 각 헤더 아래 문단 하나, 코드블록 없이)', // i18n-ok: 분석기 지시문
    '',
    '## PROBE_ANCHORS',
    '(≤ 110단어)', // i18n-ok: 분석기 지시문
    '',
    '## FIGURE',
    '(≤ 150단어, 인물 표본이 1 이상일 때만. 0이면 첫 토큰 `[EXTRAPOLATED]`)', // i18n-ok: 분석기 지시문
    '',
    '## PRIORITY',
    '(≤ 30단어, "Priority order: " 로 시작)', // i18n-ok: 분석기 지시문
    '',
    '## NEGATIVE',
    '(≤ 40단어, "Avoid " 로 시작하는 한 문장)', // i18n-ok: 분석기 지시문
    '',
    '## SCENE',
    '(≤ 40단어)', // i18n-ok: 분석기 지시문
    '',
    '## 컴파일 규칙', // i18n-ok: 분석기 지시문
    '',
    LITE_GUIDE_COMPILE,
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

/** 답의 코드블록 하나 — ```json / ```md(또는 markdown). */
export function liteFence(text: string, lang: string): string | null {
  const match = new RegExp('```' + lang + '\\s*\\n([\\s\\S]*?)\\n```').exec(text ?? '')
  return match ? match[1] : null
}

/** 채움의 값 수와 태그 붙은 값 수 — 참조 구현 leaves() 와 같은 셈(객체는 내려가고 나머지는 한 칸). */
export function countFilledLeaves(value: unknown): { leaves: number; tagged: number } {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.values(value as Record<string, unknown>).reduce<{ leaves: number; tagged: number }>(
      (acc, child) => {
        const sub = countFilledLeaves(child)
        return { leaves: acc.leaves + sub.leaves, tagged: acc.tagged + sub.tagged }
      },
      { leaves: 0, tagged: 0 },
    )
  }
  const tagged = typeof value === 'string' && LITE_TAGS.some((tag) => value.trimStart().startsWith(tag))
  return { leaves: 1, tagged: tagged ? 1 : 0 }
}

export type LiteFillCheck =
  | { ok: true; filledJson: string; sceneSummary: string }
  | { ok: false; reason: 'no_json' | 'bad_json' | 'leaves' | 'tags' }

/** 호출 1의 답 확인 — json 블록 · 96칸 · 모든 값의 첫 토큰이 태그. */
export function checkLiteFill(text: string): LiteFillCheck {
  const js = liteFence(text, 'json')
  if (!js) return { ok: false, reason: 'no_json' }
  let data: unknown
  try {
    data = JSON.parse(js)
  } catch {
    return { ok: false, reason: 'bad_json' }
  }
  const { leaves, tagged } = countFilledLeaves(data)
  if (leaves !== LITE_LEAVES) return { ok: false, reason: 'leaves' }
  if (tagged !== leaves) return { ok: false, reason: 'tags' }
  const md = liteFence(text, 'md') ?? liteFence(text, 'markdown') ?? ''
  return { ok: true, filledJson: JSON.stringify(data, null, 2), sceneSummary: md.trim() }
}

/** 컴파일 답의 절 하나 — 헤더 아래 문단을 한 줄로 모은다(참조 구현 section()). */
function liteSection(text: string, name: LiteSection): string | null {
  const lines = (text ?? '').split('\n')
  const start = lines.findIndex((line) => new RegExp(`^## ${name}\\b`).test(line))
  if (start < 0) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => /^## /.test(line))
  return (end < 0 ? rest : rest.slice(0, end)).join(' ').split(/\s+/).filter(Boolean).join(' ')
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length

export type LiteCompileCheck =
  | { ok: true; sections: Record<LiteSection, string> }
  | { ok: false; reason: 'missing_header' | 'empty' | 'priority_prefix' | 'negative_prefix' | 'over_cap' }

/** 호출 2의 답 확인 — 헤더 5개 · 조각 비지 않음 · 앞말 · 단어 상한(FIGURE 는 제외). */
export function checkLiteCompile(text: string): LiteCompileCheck {
  const sections = {} as Record<LiteSection, string>
  for (const name of LITE_SECTIONS) {
    const body = liteSection(text, name)
    if (body === null) return { ok: false, reason: 'missing_header' }
    sections[name] = body
  }
  if (!sections.PROBE_ANCHORS || !sections.PRIORITY || !sections.NEGATIVE) return { ok: false, reason: 'empty' }
  if (!sections.PRIORITY.startsWith('Priority order:')) return { ok: false, reason: 'priority_prefix' }
  if (!sections.NEGATIVE.startsWith('Avoid ')) return { ok: false, reason: 'negative_prefix' }
  for (const name of LITE_SECTIONS) {
    if (name === 'FIGURE') continue
    if (words(sections[name]) > Math.floor(LITE_WORD_CAPS[name] * OVER_RATIO)) return { ok: false, reason: 'over_cap' }
  }
  return { ok: true, sections }
}

/** 프로젝트 사용자 앵커에 싣는 조각 — style_anchors.facets 시드와 같은 이름. */
export interface LiteFacetsRecord {
  version: string
  extracted_at: string
  probe_anchors: string
  figure: string | null
  figure_extrapolated: boolean
  priority: string
  negative: string
  scene: string
  model: string
  usage?: unknown
}

/** 컴파일 답 → 조각. 형식이 틀리면 null. 인물 표본이 없으면(첫 토큰 [EXTRAPOLATED]) Figure 를 싣지 않는다. */
export function liteFacetsFromCompile(text: string, meta: { model: string; extractedAt: string; usage?: unknown }): LiteFacetsRecord | null {
  const check = checkLiteCompile(text)
  if (!check.ok) return null
  const rawFigure = check.sections.FIGURE
  const extrapolated = rawFigure.startsWith('[EXTRAPOLATED]')
  const figure = extrapolated || rawFigure.toLowerCase().replace(/\.$/, '') === 'none' || !rawFigure ? null : rawFigure
  return {
    version: LITE_FACET_VERSION,
    extracted_at: meta.extractedAt,
    probe_anchors: check.sections.PROBE_ANCHORS,
    figure,
    figure_extrapolated: extrapolated,
    priority: check.sections.PRIORITY,
    negative: check.sections.NEGATIVE,
    scene: check.sections.SCENE,
    model: meta.model,
    ...(meta.usage !== undefined ? { usage: meta.usage } : {}),
  }
}
