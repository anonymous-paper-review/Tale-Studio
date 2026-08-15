// writer 배선도 — 코드베이스에서 살아 있는 사실만 뽑아 오는 층.
//
// 이 파일의 존재 이유: 지도는 손으로 쓰면 반드시 낡는다(.claude/vault/2026-08-11 "낡은 트리를
//   근거로 한 판정이 며칠도 못 간다"). 그래서 지도에서 **코드가 진실인 부분**(프롬프트 원문,
//   상수, 소비처 유무, 실제 산출 예시)은 하나도 복사해 두지 않고 요청 시점에 다시 읽는다.
//   손으로 쓰는 것은 해석(왜 이 모양이 됐나)뿐이다.
//
// 앵커는 줄 번호가 아니라 **문자열 경계**다 — 줄이 밀려도 살아남게.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

export const ROOT = process.cwd()

// ── 소스 색인 (watch 가 무효화한다) ───────────────────────────────────────────
let indexCache = null

const SCAN_DIRS = ['src', 'tests']
const SCAN_EXT = new Set(['.ts', '.tsx', '.mts'])
const SKIP_DIR = new Set(['node_modules', '.next', '.git', 'dist', 'build'])

function walk(dir, out) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.claude') continue
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue
      walk(full, out)
    } else if (SCAN_EXT.has(extname(e.name))) {
      out.push(full)
    }
  }
  return out
}

export function sourceIndex() {
  if (indexCache) return indexCache
  const files = []
  for (const d of SCAN_DIRS) {
    const abs = join(ROOT, d)
    if (existsSync(abs)) walk(abs, files)
  }
  const map = new Map()
  for (const f of files) {
    try {
      map.set(relative(ROOT, f), readFileSync(f, 'utf8'))
    } catch {
      /* 읽기 실패 파일은 색인에서 뺀다 */
    }
  }
  indexCache = map
  return map
}

export function invalidate() {
  indexCache = null
}

export function readSource(rel) {
  const idx = sourceIndex()
  if (idx.has(rel)) return idx.get(rel)
  const abs = join(ROOT, rel)
  try {
    return readFileSync(abs, 'utf8')
  } catch {
    return null
  }
}

// ── 문자열 경계로 잘라내기 ────────────────────────────────────────────────────
/**
 * 앵커 { file, from, to, toFromEnd?, trimIndent? } 로 소스 조각을 떠 온다.
 *   from  — 이 문자열이 시작하는 지점부터 (문자열 자체는 결과에서 제외)
 *   to    — from 이후 처음 만나는 이 문자열 직전까지
 * 못 찾으면 실패 사유를 담아 돌려준다 — 페이지가 "앵커가 끊겼다"를 눈에 보이게 표시한다.
 */
export function slice(anchor) {
  const src = readSource(anchor.file)
  if (src == null) {
    return { ok: false, text: '', reason: `파일 없음: ${anchor.file}`, line: null }
  }
  const start = src.indexOf(anchor.from)
  if (start === -1) {
    return { ok: false, text: '', reason: `시작 앵커를 못 찾음: ${truncate(anchor.from)}`, line: null }
  }
  // keepFrom: 시작 앵커 자체가 본문의 첫 글자일 때 (예: 프롬프트가 "당신은 ..." 으로 시작)
  const bodyStart = anchor.keepFrom ? start : start + anchor.from.length
  const end = anchor.to ? src.indexOf(anchor.to, bodyStart) : src.length
  if (anchor.to && end === -1) {
    return { ok: false, text: '', reason: `끝 앵커를 못 찾음: ${truncate(anchor.to)}`, line: null }
  }
  let text = src.slice(bodyStart, anchor.to ? end : undefined)
  text = text.replace(/^\n/, '').replace(/\s+$/, '')
  return { ok: true, text, reason: null, line: lineOf(src, start) }
}

function truncate(s) {
  return s.length > 48 ? s.slice(0, 45) + '…' : s
}

function lineOf(src, idx) {
  let n = 1
  for (let i = 0; i < idx; i += 1) if (src.charCodeAt(i) === 10) n += 1
  return n
}

/** 정규식 첫 캡처그룹을 값으로 뽑는다 (상수 추적용). */
export function probe(file, re) {
  const src = readSource(file)
  if (src == null) return { ok: false, value: null, reason: `파일 없음: ${file}` }
  const m = src.match(re)
  if (!m) return { ok: false, value: null, reason: `패턴 불일치: ${String(re).slice(0, 60)}` }
  return { ok: true, value: (m[1] ?? m[0]).trim(), reason: null, line: lineOf(src, m.index ?? 0) }
}

// ── 소비처 세기 (사장 필드 자가 검증) ─────────────────────────────────────────
/**
 * 필드 이름이 **읽히는** 곳이 있는지 센다.
 *   produce: 생산하는 파일들(여기 등장은 세지 않는다)
 *   ignore : 타입 선언 등 소비로 치지 않을 파일들
 * 완벽한 정적 분석이 아니라 grep 수준이다 — 목적은 "0이었던 것이 0이 아니게 됐다"를
 * 페이지가 스스로 알아채는 것. 늘어나면 배지가 뜨고, 사람이 확인한다.
 */
export function countConsumers(field, opts = {}) {
  const produce = new Set(opts.produce ?? [])
  const ignore = new Set(opts.ignore ?? [])
  const idx = sourceIndex()
  const hits = []
  const re = new RegExp(`\\b${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
  for (const [rel, src] of idx) {
    if (produce.has(rel) || ignore.has(rel)) continue
    if (rel.startsWith('tests/')) continue
    if (!re.test(src)) continue
    hits.push(rel)
  }
  return hits
}

// ── 실제 런 산출물 ────────────────────────────────────────────────────────────
const LOGS = join(ROOT, 'logs')

/** 08~14 스테이지 파일이 고루 있는 가장 완결된 런 디렉토리를 고른다. */
export function pickRun(preferred) {
  if (preferred && existsSync(join(LOGS, preferred))) return preferred
  let best = null
  let bestScore = 0
  let dirs = []
  try {
    dirs = readdirSync(LOGS, { withFileTypes: true }).filter((d) => d.isDirectory())
  } catch {
    return null
  }
  const want = /^(08|08b|09|10|10b|11|12|13|14)_/
  for (const d of dirs) {
    let files
    try {
      files = readdirSync(join(LOGS, d.name))
    } catch {
      continue
    }
    const score = files.filter((f) => want.test(f)).length
    if (score < 8) continue
    // 동점이면 샷 시퀀스가 큰 쪽 — 예시로 보여줄 게 많은 런을 고른다.
    let weight = 0
    try {
      weight = statSync(join(LOGS, d.name, '13_c2_shotSequence.json')).size
    } catch {
      /* 없으면 0 */
    }
    const total = score * 1e9 + weight
    if (total > bestScore) {
      bestScore = total
      best = d.name
    }
  }
  return best
}

export function readRunJson(run, file) {
  if (!run) return null
  try {
    return JSON.parse(readFileSync(join(LOGS, run, file), 'utf8'))
  } catch {
    return null
  }
}

export function runInfo(run) {
  if (!run) return null
  let story = ''
  try {
    const md = readFileSync(join(LOGS, run, '00_input_story.md'), 'utf8')
    story = (md.split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? '').trim()
  } catch {
    /* 입력 원문이 없어도 지도는 뜬다 */
  }
  const seq = readRunJson(run, '13_c2_shotSequence.json')
  const dec = readRunJson(run, '10b_c_decoupage.json')
  let mtime = null
  try {
    mtime = statSync(join(LOGS, run)).mtime.toISOString().slice(0, 10)
  } catch {
    /* 무시 */
  }
  return {
    id: run,
    story: story.slice(0, 160),
    date: mtime,
    totalShots: seq?.total_shots ?? null,
    depth: seq?.depth_level ?? null,
    decoupageShots: dec?.total_shots ?? null,
    added: dec?.total_added ?? null,
    merged: dec?.total_merged ?? null,
    split: dec?.total_split ?? null,
  }
}

/** JSON 을 보기 좋은 길이로 자른다 (사람이 읽을 예시용). */
export function sample(value, maxChars = 2200) {
  if (value == null) return null
  const s = JSON.stringify(value, null, 2)
  if (s.length <= maxChars) return s
  return s.slice(0, maxChars) + '\n… (잘림)'
}
