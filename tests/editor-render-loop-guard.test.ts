// 무한 되그리기 회귀 잠금 (#editor-render-loop 2026-08-24).
//
// 실사고: 프로덕션 빌드로 /studio/editor 에 들어가면 React #185(Maximum update depth exceeded)가
//   4건 났다. 원인은 셀렉터가 아니라 **훅 deps** 였다 — `useT()` 가 렌더마다 새 함수를 돌려주는데
//   editor 의 마운트 로드 effect 가 그 참조를 deps 에 넣고 있었다:
//     useEffect(..., [projectId, loadData, loadPersisted, t])
//   → 렌더마다 effect 재실행 → loadData() → store set() → 리렌더 → 다시 effect … 무한.
//   (dev 재현 스택: PostPage.useEffect → loadData → setState → forceStoreRerender)
//
// 뿌리는 useT 였으므로 거기서 고쳤다. 이 테스트가 잠그는 것:
//   1) useT 가 참조를 고정한다 (뿌리)
//   2) t 를 deps 에 넣는 곳이 실제로 있다 (1이 왜 필요한지의 근거 — 우연히 안 터지는 상태 아님)
//   3) editor 마운트 로드 effect 의 deps 가 전부 안정 참조다 (사고 지점)
//
// 브라우저 렌더 테스트가 이상적이지만 이 저장소의 vitest 는 environment=node 이고
//   jsdom/testing-library 가 없다. 그래서 다른 소스 계약 테스트들과 같은 방식으로,
//   재발 조건 자체를 소스에서 막는다.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const I18N = 'src/lib/i18n/index.ts'
const EDITOR_PAGE = 'src/app/studio/editor/page.tsx'

// 훅 deps 배열만 추출: `}, [a, b])` / `), [a, b])` 두 형태.
function depArrays(source: string): string[][] {
  const out: string[][] = []
  const re = /[)}]\s*,\s*\[([^\][]*)\]\s*,?\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    out.push(
      m[1]
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean),
    )
  }
  return out
}

function tsxFilesUnder(...roots: string[]): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(entry.name)) files.push(p)
    }
  }
  for (const r of roots) walk(r)
  return files
}

describe('무한 리렌더 방지 (React #185)', () => {
  it('useT 는 렌더마다 새 함수를 만들지 않는다 (locale 로만 갱신)', () => {
    const src = readFileSync(I18N, 'utf8')
    expect(src).toMatch(
      /return useCallback\(\s*\([\s\S]*?\) =>\s*translate\(locale, text, params\),\s*\[locale\],\s*\)/,
    )
    // 옛 형태(useCallback 없이 화살표 함수 직접 반환)로 되돌아가면 잡는다.
    expect(src).not.toMatch(/return \(text, params\) => translate\(/)
  })

  it('t 를 훅 deps 로 쓰는 화면이 실제로 있다 — 위 잠금이 살아있는 이유', () => {
    const users = tsxFilesUnder('src/app', 'src/features', 'src/components').filter((f) => {
      const src = readFileSync(f, 'utf8')
      const bound = src.match(/const\s+(\w+)\s*=\s*useT\(\)/)
      if (!bound) return false
      return depArrays(src).some((deps) => deps.includes(bound[1]))
    })
    expect(users.length).toBeGreaterThan(0)
    expect(users).toContain(EDITOR_PAGE)
  })

  it('editor 마운트 로드 effect 의 deps 는 전부 안정 참조다', () => {
    const page = readFileSync(EDITOR_PAGE, 'utf8')
    // loadData/loadPersisted 를 부르는 effect 를 찾아 그 deps 를 검사한다.
    const deps = depArrays(page.slice(page.indexOf('await loadData()')))[0]
    expect(deps).toEqual(['projectId', 'loadData', 'loadPersisted', 't', 'retryTick'])
    // 각 항목의 안정성 근거:
    //   projectId  — 스토어 원시값
    //   loadData / loadPersisted — zustand 액션(스토어 생성 시 1회)
    //   t          — useT 의 useCallback (위 첫 테스트가 잠금)
    //   retryTick  — useState 숫자(#pps-empty-states '다시 시도' 재발화 신호) — 렌더 간 안정,
    //                클릭에서만 증가하므로 재실행은 사용자 행동 1회당 1회다.
    expect(page).toMatch(/const projectId = useProjectStore\(\(s\) => s\.projectId\)/)
    expect(page).toMatch(/\n\s+loadData,\n\s+loadPersisted,\n/) // useEditorStore() 구조분해
  })
})
