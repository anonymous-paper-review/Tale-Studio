import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectorNode } from '@/types/director'

const mockStore = vi.hoisted(() => {
  const state = {
    projectId: 'project-1',
    nodes: [] as DirectorNode[],
    videoBatchBusy: false,
    videoBatchProgress: null as { done: number; total: number; failed: number } | null,
    generateVideoForShot: vi.fn(),
  }
  const setState = vi.fn((patch: Record<string, unknown>) => {
    Object.assign(state, patch)
  })
  return { state, setState }
})

vi.mock('@/stores/director-store', () => ({
  useDirectorCanvasStore: {
    getState: () => mockStore.state,
    setState: mockStore.setState,
  },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

import {
  eligibleVideoBatchShotIds,
  runVideoBatch,
} from '@/lib/director/video-batch-client'

function node(id: string, data: Record<string, unknown>): DirectorNode {
  return {
    id,
    type: String(data.kind),
    position: { x: 0, y: 0 },
    data,
  } as unknown as DirectorNode
}

const shot = (id: string) => node(id, { kind: 'shot' })
const video = (
  id: string,
  parentShotNodeId: string,
  patch: Record<string, unknown> = {},
) =>
  node(id, {
    kind: 'video',
    parentShotNodeId,
    status: 'pending',
    lastAttemptStatus: null,
    videoUrl: null,
    ...patch,
  })

beforeEach(() => {
  mockStore.state.projectId = 'project-1'
  mockStore.state.nodes = []
  mockStore.state.videoBatchBusy = false
  mockStore.state.videoBatchProgress = null
  mockStore.state.generateVideoForShot.mockReset()
  mockStore.setState.mockClear()
})

describe('eligibleVideoBatchShotIds', () => {
  it('keeps Shot node order and excludes playable or generating children', () => {
    const nodes = [
      shot('shot-3'),
      video('video-generating', 'shot-3', { status: 'generating' }),
      shot('shot-1'),
      video('video-complete', 'shot-1', {
        status: 'completed',
        videoUrl: 'https://media.example/complete.mp4',
      }),
      shot('shot-4'),
      video('video-attempt', 'shot-4', { lastAttemptStatus: 'generating' }),
      shot('shot-2'),
      video('video-unplayable', 'shot-2', { status: 'completed', videoUrl: null }),
    ]

    expect(eligibleVideoBatchShotIds(nodes)).toEqual(['shot-2'])
  })
})

describe('runVideoBatch', () => {
  it('runs at most three jobs, counts null results as failures, and clears progress', async () => {
    mockStore.state.nodes = [shot('shot-1'), shot('shot-2'), shot('shot-3'), shot('shot-4'), shot('shot-5')]
    let active = 0
    let maxActive = 0
    mockStore.state.generateVideoForShot.mockImplementation(
      (shotId: string) =>
        new Promise<string | null>((resolve) => {
          active += 1
          maxActive = Math.max(maxActive, active)
          setTimeout(() => {
            active -= 1
            resolve(shotId === 'shot-2' ? null : `video-${shotId}`)
          }, 0)
        }),
    )

    const result = await runVideoBatch('project-1', { silent: true })

    expect(maxActive).toBe(3)
    expect(result).toEqual({ total: 5, started: 4, failed: 1 })
    expect(mockStore.state.generateVideoForShot).toHaveBeenCalledTimes(5)
    expect(mockStore.state.generateVideoForShot).toHaveBeenCalledWith('shot-1', {
      batch: true,
      onJob: undefined,
    })
    const progressUpdates = mockStore.setState.mock.calls
      .map(([patch]) => patch.videoBatchProgress)
      .filter(Boolean)
    expect(progressUpdates.at(-1)).toEqual({ done: 5, total: 5, failed: 1 })
    expect(mockStore.state.videoBatchBusy).toBe(false)
    expect(mockStore.state.videoBatchProgress).toBeNull()
  })
})
