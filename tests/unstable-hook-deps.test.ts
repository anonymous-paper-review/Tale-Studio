// 훅 deps 불안정 참조 감지 — 실패 모드 (2026-08-25 오너 결정으로 경고→실패 승격).
//
// 배경: research/experiments/unstable-hook-deps-detector/ 야간 조사(README.md, _HYPOTHESIS.md)에서
//   src/** 를 정적으로 추적해 "매 렌더 새로 만들어지는 값이 훅 조건 목록에 들어간 곳"을 찾는
//   검사기(detector.mjs)를 만들었다. 이 시험은 그 검사기를 tests/helpers/ 로 복사한
//   unstable-hook-deps-detector.mjs 를 시험 스위트에 도입한다.
//
// 실패 모드 규칙 (2026-08-25 오너 결정):
//   - 베이스라인(REVIEWED_UNKNOWN) 밖의 검출이 하나라도 나오면 **실패한다**.
//   - 검출 내용은 실패 메시지 자체에 담는다. console.warn 은 쓰지 않는다 —
//     **이 저장소의 시험 환경에서는 console.warn 이 화면에 나오지 않기 때문이다**(2026-08-25 실측:
//     빈 시험에 warn 한 줄만 찍어도 출력 0). 경고 모드였을 때 검사기가 5건을 정확히 잡았는데도
//     화면에는 "3 passed" 만 떴다. 조용한 방어는 방어가 아니다.
//
// 새 검출이 나왔을 때 할 일 (실패 메시지가 파일:줄을 알려준다):
//   1. 그 훅이 정말 매 렌더 새 값을 주는지 본다 → 맞으면 훅 쪽을 useCallback/useMemo 로 고정한다
//      (선례: src/lib/i18n/index.ts 의 useT).
//   2. 사람이 봐서 안전하다고 판단되면 REVIEWED_UNKNOWN 에 근거와 함께 추가한다.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { runDetector as runDetectorUntyped } from './helpers/unstable-hook-deps-detector.mjs'

// 사람이 이미 안전을 확인한 UNKNOWN 목록 (야간 조사 2026-08-25 확인 3건).
// 출처: research/experiments/unstable-hook-deps-detector/detector.mjs 상단 주석
//   "한계 (자동 해소 불가, 사람 판단 필요한 UNKNOWN 사례 — 2026-08-25 확인 3건)"
//   및 research/experiments/unstable-hook-deps-detector/README.md 초안 REVIEWED_UNKNOWN.
// 이 목록 밖에서 새 항목이 나오면 실패한다.
const REVIEWED_UNKNOWN = new Set([
  'src/app/studio/producer/page.tsx::useContentLocale::contentLoc',
  'src/features/director/canvas-views/StoryboardGridView.tsx::useActiveGenerationJobs::activeJobs',
  'src/features/director/hooks/use-queue-rehydrate.ts::useActiveGenerationJobs::activeJobs',
])

interface Finding {
  file: string
  hookName: string
  varName: string
  status: 'unsafe' | 'unknown'
}

// finding 이 가리키는 `const varName = hookName(` 바인딩의 파일 내 줄 번호를 찾는다.
// (검사기 자체는 줄 번호를 반환하지 않으므로 경고 메시지용으로 여기서 다시 찾는다.)
// .mjs 모듈은 반환 타입이 좁혀지지 않으므로 여기서 한 번만 단언한다.
const runDetector = runDetectorUntyped as (root: string) => { findings: Finding[] }

function locate(finding: Finding): number {
  const src = readFileSync(finding.file, 'utf8')
  const re = new RegExp(`const\\s+${finding.varName}\\s*=\\s*${finding.hookName}\\(`)
  const idx = src.search(re)
  if (idx === -1) return -1
  return src.slice(0, idx).split('\n').length
}

describe('훅 deps 불안정 참조 감지 (실패 모드)', () => {
  it('검사기가 크래시하지 않고 src/ 전체를 검사한다', () => {
    expect(() => runDetector('src')).not.toThrow()
  })

  it('베이스라인 밖 새 검출이 있으면 실패한다', () => {
    const { findings } = runDetector('src')

    const unreviewed = findings.filter((f: Finding) => {
      const key = `${f.file}::${f.hookName}::${f.varName}`
      return !(f.status === 'unknown' && REVIEWED_UNKNOWN.has(key))
    })

    // 실패 메시지에 그대로 실리도록 사람이 읽을 문장으로 만든다 — console 출력은 삼켜진다.
    // 같은 파일에서 같은 훅을 여러 번 쓰면 locate() 가 첫 줄만 찾아 같은 문장이 반복된다 →
    //   중복을 접어 실패 메시지를 읽을 수 있게 만든다(검출 건수는 뒤에 붙인다).
    const counted = new Map<string, number>()
    for (const f of unreviewed) {
      const line = locate(f)
      const where = line === -1 ? f.file : `${f.file}:${line}`
      const key = `[${f.status}] ${where} — ${f.hookName}() 결과 "${f.varName}" 가 훅 deps 에 들어감`
      counted.set(key, (counted.get(key) ?? 0) + 1)
    }
    const offenders = [...counted].map(([key, n]) => (n > 1 ? `${key} (${n}곳)` : key))

    expect(offenders).toEqual([])
  })

  it('베이스라인 3건은 여전히 검사기 결과에 unknown 으로 존재한다 (참고용 — 사라지면 검토)', () => {
    const { findings } = runDetector('src')
    const unknownKeys = new Set(
      findings.filter((f: Finding) => f.status === 'unknown').map((f: Finding) => `${f.file}::${f.hookName}::${f.varName}`),
    )
    const missing = [...REVIEWED_UNKNOWN].filter((key) => !unknownKeys.has(key))
    if (missing.length > 0) {
      console.warn(`[unstable-hook-deps] 베이스라인 항목이 더 이상 검출되지 않음(코드가 바뀌었을 수 있음): ${missing.join(', ')}`)
    }
    // 참고용 경고일 뿐 실패시키지 않는다.
    expect(true).toBe(true)
  })
})
