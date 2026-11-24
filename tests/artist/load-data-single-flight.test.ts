// 화면이 그림 데이터를 다시 읽는 동안 같은 읽기를 겹쳐 보내지 않는다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), gate: { release: () => {}, wait: Promise.resolve() as Promise<void> } }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: mocks.from }) }))

import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'

// 풀어 주기 전까지 답하지 않는 질문 사슬.
function chain() {
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'order']) q[name] = () => q
  q.maybeSingle = () => q
  q.then = (resolve: (value: unknown) => unknown) => mocks.gate.wait.then(() => ({ data: [], error: null })).then(resolve)
  return q
}

function holdAnswers() {
  mocks.gate.wait = new Promise<void>((resolve) => { mocks.gate.release = resolve })
}

describe('그림 데이터 읽기 겹침 막기', () => {
  beforeEach(() => {
    mocks.from.mockReset()
    mocks.from.mockImplementation(() => chain())
    useProjectStore.setState({ projectId: 'p1' })
  })

  it('읽기가 진행 중일 때 다시 요청하면 새 질문을 보내지 않고 진행 중인 결과를 기다린다', async () => {
    holdAnswers()
    const first = useArtistStore.getState().loadData()
    const second = useArtistStore.getState().loadData()
    expect(second).toBe(first)
    expect(mocks.from).toHaveBeenCalledTimes(8)
    mocks.gate.release()
    await Promise.all([first, second])
    expect(mocks.from).toHaveBeenCalledTimes(8)
  })

  it('읽기가 끝난 뒤 요청하면 새로 질문한다', async () => {
    holdAnswers()
    const first = useArtistStore.getState().loadData()
    mocks.gate.release()
    await first
    await useArtistStore.getState().loadData()
    expect(mocks.from).toHaveBeenCalledTimes(16)
  })

  it('다른 프로젝트의 읽기는 겹쳐도 각각 질문한다', async () => {
    holdAnswers()
    const first = useArtistStore.getState().loadData()
    useProjectStore.setState({ projectId: 'p2' })
    const second = useArtistStore.getState().loadData()
    expect(second).not.toBe(first)
    expect(mocks.from).toHaveBeenCalledTimes(16)
    mocks.gate.release()
    await Promise.all([first, second])
  })
})
