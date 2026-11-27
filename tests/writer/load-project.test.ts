// Writer 자료(씬 · 샷)를 읽을 때 어느 프로젝트를 다 읽었는지 · 읽는 중 · 못 읽음을 남기고, 읽는 사이 프로젝트가 바뀌면 늦게 온 옛 자료를 넣지 않는지 — 다른 화면이 기대는 돌려주는 값 · 오류 삼키기는 그대로인지 — 를 검사한다 (오너 2026-11-27 P1 검토 rev-flow-2-2)
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 개발 DB 대신 쓰는 프로젝트별 답 — 표마다 돌려줄 것을 정하고, 문을 닫아 두면 열 때까지 답이 오지 않는다(늦게 오는 응답).
const fake = vi.hoisted(() => {
  type Result = { data: unknown; error: unknown }
  const results = new Map<string, Record<string, Result>>()
  const gates = new Map<string, { promise: Promise<void>; open: () => void }>()
  const flags = { throwOnCreate: false }
  const wait = (projectId: string) => gates.get(projectId)?.promise ?? Promise.resolve()
  function hold(projectId: string) {
    let open = () => {}
    const promise = new Promise<void>((resolve) => { open = resolve })
    gates.set(projectId, { promise, open })
  }
  const release = (projectId: string) => gates.get(projectId)?.open()
  const answer = (projectId: string, table: string): Result => results.get(projectId)?.[table] ?? { data: [], error: null }
  function query(table: string) {
    let projectId = ''
    const builder = {
      select: () => builder,
      eq: (column: string, value: string) => { if (column === 'project_id') projectId = value; return builder },
      order: () => builder,
      then: (ok: (result: Result) => unknown, fail?: (error: unknown) => unknown) => wait(projectId).then(() => answer(projectId, table)).then(ok, fail),
    }
    return builder
  }
  return { results, gates, flags, wait, hold, release, answer, query }
})
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    if (fake.flags.throwOnCreate) throw new Error('offline')
    return { from: fake.query }
  },
}))
vi.mock('@/lib/shots-cache', async (original) => ({
  ...await original<typeof import('@/lib/shots-cache')>(),
  loadShotsResult: (projectId: string) => fake.wait(projectId).then(() => fake.answer(projectId, 'shots')),
}))

import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'

/** 이 시험을 위해 지은 프로젝트 자료 — 씬 하나, 인물 하나, 샷 하나(대사 한 줄). */
function projectRows(projectId: string, line: string) {
  return {
    scenes: { data: [{ scene_id: 's1', sort_order: 0, narrative_summary: `${projectId} 씬`, characters_present: [] }], error: null },
    characters: { data: [{ character_id: 'mina', name: '미나', role: 'protagonist' }], error: null },
    locations: { data: [], error: null },
    shots: { data: [{ shot_id: 'sh_01_01', scene_id: 's1', sort_order: 0, shot_type: 'MS', dialogue_lines: [{ characterId: 'mina', text: line }] }], error: null },
  }
}
const store = () => useWriterStore.getState()
const lineOf = () => store().shots.find((shot) => shot.shotId === 'sh_01_01')?.dialogueLines?.[0]?.text

beforeEach(() => {
  fake.results.clear()
  fake.gates.clear()
  fake.flags.throwOnCreate = false
  useWriterStore.getState().reset()
  useProjectStore.setState({ projectId: 'A' })
  fake.results.set('A', projectRows('A', 'A 의 대사'))
  fake.results.set('B', projectRows('B', 'B 의 대사'))
})

describe('Writer 자료 읽기 — 어느 프로젝트 · 읽는 중 · 못 읽음', () => {
  // 왜(정상 경로 고정): Director 샷 상세의 대사 칸은 그 캔버스 프로젝트의 자료를 다 읽었을 때만 "대사 없음"이라고 말한다 — 그러려면 어느 프로젝트를 다 읽었는지 알아야 한다.
  it('다 읽으면 씬 · 샷과 함께 어느 프로젝트를 다 읽었는지 남긴다', async () => {
    await store().loadProject()
    expect(lineOf()).toBe('A 의 대사')
    expect(store().loadedProjectId).toBe('A')
    expect(store().loadAttempt).toBeNull()
  })

  // 왜: 새로 고침하거나 Director 로 바로 들어오면 캔버스가 먼저 그려지고 Writer 자료는 그 뒤에 온다 — 그 사이 카드를 누르면 "대사 없음"이 아니라 "불러오는 중"을 보여야 한다.
  it('읽는 동안은 그 프로젝트를 읽는 중으로 남긴다', async () => {
    fake.hold('A')
    const load = store().loadProject()
    expect(store().loadAttempt).toEqual({ projectId: 'A', status: 'loading' })
    expect(store().loadedProjectId).toBeNull()
    fake.release('A')
    await load
    expect(store().loadAttempt).toBeNull()
  })

  // 왜: 로그인이 끊겨 빈 목록이 오거나 읽기가 실패하면 loadProject 는 조용히 끝난다 — 그때 Director 세션 내내 모든 샷이 거짓 "대사 없음"이었다(검토 1번 ②).
  //   Producer · Artist · 내보내기 등 다른 화면이 기대는 것(던지지 않음 · 들고 있던 자료를 건드리지 않음)은 전과 같다.
  it('읽다가 오류가 나거나 씬이 0개로 오면 그 프로젝트를 못 읽음으로 남기고, 전처럼 오류를 던지지 않고 들고 있던 자료도 건드리지 않는다', async () => {
    const cases: Array<[string, () => void]> = [
      ['씬 읽기 오류', () => fake.results.set('A', { ...projectRows('A', 'x'), scenes: { data: null, error: { message: 'JWT expired' } } })],
      ['씬 0개', () => fake.results.set('A', { ...projectRows('A', 'x'), scenes: { data: [], error: null } })],
      ['던진 오류', () => { fake.flags.throwOnCreate = true }],
    ]
    for (const [label, arrange] of cases) {
      useWriterStore.getState().reset()
      fake.flags.throwOnCreate = false
      arrange()
      await expect(store().loadProject(), label).resolves.toBeUndefined()
      expect(store().loadAttempt, label).toEqual({ projectId: 'A', status: 'failed' })
      expect(store().loadedProjectId, label).toBeNull()
      expect(store().sceneManifest, label).toBeNull()
      expect(store().shots, label).toEqual([])
    }
  })

  // 왜: 이미 다 읽은 뒤 다시 읽기(Writer 화면 미리 읽기 등)만 실패한 것이면 들고 있는 자료는 그 프로젝트 것 그대로다 — 대사 칸은 그 대사를 계속 보인다.
  it('이미 다 읽은 프로젝트를 다시 읽다 못 읽으면 들고 있던 씬 · 샷과 다 읽은 표시를 그대로 둔다', async () => {
    await store().loadProject()
    fake.results.set('A', { ...projectRows('A', 'x'), scenes: { data: null, error: { message: 'timeout' } } })
    await store().loadProject()
    expect(lineOf()).toBe('A 의 대사')
    expect(store().loadedProjectId).toBe('A')
  })

  // 왜: 샷 목록만 못 읽으면 씬은 들어가고 샷은 빈 목록이 된다(전과 같음) — 그걸 다 읽은 것으로 남기면 대사가 있는 샷도 "대사 없음"으로 보인다.
  it('샷 목록을 못 읽으면 씬은 전처럼 넣지만 다 읽은 것으로 남기지 않고 못 읽음으로 남긴다', async () => {
    await store().loadProject()
    fake.results.set('A', { ...projectRows('A', 'x'), shots: { data: null, error: { message: 'timeout' } } })
    await store().loadProject()
    expect(store().sceneManifest?.scenes).toHaveLength(1)
    expect(store().shots).toEqual([])
    expect(store().loadedProjectId).toBeNull()
    expect(store().loadAttempt).toEqual({ projectId: 'A', status: 'failed' })
  })

  // 왜: 사용자 메뉴로 빨리 바꾸기 · 다음 화 만들기에서 옛 프로젝트 읽기가 늦게 오면, 비운 뒤 옛 씬 · 샷이 다시 들어와
  //   새 프로젝트 Director 샷 상세에 같은 이름 샷(sh_01_01)의 남의 대사가 보였다(검토 2번).
  it('읽는 사이 다른 프로젝트로 바꾸면 늦게 온 옛 프로젝트 자료를 넣지 않고, 새 프로젝트의 읽는 중 표시도 바꾸지 않는다', async () => {
    fake.hold('A')
    const loadA = store().loadProject()
    // 바꾸기는 switchProject 처럼 — writer-store 를 비운 뒤 새 프로젝트를 정한다.
    useWriterStore.getState().reset()
    useProjectStore.setState({ projectId: 'B' })
    fake.hold('B')
    const loadB = store().loadProject()
    fake.release('A')
    await loadA
    expect(store().sceneManifest).toBeNull()
    expect(store().shots).toEqual([])
    expect(store().loadedProjectId).toBeNull()
    expect(store().loadAttempt).toEqual({ projectId: 'B', status: 'loading' })
    fake.release('B')
    await loadB
    expect(lineOf()).toBe('B 의 대사')
    expect(store().loadedProjectId).toBe('B')
  })

  // 왜: 프로젝트를 바꿀 때 writer-store 를 비운다(switchProject) — 표시가 남으면 새 프로젝트 자료가 아직 없는데 다 읽은 것 · 못 읽은 것으로 보인다.
  it('자료를 비우면 어느 프로젝트를 다 읽었는지 · 읽는 중 · 못 읽음 표시도 지운다', async () => {
    await store().loadProject()
    useWriterStore.setState({ loadAttempt: { projectId: 'A', status: 'failed' } })
    useWriterStore.getState().reset()
    expect(store().loadedProjectId).toBeNull()
    expect(store().loadAttempt).toBeNull()
  })
})
