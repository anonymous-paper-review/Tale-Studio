// 약속 A — 화면 문구에 긴 대시가 없고 영어는 첫 글자가 대문자다 (_tdd.md A, 2026-09-04 오너 확정)
//
//   문장 하나 = 테스트 하나. "화면 문구"의 정의(오너 A1=한국어·영어 모두):
//     ① 한국어 사전(src/lib/i18n/*.ts)의 키(영어 원문)와 값(한국어)
//     ② JSX 텍스트와 JSX 속성 문자열(placeholder·title·aria-label 등, className 제외)
//     ③ t(...) · translate(locale, ...) · toast.*(...) 의 첫 문자열 인자
//     ④ API 응답의 { error: '…' } 문자열(토스트로 화면에 뜬다)
//   제외: 주석(AST 라서 자동 제외), console.* 인자, LLM 파이프라인 프롬프트(src/lib/writer/pipeline/**),
//   writer 콘텐츠 영어 파생(src/lib/writer/i18n/derive-en.ts) — 화면 크롬이 아니다.
//
//   대시: 긴 대시(—)·짧은 대시(–)·가로줄(―) 모두. AI 가 쓴 티가 나서 뺀다(오너 A).
//   대문자(오너 A2=1안): 영어 문구는 문장 첫 글자가 대문자(copy-style.md 의 sentence case 와 같다),
//     그리고 단계 고유명(Writer·Producer·Artist·Director·Editor)은 문구 어디서든 대문자로 시작한다.
//   AI 안내문(오너 A6): 채팅 시스템 프롬프트 산문 안의 소문자 단계 이름은 위반, 코드 식별자는 제외.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { polishAssistantProse, renderInlineMarkdown } from '@/lib/inline-markdown'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')
const DICT_DIR = path.join('src', 'lib', 'i18n') + path.sep
const EXCLUDED = [
  path.join('src', 'lib', 'writer', 'pipeline') + path.sep,
  path.join('src', 'lib', 'writer', 'i18n', 'derive-en.ts'),
  // 디자인 시스템 쇼케이스(/design) — 개발자용 카탈로그, 스튜디오 화면이 아니다.
  path.join('src', 'app', 'design') + path.sep,
]
// 'editor' 는 "arrow editor" 처럼 도구 이름으로 더 자주 쓰여 뺀다(단계 Editor 는 프롬프트·문구에서 대문자로 쓴다).
const STAGE_WORDS = ['writer', 'producer', 'artist', 'director']
const DASH = /[—–―]/
const UI_CALLS = new Set(['t', 'translate'])
const UI_PROPS = new Set(['error', 'placeholder', 'title', 'description', 'label', 'aria-label'])

interface Found {
  file: string
  line: number
  text: string
  kind: 'dict' | 'jsx' | 'attr' | 'call' | 'prop'
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join('{…}')
  return null
}

function calleeName(expr: ts.Expression): string {
  if (ts.isIdentifier(expr)) return expr.text
  if (ts.isPropertyAccessExpression(expr)) return `${calleeName(expr.expression)}.${expr.name.text}`
  return ''
}

/** 파일 하나의 화면 문구 후보를 AST 로 뽑는다 — 주석은 노드가 아니라 자연히 빠진다. */
function uiStringsOf(file: string): Found[] {
  const rel = path.relative(ROOT, file)
  const source = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: Found[] = []
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
  const isDict = rel.startsWith(DICT_DIR)
  const isApi = rel.startsWith(path.join('src', 'app', 'api') + path.sep)
  const lines = source.split('\n')
  const push = (n: ts.Node, kind: Found['kind'], text: string) => {
    if (!text.trim()) return
    const line = lineOf(n)
    // 프라그마 `// copy-ok: …` — 문장 조각(다른 문장에 끼워 넣는 소문자 토막)·의도된 표기. 사유를 적는다.
    if (/copy-ok/.test(lines[line - 1] ?? '')) return
    if (/^use (client|server)$/.test(text)) return // 지시문, 문구가 아니다
    out.push({ file: rel, line, text, kind })
  }
  const visit = (node: ts.Node, inConsole: boolean) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression)
      if (name.startsWith('console.')) {
        return // 로그는 화면 문구가 아니다
      }
      const isUiCall = UI_CALLS.has(name) || name === 'toast' || name.startsWith('toast.')
      if (isUiCall) {
        const args = name === 'translate' ? node.arguments.slice(1, 2) : node.arguments.slice(0, 1)
        for (const a of args) {
          const text = literalText(a)
          if (text != null) push(a, 'call', text)
        }
      }
    }
    if (isDict) {
      const text = literalText(node)
      if (text != null && !ts.isImportDeclaration(node.parent)) push(node, 'dict', text)
    } else if (rel.endsWith('.tsx')) {
      if (ts.isJsxText(node)) push(node, 'jsx', node.text.replace(/\s+/g, ' ').trim())
      if (ts.isJsxAttribute(node) && node.initializer && node.name.getText(sf) !== 'className') {
        const init = node.initializer
        const text = ts.isStringLiteral(init) ? init.text : ts.isJsxExpression(init) && init.expression ? literalText(init.expression) : null
        if (text != null) push(node, 'attr', text)
      }
      if (ts.isJsxExpression(node) && node.expression && ts.isJsxElement(node.parent)) {
        const text = literalText(node.expression)
        if (text != null) push(node, 'jsx', text)
      }
      if (ts.isPropertyAssignment(node) && UI_PROPS.has(node.name.getText(sf).replace(/['"]/g, ''))) {
        const text = literalText(node.initializer)
        if (text != null) push(node, 'prop', text)
      }
    } else if (isApi) {
      if (ts.isPropertyAssignment(node) && node.name.getText(sf) === 'error') {
        const text = literalText(node.initializer)
        if (text != null) push(node, 'prop', text)
      }
    }
    ts.forEachChild(node, (c) => visit(c, inConsole))
  }
  visit(sf, false)
  return out
}

function allUiStrings(): Found[] {
  const out: Found[] = []
  for (const file of walk(SRC)) {
    const rel = path.relative(ROOT, file)
    if (EXCLUDED.some((ex) => rel === ex || rel.startsWith(ex))) continue
    out.push(...uiStringsOf(file))
  }
  return out
}

function report(items: Found[], limit = 40): string {
  const lines = items.slice(0, limit).map((f) => `  ${f.file}:${f.line} [${f.kind}] ${JSON.stringify(f.text.slice(0, 90))}`)
  return `${items.length}건\n${lines.join('\n')}${items.length > limit ? `\n  … ${items.length - limit}건 더` : ''}`
}

/** 문구 안의 소문자 단계 이름 — 식별자(_ . / - : = 따옴표 인접)는 제외한 낱말 단위. */
function lowercaseStageWords(text: string): string[] {
  if (!/\s/.test(text.trim())) return [] // 한 낱말 토큰(stage="producer" 같은 enum 값)은 문구가 아니다
  // 대괄호 태그([writer] 같은 로그 액터 표기)는 식별자로 본다.
  const re = new RegExp(`(^|[^A-Za-z0-9_./:=\\-'"\`@\\[])(${STAGE_WORDS.join('|')})(?=$|[^A-Za-z0-9_./:=\\-'"\`@\\]])`, 'g')
  const hits: string[] = []
  for (const m of text.matchAll(re)) hits.push(m[2])
  return hits
}

/** 소문자 브랜드는 고유명이라 그대로 둔다(copy-style.md 예외). */
const LOWERCASE_BRANDS = ['fal']
function lowerStartViolation(text: string): boolean {
  const t = text.trim()
  // 한 낱말짜리 토큰(단위·식별자·CSS 값)은 문장이 아니다.
  if (!/\s/.test(t)) return false
  if (!/^[a-z]/.test(t)) return false
  const first = t.split(/\s/)[0]
  if (LOWERCASE_BRANDS.includes(first.replace(/[^a-z]/g, ''))) return false
  return true
}

const STRINGS = allUiStrings()

// 작업 목록 덤프: DUMP_COPY_VIOLATIONS=<json 경로> pnpm vitest run tests/promise-a-copy-rules.test.ts
if (process.env.DUMP_COPY_VIOLATIONS) {
  const dump = {
    dash: STRINGS.filter((s) => DASH.test(s.text)),
    lowerStart: STRINGS.filter((s) => lowerStartViolation(s.text)),
    stageWord: STRINGS.filter((s) => lowercaseStageWords(s.text).length > 0),
  }
  writeFileSync(process.env.DUMP_COPY_VIOLATIONS, JSON.stringify(dump, null, 1))
}

describe('약속 A — 화면 문구 규칙', () => {
  it('한국어와 영어 화면 문구 전체에 긴 대시(—·–·―)가 하나도 없다', () => {
    const bad = STRINGS.filter((s) => DASH.test(s.text))
    expect(bad, `대시가 남은 화면 문구:\n${report(bad)}`).toEqual([])
  })

  it('화면 문구의 영어는 문장 첫 글자가 대문자이고 단계 고유명(Writer 등)은 어디서든 대문자다', () => {
    const lowerStart = STRINGS.filter((s) => lowerStartViolation(s.text))
    const stage = STRINGS.filter((s) => lowercaseStageWords(s.text).length > 0)
    const bad = [...lowerStart, ...stage]
    expect(bad, `첫 글자 소문자 또는 소문자 단계 이름:\n${report(bad)}`).toEqual([])
  })

  it('Producer 보드 카드의 출처 표시는 "writer"가 아니라 "Writer"로 적힌다', () => {
    const board = path.join(ROOT, 'src', 'features', 'producer', 'readiness-board.tsx')
    const found = uiStringsOf(board).filter((s) => s.text.trim() === 'writer' || s.text.trim() === 'Writer')
    expect(found.some((s) => s.text.trim() === 'writer'), `소문자 writer 배지:\n${report(found)}`).toBe(false)
    expect(found.some((s) => s.text.trim() === 'Writer'), '출처 배지 "Writer" 가 없다').toBe(true)
  })

  it('AI 답변 안에 단계 이름이 소문자로 들어 있어도 화면에는 첫 글자가 대문자로 보인다', () => {
    expect(polishAssistantProse('이제 writer 단계로 넘어갈게요')).toBe('이제 Writer 단계로 넘어갈게요')
    expect(polishAssistantProse('Open the director tab, then the artist tab.')).toBe('Open the Director tab, then the Artist tab.')
    expect(polishAssistantProse('producer가 확정한 인물')).toBe('Producer가 확정한 인물')
    // 식별자·경로·이메일은 건드리지 않는다.
    expect(polishAssistantProse('writer_runs 테이블과 /studio/writer?projectId=1 과 writer@tale.studio')).toBe(
      'writer_runs 테이블과 /studio/writer?projectId=1 과 writer@tale.studio',
    )
    expect(polishAssistantProse('`writer` 키')).toBe('`writer` 키')
  })

  it('위 대문자 처리는 과거에 저장된 채팅에도 적용된다 — 저장본이 아니라 그릴 때 바꾼다', () => {
    // 렌더러가 처리하므로 언제 저장된 메시지든 화면에서는 같다.
    expect(renderInlineMarkdown('writer 단계 완료')).toContain('Writer 단계 완료')
    expect(renderInlineMarkdown('**writer** 단계')).toContain('Writer 단계')
  })

  it('AI에게 주는 안내문(채팅 시스템 프롬프트) 안에 소문자 단계 이름이 없다', () => {
    const promptFiles = walk(SRC).filter((f) => {
      const rel = path.relative(ROOT, f)
      return /^src[\\/]app[\\/]api[\\/][a-z]+[\\/]chat[\\/]/.test(rel) || rel === path.join('src', 'lib', 'prompts.ts')
    })
    const bad: Found[] = []
    for (const file of promptFiles) {
      const rel = path.relative(ROOT, file)
      const source = readFileSync(file, 'utf8')
      const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
      const visit = (node: ts.Node) => {
        const text = literalText(node)
        // 산문만: 공백이 있는 문자열. 'writer' 같은 단독 식별자 리터럴은 코드다.
        if (text != null && /\s/.test(text) && lowercaseStageWords(text).length) {
          for (const [i, line] of text.split('\n').entries()) {
            if (lowercaseStageWords(line).length) {
              bad.push({ file: rel, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 + i, text: line.trim(), kind: 'prop' })
            }
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(sf)
    }
    expect(bad, `프롬프트 산문의 소문자 단계 이름:\n${report(bad)}`).toEqual([])
  })

  it('AI 답변에 긴 대시가 들어 있으면 화면에 보일 때 지운다', () => {
    expect(polishAssistantProse('씬 확정 — 인물 설계를 시작해요')).toBe('씬 확정, 인물 설계를 시작해요')
    expect(polishAssistantProse('Done—next step')).toBe('Done, next step')
    expect(polishAssistantProse('3–5초 정도')).toBe('3-5초 정도')
    expect(polishAssistantProse('이미 쉼표가 있어요, — 그래도')).toBe('이미 쉼표가 있어요, 그래도')
    expect(renderInlineMarkdown('A — B')).toBe('A, B')
    // 구분선 전용 줄(———)은 기존 규칙대로 통째로 걷는다.
    expect(renderInlineMarkdown('위\n———\n아래')).toBe('위\n\n아래')
  })
})
