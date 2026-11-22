// 프로젝트를 처음 열 때만 만드는 중인 샷의 씬으로 열고, 그 뒤로는 내가 고른 씬을 유지한다
//
// 2026-11-22 오너 D2~D5 · D8: Director 의 스토리보드 보기를 없애고 노드 보기를 씬별로 바꿨다. 예전 이 파일은 "노드 | 스토리보드" 탭을 다뤘다
//   (처음 열 때만 결과 화면 = 스토리보드로, 그 뒤로는 고른 탭 유지). 같은 판정을 씬으로 옮긴다.
//
// 오너 판정(2026-09-08): 진입 시 1회는 의도한 동작이다. 다만 "1회" 는 프로젝트당 최초 1회다.
//   - 이 브라우저가 처음 보는 프로젝트 + 만들고 있는 게 있음 → 그 샷의 씬으로 연다(지금 보는 씬 기억이 없을 때만)
//   - 재진입(새로고침 포함) → 내가 고른(기억한) 씬 그대로
// 판별은 #first-entry-node(2026-08-27) 가 쓰는 viewportInitializedProjects 를 그대로 쓴다.
//
// 함께 없앤 것: StoryboardGridView 의 effect 는 진입 시 1회가 아니라 작업이 도는 내내 되돌려서
//   사용자가 Previz 를 눌러도 다음 렌더에 Real 로 다시 튕겼다. 그건 의도가 아니므로 제거한다(격자 부품은 Camera 가 다시 쓸 수 있어 남는다).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

function sourceOf(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8')
}

describe('Director 탭 선택', () => {
  it('프로젝트를 처음 열 때만 만드는 중인 샷의 씬을 찾는다', () => {
    const store = sourceOf('src/stores/director-store.ts')

    // 복원 호출이 "처음 보는 프로젝트" 가지 안에 있어야 한다.
    // viewportInitializedProjects[projectId] 가 true 면 재진입이므로 부르지 않는다.
    const call = store.indexOf('restoreActiveGenerationView(projectId)')
    expect(call, 'restoreActiveGenerationView 호출이 없다').toBeGreaterThan(0)

    // "아직 안 본 프로젝트일 때만" 가지 안에 있어야 한다.
    const guardWindow = store.slice(Math.max(0, call - 400), call)
    expect(guardWindow).toMatch(/if \(viewportInitializedProjects\[projectId\] !== true\) \{/)
  })

  it('다시 들어오면 기억한 씬을 그대로 쓴다', () => {
    const store = sourceOf('src/stores/director-store.ts')

    // 호출은 딱 한 곳 — 첫 진입 가지 안에서만. 여러 곳에서 부르면 재진입에도 걸린다.
    const calls = store.match(/void restoreActiveGenerationView\(/g) ?? []
    expect(calls).toHaveLength(1)
    // 찾은 샷은 단서일 뿐 — 기억한 씬이 있으면 기억이 앞선다(lib/current-scene resolveCurrentScene). 보기를 바꾸지도 않는다.
    const restore = store.slice(store.indexOf('async function restoreActiveGenerationView'), store.indexOf('/** 멈춘 작업이 뒤늦게 끝났다는 알림의 샷 이름'))
    expect(restore).toMatch(/firstEntrySceneHint: \{ shotIds, settled: true \}/)
    expect(restore).not.toMatch(/setViewMode\(/)
    expect(sourceOf('src/lib/current-scene.ts')).toMatch(/if \(remembered && keys\.includes\(remembered\)\) return remembered\s*if \(preferred && keys\.includes\(preferred\)\) return preferred/)
  })

  it('스토리보드 안의 Previz·Real 은 강제로 바뀌지 않는다', () => {
    const grid = sourceOf('src/features/director/canvas-views/StoryboardGridView.tsx')

    // 진입 시 1회가 아니라 작업이 도는 내내 되돌리던 effect — 사용자가 눌러도 다시 튕겼다.
    expect(grid).not.toMatch(/hasQueuedRealWork && mediaMode !== 'real'/)
  })

  it('씬은 사용자가 씬 단추로 바꾼다', () => {
    const page = sourceOf('src/app/studio/director/page.tsx')

    expect(page).toMatch(/onChange=\{\(key\) => switchDirectorScene\(sceneProjectId, key\)\}/)
  })

  it('보던 씬은 이 브라우저에 기억되어 다시 들어와도 남는다', () => {
    const store = sourceOf('src/stores/current-scene-store.ts')

    expect(store).toMatch(/partialize: \(s\) => \(\{ sceneByProject: s\.sceneByProject \}\)/)
    // 처음 여는 프로젝트의 확인을 마치면 화면이 보인 씬을 기억에 쓴다 — 확인 전에 쓰면 만드는 중인 샷의 씬으로 열 수 없다.
    expect(sourceOf('src/features/director/hooks/use-scene-view.ts')).toMatch(/const shouldRemember = hint\.settled && !!sceneKey && !remembered/)
  })
})
