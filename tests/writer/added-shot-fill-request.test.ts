// 샷을 더하면(채팅 · [+ 샷 추가]) 저장이 끝난 뒤 서버에 빈 칸 채우기를 부탁하고, 그 결과 칩을 화면에 바로 싣는지 검사한다(오너 2026-11-27 N2)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Scene, Shot } from '@/types'

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  refill: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const query = { eq: () => query, then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve) }
      return { insert: async () => ({ error: null }), update: () => query }
    },
  }),
}))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined), loadShotsResult: vi.fn() }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.access }))
vi.mock('@/lib/writer/pipeline/util/added_shot_persist', () => ({ refillAddedShots: mocks.refill }))

import { toast } from 'sonner'
import { onShotAdded, useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import { _setGenerationQueueSnapshotForTests } from '@/lib/generation-queue'
import { POST } from '@/app/api/writer/added-shot-fill/route'

const PROJECT = '11111111-2222-4333-8444-555555555555'
const scene: Scene = {
  sceneId: 'sc_01', sortOrder: 0, location: 'cafe', timeOfDay: 'night', mood: '', narrativeSummary: 'sc_01',
  originalTextQuote: '', charactersPresent: ['mina', 'jun'], estimatedDurationSeconds: 5,
}
const shot = (shotId: string, sortOrder: number): Shot => ({
  shotId, sceneId: 'sc_01', sortOrder, shotType: 'MS', actionDescription: `${shotId} 행동`, characters: ['mina', 'jun'], durationSeconds: 5,
  generationMethod: 'I2V', dialogueLines: [], camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
  lighting: { position: 'front', brightness: 50, colorTemp: 5000 },
})
const CHIP = { cameraAngle: 'eye_level', cameraMotion: null, colorTempK: 4500, neighborFill: true }

type FetchCall = [string, { body?: string } | undefined]
let fetchMock: ReturnType<typeof vi.fn>
const fillCalls = () => (fetchMock.mock.calls as FetchCall[]).filter(([url]) => url === '/api/writer/added-shot-fill')
let release: (() => void) | null = null

beforeEach(() => {
  release = null
  useProjectStore.setState({ projectId: PROJECT, currentStage: 'writer' })
  useWriterStore.setState({ sceneManifest: { scenes: [scene], characters: [], locations: [] }, shots: [shot('sh_01_01', 0), shot('sh_01_02', 1)], error: null })
  _setGenerationQueueSnapshotForTests({ projectId: PROJECT, jobs: [] })
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/writer/added-shot-fill') {
      await new Promise<void>((resolve) => { release = resolve })
      return { ok: true, status: 200, json: async () => ({ ok: true, filled: true, stageDesign: CHIP }) }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(toast.error).mockClear()
})
afterEach(() => {
  useWriterStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('샷을 더하면 서버에 빈 칸 채우기를 부탁한다', () => {
  // 왜: 리드 해석 — [+ 샷 추가]는 채팅과 같은 뿌리(writer-store addShot)다. 두 길 모두 같은 서버 채우기를 거친다.
  it('[+ 샷 추가]로 더한 샷도 채팅으로 더한 샷과 같은 방식으로 채운다', async () => {
    const boardId = await useWriterStore.getState().addShot('sc_01', { afterShotId: 'sh_01_01', fields: { actionDescription: '민아가 웃는다' } })
    await useWriterStore.getState().applyChatUpdates([{ type: 'addShot', sceneId: 'sc_01', actionDescription: '준이 고개를 끄덕인다', characters: ['jun'] }])
    const chatId = useWriterStore.getState().shots.find((s) => s.actionDescription === '준이 고개를 끄덕인다')?.shotId
    await vi.waitFor(() => expect(fillCalls()).toHaveLength(2))
    expect(fillCalls().map(([, init]) => JSON.parse(init?.body ?? '{}'))).toEqual([
      { projectId: PROJECT, shotId: boardId },
      { projectId: PROJECT, shotId: chatId },
    ])
  })

  // 왜: 더한 샷 러프는 저장이 끝나자마자 그린다 — 채우기를 기다리게 하면 더하기가 느려진다. 러프 길이 그리기 직전에 같은 계산을 다시 한다.
  it('채우기는 저장이 끝난 뒤에 부르고, 더한 샷 그리기는 채우기를 기다리지 않는다', async () => {
    let saved: Promise<boolean> | null = null
    const stop = onShotAdded((event) => { saved = event.saved })
    const id = await useWriterStore.getState().addShot('sc_01', { fields: { actionDescription: '두 사람이 마주 본다' } })
    stop()
    expect(id).toBe('sh_01_03')
    await expect(saved!).resolves.toBe(true)
    await vi.waitFor(() => expect(fillCalls()).toHaveLength(1))
    expect(release).not.toBeNull() // 채우기는 아직 끝나지 않았다
    release!()
  })

  // 왜: 채운 칸의 앵글 · 색온도는 카드 칩으로 보인다 — 다시 불러오기 전에도 다른 샷처럼 보여야 한다.
  it('채운 칸의 앵글 · 색온도 칩을 샷을 더한 화면에 바로 싣는다', async () => {
    const id = await useWriterStore.getState().addShot('sc_01', { fields: { actionDescription: '두 사람이 마주 본다' } })
    await vi.waitFor(() => expect(release).not.toBeNull())
    release!()
    await vi.waitFor(() => expect(useWriterStore.getState().shots.find((s) => s.shotId === id)?.stageDesign).toEqual(CHIP))
  })

  // 왜: 채우기는 덤이다 — 서버가 실패해도 샷은 더해지고 오류 알림도 띄우지 않는다(지금처럼 빈 칸으로 그린다).
  it('채우기가 실패해도 샷 더하기는 그대로 되고 오류 알림을 띄우지 않는다', async () => {
    fetchMock.mockImplementation(async () => { throw new Error('network down') })
    const id = await useWriterStore.getState().addShot('sc_01', { fields: { actionDescription: '두 사람이 마주 본다' } })
    expect(id).toBe('sh_01_03')
    await vi.waitFor(() => expect(fillCalls()).toHaveLength(1))
    await Promise.resolve()
    expect(useWriterStore.getState().shots.some((s) => s.shotId === id)).toBe(true)
    expect(useWriterStore.getState().shots.find((s) => s.shotId === id)?.stageDesign ?? null).toBeNull()
    expect(toast.error).not.toHaveBeenCalled()
  })
})

describe('빈 칸 채우기 서버 길', () => {
  const post = (body: unknown) => POST(new Request('http://localhost/api/writer/added-shot-fill', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }))
  beforeEach(() => {
    mocks.access.mockReset()
    mocks.refill.mockReset()
  })

  // 왜: 남의 프로젝트 샷 칸을 쓰면 안 된다 — 프로젝트 주인만 부를 수 있다(공유 링크로 보는 사람도 못 쓴다).
  it('빈 칸 채우기 길은 프로젝트 주인만 부를 수 있고, 채운 칩 값을 돌려준다', async () => {
    mocks.access.mockResolvedValueOnce({ ok: false, response: new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }) })
    expect((await post({ projectId: PROJECT, shotId: 'sh_01_03' })).status).toBe(403)
    expect(mocks.refill).not.toHaveBeenCalled()
    expect(mocks.access).toHaveBeenLastCalledWith(expect.any(Request), PROJECT)

    mocks.access.mockResolvedValueOnce({ ok: true, projectId: PROJECT, userId: 'u1', viaShare: false })
    mocks.refill.mockResolvedValueOnce(new Map([['sh_01_03', {
      static_spec: { shot_id: 'sh_01_03', camera_angle: 'eye_level', lighting: { color_temp_kelvin: 4500 }, added_fill: { version: 1 } },
      character_appearance_keys: { mina: 'current' }, changed: true,
    }]]))
    const res = await post({ projectId: PROJECT, shotId: 'sh_01_03' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, filled: true, stageDesign: CHIP })
    expect(mocks.refill).toHaveBeenCalledWith(PROJECT, ['sh_01_03'])

    // 파이프라인 샷 · 채울 수 없는 샷은 채운 것이 없다.
    mocks.access.mockResolvedValueOnce({ ok: true, projectId: PROJECT, userId: 'u1', viaShare: false })
    mocks.refill.mockResolvedValueOnce(new Map())
    expect(await (await post({ projectId: PROJECT, shotId: 'sh_01_01' })).json()).toEqual({ ok: true, filled: false, stageDesign: null })
  })
})
