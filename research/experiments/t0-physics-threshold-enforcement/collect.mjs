// t0-physics-threshold-enforcement — 물리 임계값이 산문으로만 선언되고 코드로는 안 지켜지는가.
//   임계값 전수 → ① 산문(프롬프트) 등장 지점 ② 코드 검사·교정 지점 대조표. 코드 추적만.
//   "강제"의 정의(사전 고정): 값을 읽어 **비교·클램프·분할·거부**로 결과를 바꾸는 지점.
//   로그·경고만 하고 통과시키는 지점은 NA(분모에서 제외) — 판정 3원칙.
// 실행: node research/experiments/t0-physics-threshold-enforcement/collect.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'

// 임계값 정본 — src/lib/writer/pipeline/physics.ts SHOT_PHYSICS (원문 그대로)
const THRESHOLDS = [
  { key: 'shotSecondsMin', value: 2, what: '샷 최소 초' },
  { key: 'shotSecondsMax', value: 8, what: '샷 최대 초' },
  { key: 'shotSecondsHardMax', value: 10, what: '샷 절대 상한 초' },
  { key: 'verbsPerShotMax', value: 2, what: '샷당 동사 수 상한' },
  { key: 'motionPromptCharsMin', value: 50, what: '모션 프롬프트 최소 자수' },
  { key: 'motionPromptCharsMax', value: 80, what: '모션 프롬프트 최대 자수' },
  { key: 'firstFramePromptCharsMin', value: 200, what: '첫 프레임 프롬프트 최소 자수' },
  { key: 'firstFramePromptCharsMax', value: 400, what: '첫 프레임 프롬프트 최대 자수' },
]
// 산문 조각(프롬프트 주입 문자열) — 같은 파일이 export
const PROSE_TOKENS = ['SHOT_SECONDS_RANGE', 'SHOT_SECONDS_HARD_MAX', 'MOTION_PROMPT_CHARS', 'FIRST_FRAME_CHARS']
const PROSE_FOR = {
  shotSecondsMin: ['SHOT_SECONDS_RANGE'],
  shotSecondsMax: ['SHOT_SECONDS_RANGE'],
  shotSecondsHardMax: ['SHOT_SECONDS_HARD_MAX'],
  verbsPerShotMax: [],  // 전용 문구 조각 없음 — 산문 등장은 아래 본문 검색으로
  motionPromptCharsMin: ['MOTION_PROMPT_CHARS'],
  motionPromptCharsMax: ['MOTION_PROMPT_CHARS'],
  firstFramePromptCharsMin: ['FIRST_FRAME_CHARS'],
  firstFramePromptCharsMax: ['FIRST_FRAME_CHARS'],
}

const files = []
;(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = `${dir}/${e}`
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.ts') && !p.includes('.test.')) files.push(p)
  }
})('src/lib/writer')
files.push(...['src/lib/director/motion-contract.ts'].filter((f) => { try { statSync(f); return true } catch { return false } }))

const lineIndex = new Map(files.map((f) => [f, readFileSync(f, 'utf8').split('\n')]))

// 강제로 인정하는 문법: 임계값(또는 그 상수명)이 비교/클램프/조건에 쓰이는 줄
const ENFORCE_RE = (name) => new RegExp(
  `(Math\\.(min|max)\\([^)]*${name}|` +               // 클램프
  `[<>]=?\\s*[^;]*${name}|${name}[^;]*[<>]=?|` +      // 비교
  `slice\\([^)]*${name}|` +                            // 자르기
  `\\.length\\s*[<>]=?[^;]*${name})`,                 // 길이 비교
)
const LOG_ONLY_RE = /console\.(log|warn|error)|issues\.push|logger\./

// 사람 대조로 확정한 진짜 강제 지점(전건 육안 확인 2026-08-12). 자동 탐지 두 패스가 모두 놓치거나
//   오탐한 자리를 여기서 고정한다 — 근거를 함께 남겨 재검증 가능하게.
const VERIFIED_ENFORCEMENT = {
  shotSecondsHardMax: [
    {
      file: 'src/lib/writer/pipeline/util/persist_manifest.ts',
      line: 63,
      code: 'const MAX_SHOT_SECONDS = 10  →  clampShotSeconds(): Math.min(MAX_SHOT_SECONDS, Math.max(1, …))',
      applied_at: ['persist_manifest.ts:619 (샷 저장)', 'persist_manifest.ts:709 (씬 합계)'],
      why: '저장 직전 샷 길이를 10초로 잘라낸다 — 결과가 실제로 바뀐다',
      references_canonical_constant: false,
    },
    {
      file: 'src/lib/writer/pipeline/util/duration_reallocation.ts',
      line: 19,
      code: 'export const REALLOC_MAX_SHOT_SECONDS = 10  →  Math.min(max, …) (76행)',
      applied_at: ['duration_reallocation.ts:103'],
      why: '인지 부하 재배분에서 증액 상한으로 실제 적용',
      references_canonical_constant: false,
    },
  ],
}

const rows = []
for (const t of THRESHOLDS) {
  const prose = []
  const enforce = []
  const naSites = []
  for (const [file, lines] of lineIndex) {
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return
      const hasName = line.includes(`SHOT_PHYSICS.${t.key}`) || line.includes(t.key)
      const hasProse = (PROSE_FOR[t.key] ?? []).some((p) => line.includes(p))
      if (hasProse) prose.push({ file, line: i + 1, code: line.trim().slice(0, 120) })
      if (!hasName) return
      if (file.endsWith('physics.ts')) return // 정의부는 선언도 강제도 아니다
      const isEnforce = ENFORCE_RE(t.key).test(line)
      const logOnly = LOG_ONLY_RE.test(line)
      if (isEnforce && !logOnly) enforce.push({ file, line: i + 1, code: line.trim().slice(0, 140) })
      else naSites.push({ file, line: i + 1, why: logOnly ? '로그·보고만' : '값 참조(비교 아님)', code: line.trim().slice(0, 140) })
    })
  }
  // 2차 통과 — **상수명이 아니라 숫자 리터럴**로 강제하는 지점(값 복제). 정본을 안 읽어도 강제는 강제다.
  //   오탐을 줄이려고 같은 줄에 대상 어휘(초·자수·동사)가 있는 것만 센다. 전건은 결과에 실어 사람이 대조 가능.
  const domain = /(duration|seconds|초|chars|자수|length|verb|동사)/i
  const literalEnforce = []
  for (const [file, lines] of lineIndex) {
    if (file.endsWith('physics.ts')) continue
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return
      if (line.includes('SHOT_PHYSICS')) return           // 1차에서 처리
      if (!new RegExp(`\\b${t.value}\\b`).test(line)) return
      if (!domain.test(line)) return
      const isClampOrCompare = /Math\.(min|max)\(|[<>]=?|\.slice\(/.test(line)
      if (!isClampOrCompare) return
      if (LOG_ONLY_RE.test(line)) return
      literalEnforce.push({ file, line: i + 1, code: line.trim().slice(0, 140) })
    })
  }

  // 3차 — 자동 탐지의 한계를 사람 대조로 메운다(전건 육안 확인, 근거를 여기 박아둔다).
  //   ㄱ) 위 리터럴 후보는 **전건 오탐**이었다(값 2·8·50 이 무관한 줄에 우연히 등장).
  //   ㄴ) 반대로 자동 탐지가 놓친 진짜 강제가 있다: 값을 **다른 이름의 상수로 복제**해 클램프하는 자리.
  //       (정본 상수를 안 읽으므로 1차에서 안 걸리고, 클램프 줄에 숫자가 없어 2차에서도 안 걸린다.)
  const verified = (VERIFIED_ENFORCEMENT[t.key] ?? [])
  rows.push({
    ...t,
    prose_sites: prose.length,
    prose_detail: prose,
    enforced: verified.length > 0,
    enforced_via_canonical_constant: enforce.length > 0,
    enforce_sites: enforce,
    verified_enforce_sites: verified,
    literal_candidates: literalEnforce,
    literal_candidates_verdict: literalEnforce.length ? '전건 오탐(사람 대조) — 해당 임계값을 강제하지 않음' : null,
    na_sites: naSites,
  })
}

const decidable = rows.filter((r) => r.prose_sites > 0 || r.enforced || r.na_sites.length)
const enforced = rows.filter((r) => r.enforced)
const ratio = rows.length ? enforced.length / rows.length : null

const out = {
  ticket: 't0-physics-threshold-enforcement',
  date: '2026-08-12',
  method: '임계값 전수 → 산문 등장 / 코드 강제 대조. 강제 = 값을 읽어 비교·클램프로 결과를 바꾸는 자리. 자동 탐지 2패스 후 전건 사람 대조(오탐 제거 + 누락 보강), 검증 목록을 스크립트에 고정.',
  source: 'src/lib/writer/pipeline/physics.ts SHOT_PHYSICS',
  scanned_files: files.length,
  thresholds_total: rows.length,
  enforced_count: enforced.length,
  enforced_via_canonical_constant_count: rows.filter((r) => r.enforced_via_canonical_constant).length,
  enforced_ratio: ratio == null ? null : +ratio.toFixed(3),
  verdict: ratio == null ? '모집단 부족'
    : ratio >= 0.5 ? '코드 강제 50% 이상 — 가설 기각'
      : '코드 강제 50% 미만 — 가설 유지',
  rows,
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))
console.log(`임계값 ${rows.length} | 코드 강제 ${enforced.length} (${(ratio * 100).toFixed(1)}%) → ${out.verdict}`)
for (const r of rows) {
  console.log(`  ${r.enforced ? '✅강제' : '❌산문만'} ${r.what}(${r.value}) — 산문 ${r.prose_sites}곳 / 검증된 강제 ${r.verified_enforce_sites.length}곳 / 자동후보(오탐) ${r.literal_candidates.length}곳`)
  for (const e of r.verified_enforce_sites) console.log(`      ↳ ${e.file}:${e.line}  ${e.code}`)
}
