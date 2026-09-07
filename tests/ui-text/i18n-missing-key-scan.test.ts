import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { KO } from '@/lib/i18n/messages-ko'
import { translate } from '@/lib/i18n/translate'

// 사전 누락 게이트 — i18n-korean-scan 의 반대 방향.
//
//   기존 스캐너는 "코드에 한글이 하드코딩돼 있나"를 본다. 그건 영어화 진행도를 재는 지표다.
//   이 시험은 반대를 본다 — **t('...') 로 부르는데 한국어 사전에 없는 키**.
//
//   왜 따로 필요한가: translate() 는 사전에 없으면 `KO[text] ?? text` 로 영어 원문을 그대로
//   돌려준다. 화면은 멀쩡히 뜨고 오류도 없어서, 한국어 화면에 영어가 섞여도 아무도 모른다.
//   2026-08-28 실측에서 이렇게 조용히 새던 키가 15개 있었다(Director 상단 "Generate
//   storyboard", 프로젝트 만들기 화면의 참조 프로젝트 문구 등). 조용한 실패는 반복된다.
//
//   범위: 문자열 리터럴만으로 이뤄진 호출. 변수·템플릿이 섞인 동적 키는 정적으로 판정할 수
//   없어 건너뛴다(그건 이 시험이 잡을 수 있는 종류가 아니다).

const SRC = path.join(process.cwd(), 'src')
const SKIP = ['src/lib/i18n/messages-ko.ts']

/** 영어 원문이 곧 표시값이라 사전 항목이 불필요한 키. 제품 고유명사만 둔다. */
const INTENTIONAL_ENGLISH = new Set<string>([])

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** 여는 괄호 다음부터 깊이 0 의 ',' 또는 ')' 까지 — 따옴표 안은 건너뛴다. */
function readArg(text: string, start: number): { arg: string; end: number } {
  let depth = 0
  let i = start
  while (i < text.length) {
    const ch = text[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      i += 1
      while (i < text.length && text[i] !== quote) i += text[i] === '\\' ? 2 : 1
      i += 1
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) return { arg: text.slice(start, i), end: i }
      depth -= 1
    } else if (ch === ',' && depth === 0) return { arg: text.slice(start, i), end: i }
    i += 1
  }
  return { arg: text.slice(start, i), end: i }
}

const LITERAL = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g

/** 리터럴(이어붙이기 포함)만으로 된 인자면 합친 키, 아니면 null. */
function staticKey(arg: string): string | null {
  const parts = [...arg.matchAll(LITERAL)].map((m) => m[1] ?? m[2])
  if (parts.length === 0) return null
  const residue = arg.replace(LITERAL, '').replace(/\+/g, '').trim()
  if (residue) return null
  return parts
    .join('')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\')
}

/** const 선언 시작점에서 리터럴(이어붙이기 포함) 초기값만 읽는다. */
function readStaticConstant(text: string, start: number): string | null {
  let i = start
  let value = ''

  while (true) {
    while (/\s/.test(text[i] ?? '')) i += 1
    const quote = text[i]
    if (quote !== "'" && quote !== '"') return null

    const literalStart = i
    i += 1
    while (i < text.length && text[i] !== quote) i += text[i] === '\\' ? 2 : 1
    if (i === text.length) return null
    i += 1
    const literal = staticKey(text.slice(literalStart, i))
    if (literal === null) return null
    value += literal

    let hasNewline = false
    while (/\s/.test(text[i] ?? '')) {
      hasNewline ||= text[i] === '\n' || text[i] === '\r'
      i += 1
    }
    if (text[i] === '+') {
      i += 1
      continue
    }
    return text[i] === ';' || hasNewline || i === text.length ? value : null
  }
}

/** 파일 안에서 리터럴(이어붙이기 포함)만으로 선언한 const 문자열. */
function staticConstants(text: string): Map<string, string> {
  const constants = new Map<string, string>()
  for (const match of text.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*/g)) {
    const value = readStaticConstant(text, match.index! + match[0].length)
    if (value !== null) constants.set(match[1], value)
  }
  return constants
}

function keyFromArg(arg: string, constants: Map<string, string>): string | null {
  return staticKey(arg) ?? constants.get(arg.trim()) ?? null
}

function collectCalls(): Map<string, Set<string>> {
  const calls = new Map<string, Set<string>>()
  const record = (key: string, file: string) => {
    const at = calls.get(key) ?? new Set<string>()
    at.add(path.relative(process.cwd(), file))
    calls.set(key, at)
  }

  for (const file of walk(SRC)) {
    const rel = path.relative(process.cwd(), file)
    if (SKIP.includes(rel)) continue
    const text = readFileSync(file, 'utf8')
    const constants = staticConstants(text)

    for (const m of text.matchAll(/\bt\(/g)) {
      const key = keyFromArg(readArg(text, m.index! + m[0].length).arg, constants)
      if (key) record(key, file)
    }
    // translate(locale, '...') — 둘째 인자가 키
    for (const m of text.matchAll(/\btranslate\(/g)) {
      const first = readArg(text, m.index! + m[0].length)
      const key = keyFromArg(readArg(text, first.end + 1).arg, constants)
      if (key) record(key, file)
    }
  }
  return calls
}

describe('i18n — 사전 누락 게이트', () => {
  it('t()/translate() 로 부르는 정적 키가 한국어 사전에 전부 있다', () => {
    const missing: string[] = []
    for (const [key, files] of collectCalls()) {
      if (key in KO || INTENTIONAL_ENGLISH.has(key)) continue
      missing.push(`${JSON.stringify(key)}  ←  ${[...files].sort().join(', ')}`)
    }

    expect(
      missing.sort(),
      `한국어 사전에 없는 키 ${missing.length}개 — 한국어 화면에 영어가 그대로 나옵니다.\n` +
        `src/lib/i18n/messages-ko.ts 에 추가하거나, 영어 표기가 의도면 INTENTIONAL_ENGLISH 에 등록하세요.\n\n` +
        missing.sort().join('\n'),
    ).toEqual([])
  })

  it('스캐너가 실제로 키를 찾아낸다 (빈 결과로 통과하는 것 방지)', () => {
    // 스캐너가 고장나 0건을 수집하면 위 시험이 언제나 통과한다 — 그 사각지대를 막는다.
    expect(collectCalls().size).toBeGreaterThan(300)
  })

  it('이어붙인 문자열도 한 키로 합쳐 본다', () => {
    expect(staticKey("'Scene and shot work is done.\\n\\n' + '· Edit here'")).toBe(
      'Scene and shot work is done.\n\n· Edit here',
    )
  })

  it('정적 문자열 상수도 실제 키로 해석한다', () => {
    const constants = staticConstants("const NAME = 'Scene ' +\n  'name'")

    expect(keyFromArg('NAME', constants)).toBe('Scene name')
  })

  it('변수가 섞인 동적 키는 판정하지 않는다', () => {
    expect(staticKey("someVar")).toBeNull()
    expect(staticKey("'prefix' + someVar")).toBeNull()
    expect(staticConstants("const NAME = 'prefix' + someVar").has('NAME')).toBe(false)
    expect(staticConstants("const NAME = makeKey()").has('NAME')).toBe(false)
  })

  it('한국어 프로젝트의 첫 Producer 안내는 한국어로 나온다', () => {
    const producerPage = readFileSync(path.join(SRC, 'app/studio/producer/page.tsx'), 'utf8')
    const welcomeKey = staticConstants(producerPage).get('PRODUCER_WELCOME_KEY')

    expect(welcomeKey).toBeTypeOf('string')
    if (!welcomeKey) throw new Error('PRODUCER_WELCOME_KEY 정적 문자열 상수를 찾지 못했습니다.')
    expect(welcomeKey in KO).toBe(true)
    expect(translate('ko', welcomeKey)).toMatch(/[가-힣]/)
  })
})
