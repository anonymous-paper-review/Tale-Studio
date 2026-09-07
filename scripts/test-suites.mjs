#!/usr/bin/env node

import { readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = process.cwd()
const TEST_ROOT = path.join(ROOT, 'tests')
const TEST_FILE_RE = /\.test\.(?:ts|tsx)$/
const MANUAL_RE = /\.manual\.test\.(?:ts|tsx)$/
const EXPERIMENTAL_RE = /(?:_experiment|\.experiment)\.test\.(?:ts|tsx)$/

async function collectTests(dir = TEST_ROOT) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectTests(absolute)))
    } else if (entry.isFile() && TEST_FILE_RE.test(entry.name)) {
      files.push(path.relative(ROOT, absolute).split(path.sep).join('/'))
    }
  }
  return files.sort()
}

const isManual = (file) => MANUAL_RE.test(file)
const isExperimental = (file) => EXPERIMENTAL_RE.test(file)
const isAutomated = (file) => !isManual(file) && !isExperimental(file)

const DOMAIN_PATTERNS = {
  writer:
    /(?:^|\/)(?:writer-|rough-|pipeline\/|pipeline-|stage-|shot-|v2design-|motion-|storyboard-|prompt-trace|facet-render|camera-contract|adherence-core|writer-ui|writer-status|writer-v0|writer-n1|writer-chat|writer-dialogue|writer-lane|writer-persist|writer-rerun|writer-start|writer-shotcheck|writer-duration|writer-previz)/i,
  producer:
    /(?:^|\/)(?:producer-|parse-extracted|cast-slug|content-safety|output-language|handoff-|card-mention|chat-choices|chat-persistence|pending-proposal|producer-ref|reference-|produce-reference|project-reference)/i,
  artist:
    /(?:^|\/)(?:artist-|image-|turnaround|classify-image|draft-trigger|template-asset|style-anchor|fal-image-size|fal-model|fal-media|asset-)/i,
  director:
    /(?:^|\/)(?:director-|build-video|real-grid|video-|camera-|motion-contract)/i,
  editor: /(?:^|\/)(?:editor-|export-|media-|storage-|upload-)/i,
  security:
    /(?:\.red-team\.test\.|(?:^|\/)(?:api-project-access-guard|admin-gate|action-guard|demo-seam|generation-jobs-terminal)\.test\.)/i,
  reference: /(?:^|\/)(?:reference-|produce-reference|project-reference)/i,
}

const DOMAIN_NAMES = ['writer', 'producer', 'artist', 'director', 'editor', 'security', 'reference']
const inAnyDomain = (file) => DOMAIN_NAMES.some((name) => DOMAIN_PATTERNS[name].test(file))

const SUITES = {
  core: {
    description: '제품 코드의 빠른 자동 회귀 테스트 — 수동·실험 테스트 제외',
    pick: isAutomated,
  },
  writer: {
    description: 'Writer 파이프라인·러프 previz·샷·단계 전환',
    pick: (file) => isAutomated(file) && DOMAIN_PATTERNS.writer.test(file),
  },
  producer: {
    description: 'Producer 입력·게이트·핸드오프·참조 가져오기',
    pick: (file) => isAutomated(file) && DOMAIN_PATTERNS.producer.test(file),
  },
  artist: {
    description: 'Artist 이미지·자산·출처·생성 실패 처리',
    pick: (file) => isAutomated(file) && DOMAIN_PATTERNS.artist.test(file),
  },
  director: {
    description: 'Director 캔버스·샷·영상 생성',
    pick: (file) => isAutomated(file) && DOMAIN_PATTERNS.director.test(file),
  },
  editor: {
    description: 'Editor·내보내기·미디어 저장',
    pick: (file) => isAutomated(file) && DOMAIN_PATTERNS.editor.test(file),
  },
  security: {
    description: '권한·입력 경계·red-team 방어 회귀',
    pick: (file) => isAutomated(file) && DOMAIN_PATTERNS.security.test(file),
  },
  reference: {
    description: '참조 프로젝트 가져오기 계약',
    pick: (file) => isAutomated(file) && DOMAIN_PATTERNS.reference.test(file),
  },
  unsorted: {
    description: 'core 에 들어가지만 어느 도메인 스위트에도 안 잡히는 테스트 — 분류 부채',
    pick: (file) => isAutomated(file) && !inAnyDomain(file),
  },
  manual: {
    description: '실제 API·Fal·라이브 스키마가 필요한 수동 테스트',
    pick: isManual,
  },
  experimental: {
    description: '실험용 파이프라인 검증 — 기본 테스트에 포함하지 않음',
    pick: isExperimental,
  },
}

function printSuiteSummary(files) {
  for (const [name, suite] of Object.entries(SUITES)) {
    const count = files.filter(suite.pick).length
    console.log(`${name.padEnd(12)} ${String(count).padStart(3)} files  ${suite.description}`)
  }
}

// ── 원장(--ledger) — 오너가 코드를 읽지 않고도 "무슨 테스트가 있나"를 파악하는 표면 ──
// 정본은 tests/ 자체다. 이 출력은 스냅샷이며 저장소에 커밋하지 않는다(CLAUDE.md 진실원 원칙).
// 파일마다: 머리말 첫 줄(파일 첫 주석) · 케이스 수 · 케이스 이름(it/test 첫 인자).
const CASE_RE = /^\s*(?:it|test)(?:\.\w+)*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/gm
// it.each([...])('이름 %s') — 표 주도 케이스. 이름은 배열 닫힌 뒤에 온다. 원장에는 1건으로 세고 (표) 표시.
const EACH_RE = /^\s*(?:it|test)\.each\([\s\S]*?\]\s*\)\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/gm

function headline(source) {
  const lines = source.split('\n')
  const first = lines.find((line) => line.trim())
  if (!first) return null
  const trimmed = first.trim()
  if (trimmed.startsWith('//')) return trimmed.replace(/^\/\/\s?/, '').trim() || null
  if (trimmed.startsWith('/*')) {
    const inner = trimmed.replace(/^\/\*+\s?/, '').replace(/\*\/\s*$/, '').trim()
    if (inner) return inner
    const next = lines.slice(1).find((line) => line.trim())
    return next ? next.replace(/^\s*\*\s?/, '').trim() || null : null
  }
  return null
}

async function describeFile(file) {
  const source = await readFile(path.join(ROOT, file), 'utf8')
  const cases = [
    ...[...source.matchAll(CASE_RE)].map((m) => ({ index: m.index, name: m[2] })),
    ...[...source.matchAll(EACH_RE)].map((m) => ({ index: m.index, name: `${m[2]} (표)` })),
  ]
    .sort((a, b) => a.index - b.index)
    .map((c) => c.name)
  const domains = DOMAIN_NAMES.filter((name) => DOMAIN_PATTERNS[name].test(file))
  return { file, headline: headline(source), cases, domains }
}

async function printLedger(files) {
  // 파일은 첫 소속 묶음에 한 번만 실고, 다른 묶음에도 속하면 제목에 표기한다.
  // 요약표의 수치는 스위트 실행 단위(pnpm test:<묶음>)와 같게 겹침을 포함한다.
  const ledgerSuites = [...DOMAIN_NAMES, 'unsorted', 'manual', 'experimental']
  const entries = new Map(await Promise.all(files.map(async (file) => [file, await describeFile(file)])))
  const seen = new Set()
  const sections = []
  for (const name of ledgerSuites) {
    const all = files.filter(SUITES[name].pick)
    const placed = all.filter((file) => !seen.has(file))
    placed.forEach((file) => seen.add(file))
    sections.push({
      name,
      description: SUITES[name].description,
      fileCount: all.length,
      caseCount: all.reduce((m, file) => m + entries.get(file).cases.length, 0),
      entries: placed.map((file) => entries.get(file)),
    })
  }
  const total = [...entries.values()].reduce((n, e) => n + e.cases.length, 0)
  const noHeadline = [...entries.values()].filter((e) => !e.headline).length

  const out = []
  out.push(`# 테스트 원장 — ${new Date().toISOString().slice(0, 10)}`)
  out.push('')
  out.push(`파일 ${files.length} · 케이스 ${total}(정적 계수 — 반복·표 주도 케이스는 1로 잼) · 머리말 없는 파일 ${noHeadline}`)
  out.push('')
  out.push('한 파일이 여러 묶음에 속하면 아래 표에서는 각각 세고, 본문에서는 첫 묶음에 한 번만 실고 제목에 다른 소속을 적는다.')
  out.push('')
  out.push('| 묶음 | 파일 | 케이스 | 설명 |')
  out.push('|---|---:|---:|---|')
  for (const s of sections) out.push(`| ${s.name} | ${s.fileCount} | ${s.caseCount} | ${s.description} |`)
  for (const s of sections) {
    if (s.entries.length === 0) continue
    out.push('')
    out.push(`## ${s.name} — ${s.description}`)
    for (const e of s.entries) {
      const also = e.domains.filter((d) => d !== s.name)
      out.push('')
      out.push(`### ${e.file} (${e.cases.length})${also.length ? ` — ${also.join(', ')} 에도 속함` : ''}`)
      out.push(e.headline ? `> ${e.headline}` : '> (머리말 없음)')
      for (const c of e.cases) out.push(`- ${c}`)
    }
  }
  console.log(out.join('\n'))
}

const args = process.argv.slice(2)
const suiteName = args.find((arg) => !arg.startsWith('-')) ?? 'core'
const listOnly = args.includes('--list')
const files = await collectTests()

if (args.includes('--ledger')) {
  await printLedger(files)
  process.exit(0)
}

if (listOnly && !args.some((arg) => !arg.startsWith('-'))) {
  printSuiteSummary(files)
  process.exit(0)
}

const suite = SUITES[suiteName]
if (!suite) {
  console.error(`Unknown test suite: ${suiteName}`)
  printSuiteSummary(files)
  process.exit(1)
}

const selected = files.filter(suite.pick)
if (selected.length === 0) {
  console.error(`No tests matched suite: ${suiteName}`)
  process.exit(1)
}

console.log(`[test:${suiteName}] ${selected.length} files — ${suite.description}`)
if (listOnly) {
  console.log(selected.join('\n'))
  process.exit(0)
}

if (suiteName === 'manual' && process.env.RUN_LIVE_TESTS !== '1') {
  console.error('[test:manual] 실제 API/Fal 비용이 발생할 수 있습니다. RUN_LIVE_TESTS=1 을 명시하세요.')
  process.exit(2)
}

// ── 빨간 약속 판정 카드 — 실패 시 자동 출력 (.claude/rules/tdd.md "빨간불 판정") ──
// 오너가 코드 없이 "코드가 틀렸나 / 약속이 바뀌었나 / 약속이 없어졌나"만 고를 수 있게
// 파일 머리말 · 케이스 이름(=약속 문장) · 실제 결과 첫 줄만 보여준다. 스택·구현 용어는 위의 vitest 출력에 있다.
const JSON_OUT = path.join(os.tmpdir(), `tale-studio-vitest-${process.pid}.json`)

function firstLine(message) {
  const line = String(message ?? '').split('\n').find((l) => l.trim()) ?? ''
  return line.replace(/^\w*Error:\s*/, '').replace(/\s*\/\/ Object\.is equality$/, '').trim()
}

async function printTriage() {
  let report
  try {
    report = JSON.parse(await readFile(JSON_OUT, 'utf8'))
  } catch {
    return
  } finally {
    await rm(JSON_OUT, { force: true })
  }
  const failed = []
  for (const fileResult of report.testResults ?? []) {
    const file = path.relative(ROOT, fileResult.name).split(path.sep).join('/')
    const cases = (fileResult.assertionResults ?? []).filter((c) => c.status === 'failed')
    if (cases.length === 0 && fileResult.status !== 'failed') continue
    let head = null
    try {
      head = headline(await readFile(path.join(ROOT, file), 'utf8'))
    } catch {}
    failed.push({ file, head, cases, message: cases.length === 0 ? fileResult.message : null })
  }
  if (failed.length === 0) return
  const count = failed.reduce((n, f) => n + Math.max(f.cases.length, 1), 0)
  const out = ['', `━━ 빨간 약속 ${count}건 — 판정은 오너 몫, 셋 중 하나 ━━`]
  out.push('  ① 코드가 틀렸다 → 약속 유지, 코드를 고친다 (기본값 — 에이전트가 바로)')
  out.push('  ② 약속이 바뀌었다 → 문장을 고친다 (오너 판정 뒤에만)')
  out.push('  ③ 약속이 없어졌다 → 지운다 (오너 판정 뒤에만)')
  for (const f of failed) {
    out.push('', `${f.file} — ${f.head ?? '(머리말 없음)'}`)
    if (f.cases.length === 0) {
      out.push(`  · 파일 자체가 안 돌았다: ${firstLine(f.message)}`)
      continue
    }
    for (const c of f.cases) {
      out.push(`  · 약속: ${c.title}`)
      out.push(`    실제: ${firstLine(c.failureMessages?.[0]) || '(메시지 없음)'}`)
    }
  }
  out.push('')
  console.log(out.join('\n'))
}

const result = spawnSync(
  'pnpm',
  [
    'exec', 'vitest', 'run', ...selected,
    '--reporter=default', '--reporter=json', `--outputFile.json=${JSON_OUT}`,
    ...args.filter((arg) => arg.startsWith('-')),
  ],
  { cwd: ROOT, stdio: 'inherit' },
)
if (result.status !== 0) await printTriage()
else await rm(JSON_OUT, { force: true })
process.exit(result.status ?? 1)
