// 샷 저장(writer-store)이 샷 이야기 칸(영어 주 칸 action_description · 화면 말 칸 _native)을 이야기가 실제로 바뀌었을 때만 쓰는지 — 대사 · 길이 · 샷 타입만 고치면 이야기 칸을 건드리지 않아 Director 에서 고친 프롬프트가 남고, 이야기 저장이 실패해도 [다시 저장]이 이야기를 쓰는지 — 검사한다 (리드 2026-11-27 결정 ② · 11/2부터 대사 탭에서 있던 고장)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Shot } from '@/types'

// 개발 DB 대신 쓰는 샷 표 — 무엇을 썼는지 적고, 시험이 실패 · 늦은 응답을 정한다.
const db = vi.hoisted(() => ({
  writes: [] as Array<Record<string, unknown>>,
  failNext: 0,
  gate: null as null | Promise<void>,
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: (values: Record<string, unknown>) => {
        const fail = db.failNext > 0
        if (fail) db.failNext -= 1
        db.writes.push(values)
        const wait = db.gate ?? Promise.resolve()
        const query = {
          eq: () => query,
          then: (resolve: (value: { error: { message: string } | null }) => unknown) =>
            wait.then(() => ({ error: fail ? { message: 'network down' } : null })).then(resolve),
        }
        return query
      },
    }),
  }),
}))
vi.mock('@/lib/shots-cache', async (original) => ({ ...(await original<typeof import('@/lib/shots-cache')>()), invalidateShots: vi.fn().mockResolvedValue(undefined) }))

import { flushShotSave, useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'

const STORY_COLUMNS = ['action_description', 'action_description_native']
// 이 시험을 위해 지은 샷 — 화면 말(한국어) 이야기 · 말투 칸이 있는 대사 한 줄.
const shot = {
  shotId: 'sh_01_01', sceneId: 'sc_01', sortOrder: 0, shotType: 'MS', actionDescription: '지친 여자가 고개를 든다.',
  characters: ['woman'], durationSeconds: 3, generationMethod: 'T2V', dialogueLines: [{ characterId: 'woman', text: '하아.', delivery: '한숨' }],
  camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5000 },
} as unknown as Shot
const lastWrite = () => db.writes.at(-1) ?? {}
const save = async (changes: Partial<Shot>) => {
  useWriterStore.getState().updateShot('sh_01_01', changes)
  await flushShotSave('sh_01_01')
}
const expectNoStory = (label: string) => {
  for (const column of STORY_COLUMNS) expect(lastWrite(), `${label} · ${column}`).not.toHaveProperty(column)
}

beforeEach(() => {
  db.writes.length = 0
  db.failNext = 0
  db.gate = null
  useProjectStore.setState({ projectId: 'project-story' })
  useWriterStore.setState({ sceneManifest: { scenes: [], characters: [], locations: [] }, shots: [shot], error: null })
})
afterEach(() => {
  useWriterStore.getState().reset()
})

describe('샷 저장 — 이야기 칸은 이야기가 실제로 바뀌었을 때만', () => {
  // 왜(리드 결정 ② · 11/2부터 대사 탭 고장): 화면 저장은 이야기 칸에 화면 말 글을 영어 주 칸에도 썼다 — 대사 한 줄만 고쳐도 영어 이야기 칸이 한국어로 바뀌고,
  //   방아쇠(shots_clear_director_prompt — 영어 이야기 칸이 바뀌면)가 Director 에서 고친 프롬프트를 지웠다(개발 DB 복사본 48acb252 Shot 8 실측). 두 팝업 · 대사 탭 저장이 이 길이다.
  it('대사만 고치면 이야기 칸을 쓰지 않아 Director 에서 고친 프롬프트가 남는다', async () => {
    const lines = [{ characterId: 'woman', text: '하아, 길었다.', delivery: '한숨' }] as Shot['dialogueLines']
    await save({ dialogueLines: lines })
    expect(lastWrite().dialogue_lines).toEqual(lines)
    expectNoStory('대사만')
  })

  // 왜(정상 경로 고정): 사람이 샷 이야기를 고치면 영어 주 칸 · 화면 말 칸 모두 그 글이 된다(러프 그리기가 영어를 다시 뽑는다 — S3b). Director 고친 프롬프트가 지워지는 것은 맞다(이야기가 바뀜).
  it('이야기를 고치면 지금처럼 두 칸을 쓴다', async () => {
    await save({ actionDescription: '지친 여자가 창밖을 본다.' })
    expect(lastWrite()).toMatchObject({ action_description: '지친 여자가 창밖을 본다.', action_description_native: '지친 여자가 창밖을 본다.' })
  })

  // 왜(리드 결정 ②): 샷 고치기 창의 [다시 저장]은 바뀐 칸 없이 그 샷을 다시 저장한다 — 이야기를 고친 표시가 실패에 지워지면 고친 이야기가 끝내 저장되지 않는다.
  it('이야기 저장이 실패한 뒤 [다시 저장]하면 이야기가 써진다', async () => {
    db.failNext = 1
    await expect(save({ actionDescription: '지친 여자가 창밖을 본다.' })).rejects.toThrow('network down')
    await save({})
    expect(lastWrite()).toMatchObject({ action_description: '지친 여자가 창밖을 본다.', action_description_native: '지친 여자가 창밖을 본다.' })
    // 이야기를 쓴 저장이 성공했으면 그 뒤의 다른 저장은 이야기 칸을 다시 쓰지 않는다.
    await save({ durationSeconds: 4 })
    expectNoStory('성공 뒤 길이')
  })

  // 왜(리드 결정 ② — 같은 고장의 다른 길): 길이 · 샷 타입만 고쳐도 이야기 칸을 다시 써 Director 고친 프롬프트가 지워졌다.
  it('길이 · 샷 타입만 고치면 이야기 칸을 쓰지 않는다', async () => {
    await save({ durationSeconds: 5 })
    expect(lastWrite().duration_seconds).toBe(5)
    expectNoStory('길이')
    await save({ shotType: 'CU' })
    expect(lastWrite().shot_type).toBe('CU')
    expectNoStory('샷 타입')
  })

  // 왜(혼자 정한 것 — "실제로 바뀌었을 때만"): 지금과 같은 이야기를 함께 보내는 저장(창 전체 값)도 있다 — 같은 글이면 영어 주 칸을 덮지 않는다.
  it('이야기 칸에 지금과 같은 글을 다시 넣어도 이야기 칸은 쓰지 않는다', async () => {
    await save({ actionDescription: '지친 여자가 고개를 든다.', durationSeconds: 6 })
    expect(lastWrite().duration_seconds).toBe(6)
    expectNoStory('같은 글')
  })

  // 왜(혼자 정한 것): 이야기를 저장하는 사이 또 고치면, 앞 저장의 성공이 표시를 지워 뒤 고침이 영어 주 칸에 안 써지면 안 된다.
  it('이야기를 저장하는 사이 또 고치면 뒤 고침도 이야기 칸에 써진다', async () => {
    let open = () => {}
    db.gate = new Promise<void>((resolve) => { open = resolve })
    useWriterStore.getState().updateShot('sh_01_01', { actionDescription: '첫 고침.' })
    const first = flushShotSave('sh_01_01')
    // 첫 저장이 실제로 나갈 때까지(그 저장은 첫 고침을 싣고 응답을 기다린다) — 그 사이에 둘째 고침.
    for (let i = 0; i < 50 && db.writes.length === 0; i++) await Promise.resolve()
    expect(db.writes[0]).toMatchObject({ action_description: '첫 고침.' })
    useWriterStore.getState().updateShot('sh_01_01', { actionDescription: '둘째 고침.' })
    db.gate = null
    open()
    await first
    await flushShotSave('sh_01_01')
    expect(lastWrite()).toMatchObject({ action_description: '둘째 고침.', action_description_native: '둘째 고침.' })
  })
})
