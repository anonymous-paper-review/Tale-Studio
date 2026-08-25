// 방식 (가) — 조건 목록 항목의 출처를 추적하는 정적 검사 (감사용 프로토타입).
//
// 원본: research/experiments/unstable-hook-deps-detector/detector.mjs
// (야간 조사 초안, .claude/vault/backlog/tickets/audit-unstable-hook-deps-detector-2026-08-24.md 참고)
// tests/ 가 research/ 디렉터리에 의존하지 않도록 이 파일로 그대로 복사·정리했다. 로직은 원본과 동일.
//
// 무엇을 하는가:
//   1) src/** 안의 `export function use*` / `export const use*` 훅 정의를 전부 찾는다
//      (zustand `create(...)` 스토어는 제외 — 티켓 전제상 안전).
//   2) 각 훅의 "자기 스코프" return 문(중첩 함수·이펙트 콜백 내부의 return 은 제외)을 보고
//      - 반환 타입 주석이 원시값(boolean/string/number/void) 이면 SAFE
//      - useCallback(...)/useMemo(...) 로만 감싸 반환하면 SAFE
//      - 객체/배열/함수 리터럴을 메모 없이 직접 반환하면 UNSAFE (확정)
//      - 다른 훅 호출을 그대로 반환하거나 식별자만 반환하면 UNKNOWN (재귀 추적 안 함 — 사람 판단 필요)
//   3) UNSAFE/UNKNOWN 훅이 `const x = useHook(...)` 형태로 바인딩되고, 그 x 가 어떤 훅 조건
//      목록([...]) 안에 등장하면 finding 으로 보고한다.
//
// 왜 두 단계(첫 시도는 버그였다):
//   최초 버전은 함수 바디 전체에서 `return` 키워드를 스코프 구분 없이 긁어, useEffect 안의
//   cleanup 함수(`return () => {...}`)까지 "훅의 반환값"으로 오인해 useEditorPlayback·
//   useIdleTimeout 등 실제로는 void 인 훅 4곳을 오탐했다. 이 버전은 중괄호 깊이 + 함수 스코프
//   판정으로 그 오탐을 없앴다 — 즉 "간단한 정규식"으로는 안 되고 최소한의 스코프 추적이 필요하다는
//   것 자체가 이 방식의 비용이다.
//
// 한계 (자동 해소 불가, 사람 판단 필요한 UNKNOWN 사례 — 2026-08-25 확인 3건):
//   - useContentLocale: `project ?? ui` 처럼 다른 훅 호출의 조합을 반환 — 원시값인지 정적으로 불명
//   - useActiveGenerationJobs: useSyncExternalStore(...) 를 그대로 반환 — 그 결과가 안정적인지는
//     getSnapshot 구현을 봐야 안다(이 저장소는 모듈 변수를 그대로 반환해 안전 — 수동 확인 완료)
//   - useLocale / useRoughStoryboard 계열: 다른 커스텀 훅을 그대로 반환 — 재귀 추적 없음
//
// 사용:
//   import { runDetector } from './unstable-hook-deps-detector.mjs'
//   runDetector('src')  (반드시 저장소 루트에서, cwd 기준 src/ 를 읽는다)

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir, files = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, files)
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(p)
  }
  return files
}

function extractBody(src, declStartIdx) {
  const braceStart = src.indexOf('{', declStartIdx)
  if (braceStart === -1) return null
  let depth = 0
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return { body: src.slice(braceStart, i + 1), braceStart }
    }
  }
  return null
}

// 기존 tests/editor-render-loop-guard.test.ts 의 depArrays 와 동일한 정규식(재사용).
function depArrays(source) {
  const out = []
  const re = /[)}]\s*,\s*\[([^\][]*)\]\s*,?\s*\)/g
  let m
  while ((m = re.exec(source)) !== null) {
    out.push(m[1].split(',').map((d) => d.trim()).filter(Boolean))
  }
  return out
}

// body: 훅 자신의 함수 바디 문자열('{' 부터 '}' 까지).
// depth==1(자기 자신 스코프) 안에 있는 return 문만 수집한다. 화살표/function 이 여는 중괄호는
// 새 스코프로 처리해 그 안의 return 은 제외한다. if/for/while/switch/try/catch/객체 리터럴이
// 여는 중괄호는 투명 취급(같은 함수 스코프 유지).
function topLevelReturns(body) {
  const returns = []
  let depth = 0
  const funcScopeDepths = new Set()
  let i = 0
  while (i < body.length) {
    const ch = body[i]
    if (ch === '{') {
      depth++
      const before = body.slice(0, i).trimEnd()
      const isArrow = /=>\s*$/.test(before)
      const isFunctionKw =
        /\bfunction\b\s*(\*)?\s*[\w$]*\s*\([^()]*\)\s*$/.test(before) ||
        /\bfunction\b\s*(\*)?\s*[\w$]*\s*\([^()]*\)\s*:\s*[\w<>[\], |&]*\s*$/.test(before)
      if (isArrow || isFunctionKw) funcScopeDepths.add(depth)
      i++
      continue
    }
    if (ch === '}') {
      funcScopeDepths.delete(depth)
      depth--
      i++
      continue
    }
    if (ch === '"' || ch === "'") {
      const quote = ch
      i++
      while (i < body.length && body[i] !== quote) {
        if (body[i] === '\\') i++
        i++
      }
      i++
      continue
    }
    if (ch === '`') {
      i++
      while (i < body.length && body[i] !== '`') {
        if (body[i] === '\\') i++
        i++
      }
      i++
      continue
    }
    if (ch === '/' && body[i + 1] === '/') {
      while (i < body.length && body[i] !== '\n') i++
      continue
    }
    if (ch === '/' && body[i + 1] === '*') {
      i += 2
      while (i < body.length && !(body[i] === '*' && body[i + 1] === '/')) i++
      i += 2
      continue
    }
    const insideNestedFunc = [...funcScopeDepths].some((d) => d <= depth && d >= 2)
    if (
      !insideNestedFunc &&
      body.startsWith('return', i) &&
      /[\s(;]/.test(body[i - 1] ?? ' ') &&
      /[\s;]/.test(body[i + 6] ?? ' ')
    ) {
      const rest = body.slice(i + 6).trimStart()
      const end = rest.search(/[\n;]/)
      returns.push((end === -1 ? rest : rest.slice(0, end)).trim())
    }
    i++
  }
  return returns
}

function classifyHook(body, returnTypeAnnotation) {
  if (returnTypeAnnotation && /^(boolean|string|number|void)\b/.test(returnTypeAnnotation.trim())) {
    return { safe: true, reason: `반환 타입 주석이 원시값(${returnTypeAnnotation.trim()})` }
  }
  const returns = topLevelReturns(body)
  if (returns.length === 0) return { safe: true, reason: '자기 스코프 return 없음 (void 훅)' }

  let allMemoized = true
  for (const r of returns) {
    if (r === '') continue
    if (/^useCallback\(|^useMemo\(/.test(r)) continue
    allMemoized = false
    if (/^\{/.test(r) || /^\[/.test(r) || /^\(?[\w\s,{}:]*\)?\s*=>/.test(r) || /^function\b/.test(r)) {
      return { safe: false, reason: `메모 없이 리터럴 직접 반환: "${r.slice(0, 70)}"` }
    }
    if (/^use[A-Z]\w*\(/.test(r)) {
      return { safe: 'unknown', reason: `다른 훅 호출을 그대로 반환: "${r.slice(0, 70)}" (재귀 미추적)` }
    }
  }
  if (allMemoized) return { safe: true, reason: '모든 자기-스코프 return 이 useCallback/useMemo' }
  return { safe: 'unknown', reason: `식별자/표현식 반환 — 정적 추적 한계: "${returns[0].slice(0, 70)}"` }
}

export function runDetector(srcRoot = 'src') {
  const files = walk(srcRoot)
  const hookDefRe = /^export (?:function|const) (use[A-Z]\w*)/gm
  const hookClassification = {}

  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    const re = new RegExp(hookDefRe.source, 'gm')
    let m
    while ((m = re.exec(src)) !== null) {
      const name = m[1]
      const startIdx = m.index
      const afterDecl = src.slice(startIdx, startIdx + 200)
      if (/=\s*create[<(]/.test(afterDecl)) continue // zustand 스토어 — 별도 취급(전제상 안전)
      const extracted = extractBody(src, startIdx)
      if (!extracted) continue
      const sigMatch = src.slice(startIdx, extracted.braceStart).match(/\)\s*:\s*([^{=]+?)\s*$/)
      const returnType = sigMatch ? sigMatch[1] : null
      const cls = classifyHook(extracted.body, returnType)
      hookClassification[name] = { ...cls, file: f }
    }
  }

  const unsafe = Object.entries(hookClassification).filter(([, v]) => v.safe === false).map(([k]) => k)
  const unknown = Object.entries(hookClassification).filter(([, v]) => v.safe === 'unknown').map(([k]) => k)

  const findings = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    for (const hookName of [...unsafe, ...unknown]) {
      const bindRe = new RegExp(`const\\s+(\\w+)\\s*=\\s*${hookName}\\(`, 'g')
      let bm
      while ((bm = bindRe.exec(src)) !== null) {
        const varName = bm[1]
        const arrays = depArrays(src)
        if (arrays.some((deps) => deps.includes(varName))) {
          findings.push({ file: f, hookName, varName, status: unsafe.includes(hookName) ? 'unsafe' : 'unknown' })
        }
      }
    }
  }

  return { hookClassification, findings }
}
