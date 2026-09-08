// 내가 고른 탭은 생성이 돌아도 바뀌지 않는다
//
// Director 에는 노드(배선 작업)와 스토리보드(결과 훑어보기) 두 탭이 있고, 고른 탭은 저장된다.
// 그런데 진입 시 진행 중인 잡이 있으면 저장된 탭을 무시하고 스토리보드로 강제 전환했다 —
// 배선 작업 중 새로고침하면 하던 화면을 잃었다. 스토리보드 안의 Previz/Real 토글까지 덮어써서
// 이미 스토리보드를 보던 사람도 당했다.
//
// 도입 의도(#06a0b045: 만들어지는 결과를 바로 보여주자)는 합리적이었지만, 같은 파일의 반대 정책
// (#c4 "화면을 빼앗지 않는다")과 충돌했고, 미리보기 영상은 목록에서 빠져 일관되게 작동한 적도 없다.
// 오너 판정(2026-09-08): 없앤다. 탭은 사용자가 고르는 것이다.
//
// 진행 표시는 그대로다 — 사이드바 배지·채팅 진행 핀·카드 스피너가 계속 알려준다.
// 없어지는 것은 "화면을 대신 옮겨주는 동작" 하나뿐이다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

function sourceOf(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8')
}

describe('Director 탭 선택', () => {
  it('진입할 때 탭을 강제로 바꾸는 코드가 없다', () => {
    const store = sourceOf('src/stores/director-store.ts')

    expect(store).not.toMatch(/restoreActiveGenerationView/)
  })

  it('진행 중인 작업을 근거로 탭을 바꾸지 않는다', () => {
    const store = sourceOf('src/stores/director-store.ts')

    // /api/generation/active 는 진행 중인 잡 목록이다. 그걸 읽어 화면을 옮기던 유일한 경로였다.
    expect(store).not.toMatch(/generation\/active/)
  })

  it('탭 전환은 사용자 조작으로만 일어난다', () => {
    const page = sourceOf('src/app/studio/director/page.tsx')

    // 탭 UI 의 onValueChange 가 setViewMode 를 부르는 경로는 남아 있어야 한다.
    expect(page).toMatch(/onValueChange=\{\(v\) => setViewMode\(/)
  })

  it('스토리보드 안의 Previz·Real 도 강제로 바뀌지 않는다', () => {
    const grid = sourceOf('src/features/director/canvas-views/StoryboardGridView.tsx')

    // 진입 시 한 번이 아니라 작업이 도는 내내 되돌리던 effect — 사용자가 눌러도 다시 튕겼다.
    expect(grid).not.toMatch(/hasQueuedRealWork && mediaMode !== 'real'/)
  })

  it('저장된 탭은 계속 보존된다', () => {
    const store = sourceOf('src/stores/director-store.ts')

    // partialize 에 viewMode 가 남아야 다음 진입에도 고른 탭이 유지된다.
    expect(store).toMatch(/viewMode: s\.viewMode/)
  })
})
