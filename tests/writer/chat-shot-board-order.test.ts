// 씬을 끼워 넣어 샷 목록 차례가 보드와 달라져도, 채팅이 보드 이름으로 고치거나 지우면 보드의 그 샷을 고치고 지우는지 검사한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Scene, Shot } from '@/types'

const { deleted } = vi.hoisted(() => ({ deleted: [] as string[] }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const query = {
        eq: (key: string, value: unknown) => {
          if (key === 'shot_id' && pendingDelete) { deleted.push(String(value)); pendingDelete = false }
          return query
        },
        then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
      }
      let pendingDelete = false
      return {
        insert: async () => ({ error: null }),
        update: () => query,
        delete: () => { pendingDelete = true; return query },
      }
    },
  }),
}))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined) }))

import { useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import { resolveChatShotRef } from '@/lib/writer/chat-id-resolve'

const scene = (sceneId: string, sortOrder: number): Scene => ({
  sceneId, sortOrder, location: 'room', timeOfDay: 'day', mood: 'calm', narrativeSummary: sceneId, originalTextQuote: '',
  charactersPresent: [], estimatedDurationSeconds: 10,
})
const shot = (shotId: string, sceneId: string, sortOrder: number): Shot => ({
  shotId, sceneId, sortOrder, shotType: 'MS', actionDescription: shotId, characters: [], durationSeconds: 5, generationMethod: 'T2V', dialogueLines: [],
  camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5000 },
})
// 리뷰 재현 그대로: 씬 1 과 2 사이에 씬(sc_03)을 끼워 넣고 샷을 더했다 — 새 샷은 샷 목록 맨 뒤에 붙는다(writer-store addShot).
//   보드: Scene 1 = sh_01_01 · sh_01_02, Scene 2 = sc_03 의 sh_03_05(Shot 3), Scene 3 = sc_02 의 sh_02_03(Shot 4) · sh_02_04(Shot 5).
const manifest = { scenes: [scene('sc_01', 0), scene('sc_03', 1), scene('sc_02', 2)], characters: [], locations: [] }
const shots = () => [shot('sh_01_01', 'sc_01', 0), shot('sh_01_02', 'sc_01', 1), shot('sh_02_03', 'sc_02', 2), shot('sh_02_04', 'sc_02', 3), shot('sh_03_05', 'sc_03', 4)]

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ started: true, pipeline_completed: true }) }))
  useProjectStore.setState({ projectId: 'board-order-test', currentStage: 'writer' })
  useWriterStore.setState({ sceneManifest: manifest, shots: shots(), error: null })
  deleted.length = 0
})
afterEach(async () => {
  await vi.runOnlyPendingTimersAsync()
  useWriterStore.getState().reset()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const typeOf = (id: string) => useWriterStore.getState().shots.find((s) => s.shotId === id)?.shotType

describe('씬을 끼워 넣은 뒤 보드 이름으로 고치기 · 지우기', () => {
  // 왜: 2026-11-02 리뷰 3차 M1 — 샷 찾기가 씬 차례를 "샷 목록에 처음 나온 차례"로 셌다. 끼워 넣은 씬의 샷은 목록 맨 뒤에 붙어
  //   "Scene 2 · Shot 3" · "Shot 3"이 보드의 Scene 3 · Shot 4(sh_02_03)로 풀렸고, 채팅 지우기는 묻지 않고 엉뚱한 샷을 지웠다.
  it('씬을 끼워 넣은 뒤에도 채팅이 보드 이름으로 고치거나 지우면 보드의 그 샷을 고치고 지운다', async () => {
    expect(resolveChatShotRef(shots(), 'Scene 2 · Shot 3', { manifest })).toEqual({ kind: 'shot', shotId: 'sh_03_05' })
    expect(resolveChatShotRef(shots(), 'Shot 4', { manifest })).toEqual({ kind: 'shot', shotId: 'sh_02_03' })

    await useWriterStore.getState().applyChatUpdates([{ type: 'updateShot', id: 'Scene 2 · Shot 3', patch: { shotType: 'CU' } }])
    expect(typeOf('sh_03_05')).toBe('CU')
    expect(typeOf('sh_02_03')).toBe('MS')

    const result = await useWriterStore.getState().applyChatUpdates([{ type: 'deleteShot', id: 'Shot 3' }])
    expect(result.skipped).toEqual([])
    expect(deleted).toEqual(['sh_03_05'])
    expect(useWriterStore.getState().shots.map((s) => s.shotId)).toEqual(['sh_01_01', 'sh_01_02', 'sh_02_03', 'sh_02_04'])
  })

  // 왜: 리뷰 3차 L4 — 지우기는 되돌릴 수 없다. 정확한 id 나 보드 이름("Scene 2 · Shot 3" · "Shot 3")일 때만 지우고,
  //   id 꼴("shot_3")이나 씬 안 자리("씬3 샷1")로는 지우지 않고 못 찾았다고(묻게) 한다.
  it('지우기는 정확한 id 나 보드 이름일 때만 하고, "shot_3" 같은 id 꼴이나 "씬3 샷1" 같은 자리 말로는 지우지 않는다', async () => {
    const result = await useWriterStore.getState().applyChatUpdates([
      { type: 'deleteShot', id: 'shot_3' },
      { type: 'deleteShot', id: '씬3 샷1' },
    ])
    expect(deleted).toEqual([])
    expect(result.skipped).toHaveLength(2)
    expect(useWriterStore.getState().shots).toHaveLength(5)
  })

  // 왜: 리뷰 3차 L4 — 예전 id(shot_7)를 쓰는 프로젝트에서 지워진 "shot_7"을 보드 Shot 7 로 바꿔 읽었다. 보드 번호로 읽는 것은
  //   말("Shot 7" · "샷 7")뿐이고 id 꼴은 아니다.
  it('예전 id 꼴("shot_7")은 보드 번호로 읽지 않는다 — 그 id 가 없으면 보드 Shot 7 이 아니라 못 찾음이다', () => {
    const legacy = ['shot_1', 'shot_2', 'shot_3', 'shot_4', 'shot_5', 'shot_6', 'shot_8'].map((id) => ({ shotId: id, sceneId: 'sc_01' }))
    const board = { scenes: [{ sceneId: 'sc_01' }] }
    expect(resolveChatShotRef(legacy, 'shot_7', { manifest: board })).toBeNull()
    expect(resolveChatShotRef(legacy, 'Shot 7', { manifest: board })).toEqual({ kind: 'shot', shotId: 'shot_8' })
  })
})

// 리뷰 4차 재현 보드 그대로: Scene 1 = sh_01_01(Shot 1) · sh_01_02(Shot 2), Scene 2 = sh_02_03(Shot 3) · sh_02_04(Shot 4) · sh_02_05(Shot 5).
function reviewerBoard() {
  useWriterStore.setState({
    sceneManifest: { scenes: [scene('sc_01', 0), scene('sc_02', 1)], characters: [], locations: [] },
    shots: [shot('sh_01_01', 'sc_01', 0), shot('sh_01_02', 'sc_01', 1), shot('sh_02_03', 'sc_02', 2), shot('sh_02_04', 'sc_02', 3), shot('sh_02_05', 'sc_02', 4)],
    error: null,
  })
}
const idsOf = () => useWriterStore.getState().shots.map((s) => s.shotId)

describe('한 답 안의 여러 고침은 답을 받기 전 보드로 푼다', () => {
  // 왜: 2026-11-02 리뷰 4차 — 한 답의 고침을 하나씩 적용하면서 그때그때의 보드로 이름을 풀어, 앞의 지우기가 번호를 당겨
  //   "Shot 3" + "Shot 4"를 지우라는 답이 sh_02_03 과 sh_02_05 를 지웠다(지우려던 sh_02_04 는 남음).
  it('한 번의 채팅 답에서 보드 이름으로 샷 둘을 지우면 답을 받기 전 보드의 그 두 샷을 지운다', async () => {
    reviewerBoard()
    const result = await useWriterStore.getState().applyChatUpdates([{ type: 'deleteShot', id: 'Shot 3' }, { type: 'deleteShot', id: 'Shot 4' }])
    expect(result.skipped).toEqual([])
    expect(deleted).toEqual(['sh_02_03', 'sh_02_04'])
    expect(idsOf()).toEqual(['sh_01_01', 'sh_01_02', 'sh_02_05'])
  })

  // 왜: 같은 까닭으로 지운 뒤의 고치기도 한 칸 밀린 샷을 고쳤다.
  it('같은 답에서 샷을 지운 뒤 보드 이름으로 고치면 답을 받기 전 보드의 그 샷을 고친다', async () => {
    reviewerBoard()
    await useWriterStore.getState().applyChatUpdates([{ type: 'deleteShot', id: 'Shot 3' }, { type: 'updateShot', id: 'Shot 4', patch: { shotType: 'CU' } }])
    expect(typeOf('sh_02_04')).toBe('CU')
    expect(typeOf('sh_02_05')).toBe('MS')
  })

  // 왜: 끼울 자리(afterShotId)도 같다 — "Shot 4 뒤에"는 답을 받기 전 보드의 Shot 4(sh_02_04) 뒤다.
  it('같은 답에서 샷을 지운 뒤 보드 이름 뒤에 샷을 더하면 답을 받기 전 보드의 그 샷 뒤에 더한다', async () => {
    reviewerBoard()
    await useWriterStore.getState().applyChatUpdates([
      { type: 'deleteShot', id: 'Shot 3' },
      { type: 'addShot', sceneId: 'sc_02', afterShotId: 'Shot 4', shotType: 'CU', actionDescription: 'new', characters: [], durationSeconds: 3, tempId: 'H1' } as never,
    ])
    const sceneTwo = useWriterStore.getState().shots.filter((s) => s.sceneId === 'sc_02').map((s) => s.actionDescription)
    expect(sceneTwo).toEqual(['sh_02_04', 'new', 'sh_02_05'])
  })

  // 왜: 정상 경로 고정 — 같은 답에서 더한 샷은 받은 임시 id(tempId)로 가리켜 고칠 수 있고(보드 번호는 아직 없다),
  //   같은 답에서 지운 샷을 다시 가리키면 그 고침만 못 찾았다고 건너뛴다.
  it('같은 답에서 더한 샷은 임시 id 로 고칠 수 있고, 같은 답에서 지운 샷을 다시 가리키면 그 고침만 건너뛴다', async () => {
    reviewerBoard()
    const result = await useWriterStore.getState().applyChatUpdates([
      { type: 'addShot', sceneId: 'sc_02', shotType: 'MS', actionDescription: 'added', characters: [], durationSeconds: 3, tempId: 'H1' } as never,
      { type: 'updateShot', id: 'H1', patch: { shotType: 'ECU' } },
      { type: 'deleteShot', id: 'Shot 3' },
      { type: 'updateShot', id: 'sh_02_03', patch: { shotType: 'CU' } },
    ])
    expect(useWriterStore.getState().shots.find((s) => s.actionDescription === 'added')?.shotType).toBe('ECU')
    expect(result.skipped.map((item) => item.id)).toEqual(['sh_02_03'])
  })
})
