// Director 상태 고르기는 화면에만 있는 값이다: 처음엔 전체, 고른 상태를 기억, 다른 프로젝트로 가면 전체 (시안 D1 406:3717, 오너 2026-11-14)
import { beforeEach, describe, expect, it } from 'vitest'
import { useDirectorCanvasStore } from '@/stores/director-store'

beforeEach(() => {
  useDirectorCanvasStore.setState({ projectId: 'p1', statusFilter: 'all', pickedShotIds: [] })
})

describe('상태 고르기 값', () => {
  it('Director 상태 고르기는 처음에 전체이고 고른 상태를 기억한다', () => {
    // 왜: 드롭다운에서 고른 상태 샷만 보이게 거르는 기준.
    expect(useDirectorCanvasStore.getState().statusFilter).toBe('all')
    useDirectorCanvasStore.getState().setStatusFilter('image_needed')
    expect(useDirectorCanvasStore.getState().statusFilter).toBe('image_needed')
  })

  it('다른 프로젝트로 가면 상태 고르기가 전체로 돌아간다', () => {
    // 왜: 다른 프로젝트에서 걸러 둔 상태 때문에 샷이 안 보이는 일을 막는다.
    useDirectorCanvasStore.getState().setStatusFilter('video_done')
    useDirectorCanvasStore.getState().setProjectId('p2')
    expect(useDirectorCanvasStore.getState().statusFilter).toBe('all')
  })
})

describe('상태 고르기와 고른 샷', () => {
  it('상태 고르기를 바꾸면 고른 샷이 풀린다 — 숨은 고름 때문에 단추가 말없이 전체로 넓어지지 않게', () => {
    // 왜: 고른 샷이 모두 숨으면 단추가 확인 없이 보드 전체를 셌다([Make images · 20], 리드 검토 a 낮음 5a).
    useDirectorCanvasStore.getState().setPickedShots(['a', 'b'])
    useDirectorCanvasStore.getState().setStatusFilter('video_done')
    expect(useDirectorCanvasStore.getState().pickedShotIds).toEqual([])
    // 같은 상태를 다시 고르면 고름은 그대로다.
    useDirectorCanvasStore.getState().setPickedShots(['c'])
    useDirectorCanvasStore.getState().setStatusFilter('video_done')
    expect(useDirectorCanvasStore.getState().pickedShotIds).toEqual(['c'])
  })
})
