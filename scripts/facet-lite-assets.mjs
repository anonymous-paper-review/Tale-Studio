#!/usr/bin/env node
// 그림체 분석기(경량 facet lite v0.1)의 서식 · 규칙을 제품 코드로 옮긴다 (2026-10-09 오너 "그림체도 이미지 분석기 이용해서 facet화").
//
// 정본: .claude/skills/artist-style-anchor/scaffolds/facet-template-lite-v0.1.jsonc(서식 — 주석이 곧 작성법이라 지우지 않는다)
//       .claude/skills/artist-style-anchor/scaffolds/facet-template-lite-v0.1.guide.md(§1 채우기 규칙 · §2 컴파일 규칙)
// 사용: node scripts/facet-lite-assets.mjs  →  src/lib/style-facets/lite-assets.generated.ts
// tests/producer/comic-style.test.ts 가 정본과 생성본이 같은지 본다 — 정본이 바뀌면 이 스크립트를 다시 돌린다.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const LITE_SOURCES = {
  template: '.claude/skills/artist-style-anchor/scaffolds/facet-template-lite-v0.1.jsonc',
  guide: '.claude/skills/artist-style-anchor/scaffolds/facet-template-lite-v0.1.guide.md',
}
export const LITE_OUTPUT = 'src/lib/style-facets/lite-assets.generated.ts'

/** 가이드의 "## n." 절 하나 — 참조 구현(facet_lite_extract.py guide_section)과 같은 잘라내기. */
function guideSection(guide, n) {
  const match = new RegExp(`## ${n}\\.[\\s\\S]*?(?=\\n## |$)`).exec(guide)
  if (!match) throw new Error(`guide section ${n} not found`)
  return match[0]
}

export function buildLiteAssets({ template, guide }) {
  return { template, fill: guideSection(guide, 1), compile: guideSection(guide, 2) }
}

function main() {
  const built = buildLiteAssets({
    template: readFileSync(LITE_SOURCES.template, 'utf8'),
    guide: readFileSync(LITE_SOURCES.guide, 'utf8'),
  })
  const body = [
    '// 생성 파일 — 손으로 고치지 않는다. scripts/facet-lite-assets.mjs 가 정본에서 만든다:',
    `//   ${LITE_SOURCES.template}`,
    `//   ${LITE_SOURCES.guide} (§1 · §2)`,
    `export const LITE_TEMPLATE = ${JSON.stringify(built.template)} // i18n-ok: 분석기 정본 서식(한국어) 그대로`,
    `export const LITE_GUIDE_FILL = ${JSON.stringify(built.fill)} // i18n-ok: 분석기 정본 규칙(한국어) 그대로`,
    `export const LITE_GUIDE_COMPILE = ${JSON.stringify(built.compile)} // i18n-ok: 분석기 정본 규칙(한국어) 그대로`,
    '',
  ].join('\n')
  writeFileSync(LITE_OUTPUT, body)
  console.log(JSON.stringify({ out: LITE_OUTPUT, template: built.template.length, fill: built.fill.length, compile: built.compile.length }))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
