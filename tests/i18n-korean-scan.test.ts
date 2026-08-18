import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

// 한글 잔존 스캐너 (#i18n-s5) — "UI 전면 영어화"의 완료 판정을 눈이 아니라 지표로.
//   src 의 비주석 한글 라인을 파일별로 세어 허용 목록(i18n-korean-allowlist.json)과 대조한다.
//   배치가 끝날 때마다 목록을 재생성해 줄이고(래칫), 최종 0 이 목표. 늘어나면 CI 실패 —
//   새 하드코딩 한글의 재발 방지 게이트를 겸한다.
//
//   재생성: UPDATE_I18N_ALLOWLIST=1 pnpm vitest run tests/i18n-korean-scan.test.ts
//
//   제외(의도적 한국어 — 번역 대상이 아님):
//   - src/lib/i18n/messages-ko.ts        : ko 사전 그 자체
//   - src/lib/writer/pipeline/**         : LLM 메타 프롬프트(오너 지시 — 내부 프롬프트 불변)
//   - `// i18n-ok` 프라그마 라인          : 언어 고유 표기 등 정당한 한글 (예: '한국어' 라벨)

const SRC = path.join(process.cwd(), 'src')
const ALLOWLIST_PATH = path.join(process.cwd(), 'tests', 'i18n-korean-allowlist.json')
const EXCLUDED = [
  path.join('src', 'lib', 'i18n', 'messages-ko.ts'),
  path.join('src', 'lib', 'writer', 'pipeline') + path.sep,
]

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

/** 파일 단위 위반 라인 인덱스 — 여러 줄 블록 주석({/* … *\/}, /* … *\/)의 연속 줄을
 *  상태 추적으로 제외한다(마커 없는 이어짐 줄이 오탐되던 것 수정). */
function violationLines(source: string): number[] {
  const out: number[] = []
  let inBlock = false
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const trimmed = raw.trim()
    if (inBlock) {
      if (raw.includes('*/')) inBlock = false
      continue
    }
    const opensBlock = /(\{\/\*|\/\*)/.test(raw)
    if (opensBlock && !raw.slice(raw.search(/(\{\/\*|\/\*)/)).includes('*/')) inBlock = true
    if (!/[가-힣]/.test(raw)) continue
    if (raw.includes('// i18n-ok')) continue
    if (/^(\/\/|\*|\/\*|{\/\*)/.test(trimmed)) continue
    // 코드 끝 후행 주석 제거(공백+// — URL 의 :// 는 공백이 없어 보존됨) 후 재검사
    const withoutTrailing = raw.replace(/\s\/\/.*$/, '').replace(/\{\/\*.*$/, '').replace(/\/\*.*$/, '')
    if (/[가-힣]/.test(withoutTrailing)) out.push(i)
  }
  return out
}

function scan(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const file of walk(SRC)) {
    const rel = path.relative(process.cwd(), file)
    if (EXCLUDED.some((ex) => rel === ex || rel.startsWith(ex))) continue
    const n = violationLines(readFileSync(file, 'utf8')).length
    if (n > 0) counts[rel] = n
  }
  return counts
}

describe('i18n — 한글 잔존 게이트', () => {
  it('비주석 한글 라인 수가 허용 목록을 넘지 않는다 (배치마다 래칫 다운)', () => {
    const counts = scan()

    if (process.env.UPDATE_I18N_ALLOWLIST === '1') {
      writeFileSync(ALLOWLIST_PATH, `${JSON.stringify(counts, null, 1)}\n`)
      const total = Object.values(counts).reduce((a, b) => a + b, 0)
      console.log(`[i18n-scan] allowlist 재생성: ${Object.keys(counts).length}개 파일, ${total}라인`)
      return
    }

    expect(existsSync(ALLOWLIST_PATH), 'allowlist 없음 — UPDATE_I18N_ALLOWLIST=1 로 생성').toBe(true)
    const allowed = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')) as Record<string, number>

    const regressions: string[] = []
    for (const [file, n] of Object.entries(counts)) {
      const cap = allowed[file] ?? 0
      if (n > cap) {
        const source = readFileSync(path.join(process.cwd(), file), 'utf8')
        const lines = source.split('\n')
        const samples = violationLines(source)
          .slice(0, 3)
          .map((i) => `    L${i + 1}: ${lines[i].trim().slice(0, 80)}`)
        regressions.push(`${file}: ${n} > 허용 ${cap}\n${samples.join('\n')}`)
      }
    }
    expect(
      regressions,
      `하드코딩 한글 증가 — t() 사전화하거나 정당하면 // i18n-ok:\n${regressions.join('\n')}`,
    ).toEqual([])
  })
})
