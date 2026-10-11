#!/usr/bin/env node
// 그림체 분석기(고성능 판 v1.2.3, 유저 경로)의 서식 · 규칙 · 지시문을 제품 코드로 옮긴다 (2026-10-10 오너 "프리셋과 같은 309칸, 나눠서 동시에").
//
// 정본(읽기만 — facet 프로그램 소유): .claude/skills/artist-style-anchor/scaffolds/facet-template-v1.2.jsonc · facet-input-v1.2.jsonc(서식, 주석이 곧 작성법)
//                                      .claude/skills/artist-style-anchor/scaffolds/facet-template-v1.2.guide.md(§4 작성 규칙 · §6 컴파일 규칙)
// 제품 지시문(제품 소유):              src/lib/style-facets/specs/hp-fill.md · hp-compile.md
// 사용: node scripts/facet-hp-assets.mjs  →  src/lib/style-facets/hp-assets.generated.ts
// tests/producer/style-analysis-full.test.ts 가 정본과 생성본이 같은지 본다 — 정본이 바뀌면 이 스크립트를 다시 돌린다.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SCAFFOLDS = '.claude/skills/artist-style-anchor/scaffolds/'
export const HP_SOURCES = {
  template: SCAFFOLDS + 'facet-template-v1.2.jsonc',
  templateJson: SCAFFOLDS + 'facet-template-v1.2.json',
  input: SCAFFOLDS + 'facet-input-v1.2.jsonc',
  inputJson: SCAFFOLDS + 'facet-input-v1.2.json',
  guide: SCAFFOLDS + 'facet-template-v1.2.guide.md',
  specFill: 'src/lib/style-facets/specs/hp-fill.md',
  specCompile: 'src/lib/style-facets/specs/hp-compile.md',
}
export const HP_OUTPUT = 'src/lib/style-facets/hp-assets.generated.ts'

/** 두 덩어리 — A 는 개수를 정하는 가지(입력 · 묘사 밀도 · 그림체)와 요약 가지, B 는 그 개수를 스스로 다시 세어 쓰는 가지. 순서 = 채우는 순서. */
export const HP_PART_KEYS = {
  A: ['입력', '디테일', '그림체', '사진성', '분위기', '분류', '생성 규칙'],
  B: ['공간', '재질', '인물', '장식'],
}

/** 가이드의 "## n." 절 하나 — lite 생성기와 같은 잘라내기. */
function guideSection(guide, n) {
  const match = new RegExp(`## ${n}\\.[\\s\\S]*?(?=\\n## |$)`).exec(guide)
  if (!match) throw new Error(`guide section ${n} not found`)
  return match[0]
}

/** 지시문 md 에서 관리자용 주석(<!-- -->)을 뺀다 — 모델에게 보내는 글만 남긴다. */
function stripComments(md) {
  return md.replace(/<!--[\s\S]*?-->\n?/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

/** jsonc 의 최상위 가지 — 머리 주석 줄과 가지별 줄(닫는 줄은 쉼표 없이 "  }"로 맞춘다). */
function topBranches(jsonc) {
  const lines = jsonc.split('\n')
  const starts = []
  lines.forEach((line, i) => {
    const m = /^ {2}"([^"]+)": \{/.exec(line)
    if (m) starts.push({ key: m[1], i })
  })
  if (!starts.length || lines[0].trim() !== '{') throw new Error('unexpected jsonc shape')
  const close = lines.lastIndexOf('}')
  const branches = {}
  starts.forEach((s, n) => {
    const body = lines.slice(s.i, n + 1 < starts.length ? starts[n + 1].i : close)
    while (body.length && !body[body.length - 1].trim()) body.pop()
    const last = body[body.length - 1]
    if (!/^ {2}\},?\s*(\/\/.*)?$/.test(last)) throw new Error(`branch ${s.key} does not end with a closing brace`)
    body[body.length - 1] = last.replace(/^ {2}\},?/, '  }')
    branches[s.key] = body
  })
  return { header: lines.slice(1, starts[0].i), branches, order: starts.map((s) => s.key) }
}

function leaves(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.values(value).reduce((n, child) => n + leaves(child), 0)
    : 1
}

/** 덩어리 하나의 서식 — 머리 주석 + 가지들(채우는 순서) + 닫는 괄호. */
function partTemplate(headers, bodies) {
  const out = ['{', ...headers]
  bodies.forEach((body, i) => {
    const lines = [...body]
    if (i < bodies.length - 1) lines[lines.length - 1] = lines[lines.length - 1].replace(/^ {2}\}/, '  },')
    out.push(...lines)
    if (i < bodies.length - 1) out.push('')
  })
  out.push('}')
  return out.join('\n')
}

export function buildHpAssets({ template, templateJson, input, inputJson, guide, specFill, specCompile }) {
  const t = topBranches(template)
  const inp = topBranches(input)
  const json = { ...JSON.parse(inputJson), ...JSON.parse(templateJson) }
  const order = [...inp.order, ...t.order]
  const all = { ...inp.branches, ...t.branches }
  const partKeys = [...HP_PART_KEYS.A, ...HP_PART_KEYS.B]
  if (partKeys.length !== order.length || order.some((key) => !partKeys.includes(key))) {
    throw new Error(`template branches changed: ${order.join(', ')} — update HP_PART_KEYS`)
  }
  for (const key of order) if (!(key in json)) throw new Error(`stripped json misses ${key}`)
  const parts = { A: '', B: '' }
  const partLeaves = { A: 0, B: 0 }
  for (const part of /** @type {const} */ (['A', 'B'])) {
    const keys = HP_PART_KEYS[part]
    const headers = part === 'A' ? [...t.header, ...inp.header] : t.header
    parts[part] = partTemplate(headers, keys.map((key) => all[key]))
    partLeaves[part] = keys.reduce((n, key) => n + leaves(json[key]), 0)
  }
  return {
    specFill: stripComments(specFill),
    specCompile: stripComments(specCompile),
    guideFill: guideSection(guide, 4),
    guideCompile: guideSection(guide, 6),
    parts,
    partLeaves,
    order,
  }
}

function read(path) {
  return readFileSync(path, 'utf8')
}

function main() {
  const built = buildHpAssets({
    template: read(HP_SOURCES.template),
    templateJson: read(HP_SOURCES.templateJson),
    input: read(HP_SOURCES.input),
    inputJson: read(HP_SOURCES.inputJson),
    guide: read(HP_SOURCES.guide),
    specFill: read(HP_SOURCES.specFill),
    specCompile: read(HP_SOURCES.specCompile),
  })
  const body = [
    '// 생성 파일 — 손으로 고치지 않는다. scripts/facet-hp-assets.mjs 가 정본에서 만든다:',
    `//   ${HP_SOURCES.template} · ${HP_SOURCES.input} (서식 — 두 덩어리로 나눔)`,
    `//   ${HP_SOURCES.guide} (§4 · §6)`,
    `//   ${HP_SOURCES.specFill} · ${HP_SOURCES.specCompile} (제품 지시문)`,
    `export const HP_SPEC_FILL = ${JSON.stringify(built.specFill)} // i18n-ok: 분석기 지시문(한국어) 그대로`,
    `export const HP_SPEC_COMPILE = ${JSON.stringify(built.specCompile)} // i18n-ok: 분석기 지시문(한국어) 그대로`,
    `export const HP_GUIDE_FILL = ${JSON.stringify(built.guideFill)} // i18n-ok: 분석기 정본 규칙(한국어) 그대로`,
    `export const HP_GUIDE_COMPILE = ${JSON.stringify(built.guideCompile)} // i18n-ok: 분석기 정본 규칙(한국어) 그대로`,
    `export const HP_TEMPLATE_A = ${JSON.stringify(built.parts.A)} // i18n-ok: 분석기 정본 서식(한국어) 그대로`,
    `export const HP_TEMPLATE_B = ${JSON.stringify(built.parts.B)} // i18n-ok: 분석기 정본 서식(한국어) 그대로`,
    `export const HP_PART_KEYS = ${JSON.stringify(HP_PART_KEYS)} as const // i18n-ok: 서식 가지 이름`,
    `export const HP_PART_LEAVES = ${JSON.stringify(built.partLeaves)} as const`,
    `export const HP_BRANCH_ORDER = ${JSON.stringify(built.order)} as const // i18n-ok: 서식 가지 이름(정본 순서)`,
    '',
  ].join('\n')
  writeFileSync(HP_OUTPUT, body)
  console.log(JSON.stringify({ out: HP_OUTPUT, leaves: built.partLeaves, order: built.order, sizes: { A: built.parts.A.length, B: built.parts.B.length, fill: built.guideFill.length, compile: built.guideCompile.length } }))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
