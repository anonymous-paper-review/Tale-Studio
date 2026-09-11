#!/usr/bin/env node

import { readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = process.cwd()
const TEST_ROOT = path.join(ROOT, 'tests')
const TEST_FILE_RE = /\.test\.(?:ts|tsx)$/
const MANUAL_RE = /\.manual\.test\.(?:ts|tsx)$/

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

const RED_TEAM_RE = /\.red-team\.test\.(?:ts|tsx)$/

const isManual = (file) => MANUAL_RE.test(file)
const isAutomated = (file) => !isManual(file)
const isRedTeam = (file) => RED_TEAM_RE.test(file)

// 묶음 = 폴더. tests/<폴더>/ 에 넣으면 그 묶음이고, 원장도 같은 이름으로 실린다 (2026-09-07 오너 확정).
// 순서는 제작 단계 → 공통 영역 → 수동. 새 폴더는 여기 한 줄 추가하면 끝난다.
const FOLDERS = {
  producer: 'Producer: 입력 카드·게이트·Writer 넘김',
  writer: 'Writer: 대본·무대·러프 그림·샷·단계 전환',
  artist: 'Artist: 캐릭터·배경 이미지·모습·스타일 앵커',
  director: 'Director: 캔버스·선·실사·영상 생성',
  editor: 'Editor: 클립·자막·내보내기·미디어 저장',
  chat: '채팅 공통: 블록·선택지·승인 카드·추적',
  job: '생성 작업: 큐·상태·실패 원인·fal 연결',
  billing: '결제: Take·플랜·Paddle·관리자 적립',
  'llm-call': 'AI 모델 호출: 재시도·응답 형식 검사·기록',
  'ui-text': '화면 문구: 번역 사전·한글 잔존·문구 규칙·내부 식별자 숨김',
  permission: '권한: 관리자 판별·프로젝트 접근·내보내기 로그인 경계',
  reference: '참조 프로젝트 가져오기',
  project: '프로젝트: 만들기·지우기·공유 데이터 캐시',
  login: '로그인·계정: 로그인 화면·테스트 계정·데모 토큰',
  ops: '운영 도구: 서버 오류 기록·소급 스크립트·코드 검사기',
  manual: '수동: 실제 AI·fal 과금이나 운영 DB 쓰기가 있어 사람이 켤 때만 돈다',
}
const FOLDER_NAMES = Object.keys(FOLDERS)
const folderOf = (file) => {
  const parts = file.split('/')
  return parts.length === 3 && FOLDER_NAMES.includes(parts[1]) ? parts[1] : null
}

const SUITES = {
  core: {
    description: '제품 코드의 빠른 자동 회귀 테스트 (수동 제외)',
    pick: isAutomated,
  },
  ...Object.fromEntries(
    FOLDER_NAMES.filter((name) => name !== 'manual').map((name) => [
      name,
      { description: FOLDERS[name], pick: (file) => isAutomated(file) && folderOf(file) === name },
    ]),
  ),
  'red-team': {
    description: '테스트 방식별 묶음: 이상한 입력·경계값 공격 (파일 이름 꼬리 .red-team, 기능 폴더에 산다)',
    pick: (file) => isAutomated(file) && isRedTeam(file),
  },
  unsorted: {
    description: '폴더에 안 넣은 파일: tests/ 바로 아래이거나 모르는 폴더 (분류 부채, 0이어야 정상)',
    pick: (file) => isAutomated(file) && folderOf(file) === null,
  },
  manual: {
    description: FOLDERS.manual,
    pick: isManual,
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
  const also = isRedTeam(file) ? ['red-team'] : []
  return { file, headline: headline(source), cases, also }
}

async function printLedger(files) {
  // 파일 하나 = 폴더 하나. red-team 은 방식별 묶음이라 표에만 따로 세고 본문에서는 기능 폴더 아래 제목에 표기한다.
  const ledgerSuites = [...FOLDER_NAMES.filter((n) => n !== 'manual'), 'red-team', 'unsorted', 'manual']
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
  out.push('묶음 = tests/ 아래 폴더. red-team 은 파일 이름 꼬리로 잡는 방식별 묶음이라 표에서만 따로 세고, 본문에서는 기능 폴더 제목에 표기한다.')
  out.push('')
  out.push('| 묶음 | 파일 | 케이스 | 설명 |')
  out.push('|---|---:|---:|---|')
  for (const s of sections) out.push(`| ${s.name} | ${s.fileCount} | ${s.caseCount} | ${s.description} |`)
  for (const s of sections) {
    if (s.entries.length === 0) continue
    out.push('')
    out.push(`## ${s.name} — ${s.description}`)
    for (const e of s.entries) {
      const also = e.also.filter((d) => d !== s.name)
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
  if (suiteName === 'unsorted') {
    console.log('[test:unsorted] 0 files. 분류 부채 없음.')
    process.exit(0)
  }
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

// ── 실패한 테스트 → "결정이 필요한 것" 표 — 실패 시 자동 출력 (.claude/rules/tdd.md) ──
// 오너가 코드 없이 "코드를 고친다 / 동작이 바됌어 이름을 고친다 / 동작이 없어져 지운다"만 고를 수 있게
// 파일 첫 줄 설명 · 테스트 이름 · 실제로 일어난 일 첫 줄만 보여준다. 스택·구현 용어는 위의 vitest 출력에 있다.
// 용어는 세션 보고서 표준과 같다 — "약속"·"삼진"·"판정 카드" 같은 조어 금지(2026-09-11 오너 지시).
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
  const out = ['', `━━ 결정이 필요한 것 — 실패한 테스트 ${count}건 ━━`]
  out.push('  선택지 (건마다 하나):')
  out.push('    · 코드를 고친다 — 기본값. 에이전트가 바로 고치고 보고에 남긴다')
  out.push('    · 동작이 바됌었다 → 테스트 이름을 고친다 — 오너가 새 문장을 준 뒤에만')
  out.push('    · 그 동작이 없어졌다 → 테스트를 지운다 — 오너가 정한 뒤에만')
  for (const f of failed) {
    out.push('', `${f.file} — ${f.head ?? '(첫 줄 설명 없음)'}`)
    if (f.cases.length === 0) {
      out.push(`  · 파일 자체가 안 돌았다: ${firstLine(f.message)}`)
      continue
    }
    for (const c of f.cases) {
      out.push(`  · 테스트: ${c.title}`)
      out.push(`    실제로 일어난 일: ${firstLine(c.failureMessages?.[0]) || '(메시지 없음)'}`)
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
