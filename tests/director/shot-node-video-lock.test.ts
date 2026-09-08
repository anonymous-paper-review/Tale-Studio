// 이미 만들고 있는 샷은 새로고침 뒤에도 다시 만들기를 누를 수 없다
//
// 연타 방지가 브라우저 메모리(모듈 스코프 Map)에만 있어 새로고침·새 탭에서 사라졌다.
// Node 뷰 Branch 버튼에는 disabled 도 없어 같은 샷을 또 만들 수 있었다 — 영상 1건은 최대 5 Take.
// 같은 화면의 Storyboard 그리드 뷰는 안 뚫린다: DB 큐(generation_jobs queued)를 근거로 잠그기 때문이다.
// 그 근거를 Node 뷰도 쓰게 한다. 서버 진실이라 새로고침해도 남는다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { activeShotIds } from '@/lib/generation-queue'

const ROOT = process.cwd()

function sourceOf(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8')
}

describe('영상 만들기 버튼 잠금', () => {
  it('DB 큐에 앉은 샷은 만드는 중으로 본다', () => {
    const queued = activeShotIds(
      [
        { id: 'j1', kind: 'shot_video', target: { writerShotId: 'sh_01' } },
        { id: 'j2', kind: 'shot_storyboard', target: { writerShotId: 'sh_02' } },
      ] as never,
      ['shot_video'],
    )

    expect(queued.has('sh_01')).toBe(true)
    // 다른 종류의 작업은 영상 버튼을 잠그지 않는다.
    expect(queued.has('sh_02')).toBe(false)
  })

  it('Node 뷰 카드가 그리드 뷰와 같은 근거로 잠근다', () => {
    const shotNode = sourceOf('src/features/director/canvas-nodes/ShotNode.tsx')

    // 브라우저 메모리가 아니라 서버 큐를 본다 — 새로고침해도 남는 유일한 근거다.
    expect(shotNode).toMatch(/useActiveGenerationJobs|queuedVideoShots|videoQueued/)
  })

  it('만드는 중이면 Branch 버튼을 누를 수 없다', () => {
    const shotNode = sourceOf('src/features/director/canvas-nodes/ShotNode.tsx')

    // canBranch 가 조건 없이 true 면 새로고침 뒤 재클릭이 열린다.
    expect(shotNode).not.toMatch(/^\s+canBranch\s*$/m)
  })
})
