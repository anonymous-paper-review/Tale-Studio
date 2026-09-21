// 일괄이 도는 중에는 같은 자리에서 멈출 수 있다
//
// #batch-resume(2026-09-09) 오너 결정 ①. 지금까지 일괄을 멈추는 방법은 창을 닫는 것뿐이었다 —
// 브라우저가 순번을 들고 돌았기 때문이다. 서버가 이어받으면 창을 닫아도 계속 만들어지므로
// 명시적인 중단 수단이 필요하다. 잘못 걸었을 때 Take 가 계속 나간다.
//
// 자리를 새로 만들지 않는다: "영상 다 만들기" 버튼이 도는 동안 "중단" 으로 바뀐다.
// 지금은 그 버튼이 진행 중에 비활성이라 아무것도 못 한다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDirectorCanvasStore } from '@/stores/director-store'

const ROOT = process.cwd()

function sourceOf(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8')
}

beforeEach(() => {
  useDirectorCanvasStore.setState({ videoBatchBusy: false, videoBatchCancelled: false })
})

describe('일괄 중단 상태', () => {
  it('처음에는 중단되지 않은 상태다', () => {
    expect(useDirectorCanvasStore.getState().videoBatchCancelled).toBe(false)
  })

  it('중단하면 중단 표시가 남는다', () => {
    useDirectorCanvasStore.setState({ videoBatchBusy: true })

    useDirectorCanvasStore.getState().cancelVideoBatch()

    expect(useDirectorCanvasStore.getState().videoBatchCancelled).toBe(true)
  })

  it('일괄을 새로 시작하면 중단 표시가 풀린다', () => {
    // 안 풀면 다음 일괄이 시작하자마자 멈춘다.
    useDirectorCanvasStore.setState({ videoBatchCancelled: true })

    useDirectorCanvasStore.getState().beginVideoBatch(5)

    expect(useDirectorCanvasStore.getState().videoBatchCancelled).toBe(false)
    expect(useDirectorCanvasStore.getState().videoBatchBusy).toBe(true)
  })

  it('돌지 않을 때 중단을 눌러도 아무 일이 없다', () => {
    useDirectorCanvasStore.getState().cancelVideoBatch()

    expect(useDirectorCanvasStore.getState().videoBatchCancelled).toBe(false)
  })
})

describe('일괄 버튼', () => {
  it('도는 중에는 중단 버튼이 된다', () => {
    const page = sourceOf('src/app/studio/director/page.tsx')

    // 예전에는 진행 중에 비활성이라 아무것도 못 했다.
    expect(page).not.toMatch(/disabled=\{videoBatchBusy\}/)
    expect(page).toMatch(/cancelVideoBatch/)
  })

  it('멈추는 중이라는 것을 알린다', () => {
    const page = sourceOf('src/app/studio/director/page.tsx')

    // 이미 제출된 영상은 계속 만들어진다 — 그 사실을 알려야 사용자가 오해하지 않는다.
    expect(page).toMatch(/Stop after current/)
  })
})
