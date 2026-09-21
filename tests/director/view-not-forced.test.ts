// 프로젝트를 처음 열 때만 결과 화면으로 열고, 그 뒤로는 내가 고른 탭을 유지한다
//
// Director 에는 노드(배선 작업)와 스토리보드(결과 훑어보기) 두 탭이 있고, 고른 탭은 저장된다.
// 예전에는 진입할 때마다 — 새로고침·프로젝트 전환 모두 — 진행 중인 잡이 있으면 저장된 탭을
// 무시하고 스토리보드로 강제 전환했다. 배선 작업 중 새로고침하면 하던 화면을 잃었다.
//
// 오너 판정(2026-09-08): 진입 시 1회는 의도한 동작이다. 다만 "1회" 는 프로젝트당 최초 1회다.
//   - 이 브라우저가 처음 보는 프로젝트 + 만들고 있는 게 있음 → 결과가 보이는 화면으로 연다
//   - 재진입(새로고침 포함) → 내가 고른 탭 그대로
// 판별은 #first-entry-node(2026-08-27) 가 쓰는 viewportInitializedProjects 를 그대로 쓴다.
//
// 함께 없앤 것: StoryboardGridView 의 effect 는 진입 시 1회가 아니라 작업이 도는 내내 되돌려서
//   사용자가 Previz 를 눌러도 다음 렌더에 Real 로 다시 튕겼다. 그건 의도가 아니므로 제거한다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

function sourceOf(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8')
}

describe('Director 탭 선택', () => {
  it('프로젝트를 처음 열 때만 결과 화면 복원을 시도한다', () => {
    const store = sourceOf('src/stores/director-store.ts')

    // 복원 호출이 "처음 보는 프로젝트" 가지 안에 있어야 한다.
    // viewportInitializedProjects[projectId] 가 true 면 재진입이므로 부르지 않는다.
    const call = store.indexOf('restoreActiveGenerationView(projectId)')
    expect(call, 'restoreActiveGenerationView 호출이 없다').toBeGreaterThan(0)

    // "아직 안 본 프로젝트일 때만" 가지 안에 있어야 한다.
    const guardWindow = store.slice(Math.max(0, call - 400), call)
    expect(guardWindow).toMatch(/if \(viewportInitializedProjects\[projectId\] !== true\) \{/)
  })

  it('재진입에서는 저장된 탭을 그대로 쓴다', () => {
    const store = sourceOf('src/stores/director-store.ts')

    // 호출은 딱 한 곳 — 첫 진입 가지 안에서만. 여러 곳에서 부르면 재진입에도 걸린다.
    const calls = store.match(/void restoreActiveGenerationView\(/g) ?? []
    expect(calls).toHaveLength(1)
  })

  it('스토리보드 안의 Previz·Real 은 강제로 바뀌지 않는다', () => {
    const grid = sourceOf('src/features/director/canvas-views/StoryboardGridView.tsx')

    // 진입 시 1회가 아니라 작업이 도는 내내 되돌리던 effect — 사용자가 눌러도 다시 튕겼다.
    expect(grid).not.toMatch(/hasQueuedRealWork && mediaMode !== 'real'/)
  })

  it('탭 전환은 사용자 조작으로도 일어난다', () => {
    const page = sourceOf('src/app/studio/director/page.tsx')

    expect(page).toMatch(/onValueChange=\{\(v\) => setViewMode\(/)
  })

  it('저장된 탭은 계속 보존된다', () => {
    const store = sourceOf('src/stores/director-store.ts')

    expect(store).toMatch(/viewMode: s\.viewMode/)
  })
})
