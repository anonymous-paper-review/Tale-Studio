// Storyboard 채팅 답의 실사 그림 요청을 화면이 맡기는 길 — 샷 하나는 Director 상세와 같은 다시 그리기, 샷 없이는 [시작]과 같은 일괄, 못 맡기면 채팅에 까닭을 남기는지 검사한다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({
  redraw: vi.fn(),
  start: vi.fn(async () => {}),
  notify: vi.fn(),
  mark: vi.fn(),
  clear: vi.fn(),
}))
vi.mock('@/features/writer/board-ui-store', () => ({ useBoardUiStore: { getState: () => ({ markCardDrawing: calls.mark, clearCardDrawing: calls.clear }) } }))
vi.mock('@/lib/storyboard/redraw-image', () => ({ redrawStoryboardImage: calls.redraw }))
vi.mock('@/lib/storyboard/start-real', () => ({ startStoryboardReal: calls.start }))

const state = vi.hoisted(() => ({
  writer: { sceneManifest: { scenes: [{ sceneId: 's1' }] }, shots: [] as Array<Record<string, unknown>> },
  images: { projectId: 'p1', images: {} as Record<string, unknown> },
  jobs: [] as unknown[],
  director: { realBatchBusy: false, realBatchCancelled: false, realBatchShotIds: null },
}))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: { getState: () => state.writer } }))
vi.mock('@/lib/storyboard/real-images-store', () => ({ useStoryboardRealImages: { getState: () => state.images } }))
vi.mock('@/stores/director-store', () => ({ useDirectorCanvasStore: { getState: () => state.director } }))
vi.mock('@/lib/generation-queue', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), activeJobsSnapshot: () => state.jobs }))

import { runStoryboardImageUpdates } from '@/lib/storyboard/chat-images'
import { useRoughFillStore } from '@/lib/storyboard/rough-fill-store'

const conti = { url: 'https://x/r.png', status: 'completed', errorMessage: null, generatedAt: 1, frames: { start: 'a', direction: 'b', end: 'c' } }
const real = { url: 'https://x/real.png', status: 'completed', generatedAt: 2, frames: { start: 'r1', direction: 'r2', end: 'r3' } }

beforeEach(() => {
  for (const fn of Object.values(calls)) fn.mockReset()
  calls.start.mockResolvedValue(undefined)
  calls.redraw.mockResolvedValue({ ok: true, jobId: 'job-1', done: Promise.resolve('drawn') })
  state.writer.shots = [
    { shotId: 'sh_01_01', sceneId: 's1', prompt: 'Mina at the bus stop', actionDescription: '미나', roughStoryboard: conti },
    { shotId: 'sh_01_02', sceneId: 's1', actionDescription: '버스', roughStoryboard: conti },
    { shotId: 'sh_01_03', sceneId: 's1', actionDescription: '빈 샷', roughStoryboard: null },
  ]
  state.images = { projectId: 'p1', images: { sh_01_01: real } }
  state.jobs = []
  useRoughFillStore.setState({ projectId: null, pending: {}, running: false })
})

const run = (updates: Array<{ type: 'generateImage'; id?: string; change?: string }>) =>
  runStoryboardImageUpdates('p1', updates, { locale: 'ko', notify: calls.notify, traceId: 't-1' })

describe('Storyboard 채팅의 실사 그림 요청 맡기기', () => {
  // 왜(오너 O7): 채팅이 고른 샷 하나를 바꿀 점과 함께 다시 그린다 — Director 상세 [이미지 고치기]와 같은 길(lib/storyboard/redraw-image).
  it('채팅이 샷 하나의 실사를 바꿀 점과 함께 다시 그리라고 하면 그 샷을 Director 상세와 같은 길로 다시 그린다', async () => {
    await run([{ type: 'generateImage', id: 'sh_01_01', change: 'Make her expression sadder' }])
    expect(calls.redraw).toHaveBeenCalledWith({
      projectId: 'p1',
      shot: expect.objectContaining({ shotId: 'sh_01_01', prompt: 'Mina at the bus stop' }),
      change: 'Make her expression sadder',
      traceId: 't-1',
    })
    expect(calls.notify).not.toHaveBeenCalled()
  })

  // 왜(Director 채팅 generateImage 와 같은 뜻): 샷 없이 부탁하면 [시작]과 같은 샷들(실사 없음 · 콘티 있음)을 같은 일괄로 만든다.
  it('채팅이 샷 없이 실사를 만들라고 하면 [시작]과 같은 샷들을 같은 일괄로 만든다', async () => {
    await run([{ type: 'generateImage' }])
    expect(calls.start).toHaveBeenCalledWith('p1', ['sh_01_02'])
    expect(calls.redraw).not.toHaveBeenCalled()
  })

  // 왜: 같은 샷을 그리는 작업이 있으면 서버가 새로 맡지 않는다 — 바꿀 점이 말없이 버려지지 않게 채팅에 알린다.
  it('그리는 중인 샷을 다시 그리라고 하면 맡기지 않고 그리는 중이라고 채팅에 알린다', async () => {
    state.jobs = [{ id: 'j1', kind: 'storyboard_real_grid', target: { writerShotIds: ['sh_01_02'] } }]
    await run([{ type: 'generateImage', id: 'sh_01_02', change: 'darker' }])
    expect(calls.redraw).not.toHaveBeenCalled()
    expect(calls.notify).toHaveBeenCalledWith('⚠ 샷 2은(는) 지금 그리는 중이에요. 다 그린 뒤 다시 부탁해 주세요.')
  })

  // 왜(리드 2026-11-26 — [시작]과 같은 샷 · 같은 알림): 채팅으로 부탁해도 콘티 그림을 그리는 중인 샷은 빼고, 빠진 샷과 까닭을 채팅에 남긴다.
  it('채팅이 샷 없이 실사를 만들라고 하면 콘티 그림을 그리는 중인 샷은 빼고 만들고, 빠진 샷 이름을 채팅에 알린다', async () => {
    state.writer.shots = [...state.writer.shots, { shotId: 'sh_01_04', sceneId: 's1', actionDescription: '우산', roughStoryboard: conti }]
    state.jobs = [{ id: 'r1', kind: 'shot_rough_storyboard', target: { writerShotIds: ['sh_01_02'] } }]
    await run([{ type: 'generateImage' }])
    expect(calls.start).toHaveBeenCalledWith('p1', ['sh_01_04'])
    expect(calls.notify).toHaveBeenCalledWith('⚠ 콘티 그림을 그리는 중인 샷 2은(는) 빼고 만들어요. 다 그리면 [시작]을 다시 눌러 주세요.')
    expect(calls.notify).toHaveBeenCalledWith('⚠ 콘티 그림이 없는 샷 3은(는) 빼고 만들어요. Writer 콘티에서 그린 뒤 다시 [시작]을 눌러 주세요.')
  })

  // 왜: 실사가 없는 샷은 콘티 그림으로 실사를 만든다 — 콘티가 아직 그려지는 중이면 맡기지 않고 다 그린 뒤 다시 부탁하라고 알린다(이어 그리기가 보낸 샷도 같다).
  it('콘티 그림을 그리는 중이고 실사가 없는 샷을 그리라고 하면 맡기지 않고 콘티 그림을 다 그린 뒤 다시 부탁하라고 알린다', async () => {
    useRoughFillStore.setState({ projectId: 'p1', pending: { sh_01_03: true }, running: true })
    await run([{ type: 'generateImage', id: 'sh_01_03' }])
    expect(calls.redraw).not.toHaveBeenCalled()
    expect(calls.notify).toHaveBeenCalledWith('⚠ 샷 3은(는) 콘티 그림을 그리는 중이에요. 다 그린 뒤 다시 부탁해 주세요.')
  })

  // 왜(혼자 정한 것 f): 콘티 그림이 없는 샷은 실사를 못 만든다 — 어디서 그리는지 알린다.
  it('콘티 그림도 실사도 없는 샷을 그리라고 하면 맡기지 않고 Writer 콘티에서 먼저 그리라고 알린다', async () => {
    await run([{ type: 'generateImage', id: 'sh_01_03' }])
    expect(calls.redraw).not.toHaveBeenCalled()
    expect(calls.notify).toHaveBeenCalledWith('⚠ 샷 3은(는) 콘티 그림이 없어요. Writer 콘티에서 그린 뒤 다시 부탁해 주세요.')
  })

  // 왜(architecture §3): 모델이 없는 샷 id 를 내면 아무것도 그리지 않는다 — 말없이 넘어가지 않게 알린다.
  it('보드에 없는 샷을 그리라고 하면 그리지 않고 찾지 못했다고 알린다', async () => {
    await run([{ type: 'generateImage', id: 'sh_09_09' }])
    expect(calls.redraw).not.toHaveBeenCalled()
    expect(calls.notify).toHaveBeenCalledWith('⚠ 그릴 샷을 찾지 못했어요. 샷 이름으로 다시 부탁해 주세요.')
  })

  // 왜: 맡긴 뒤 fal 에서 실패하면 카드는 옛 그림으로 돌아갈 뿐이다 — 채팅에 못 그렸다고 남긴다.
  it('맡긴 그림이 실패로 끝나면 채팅에 그 샷을 다시 그리지 못했다고 알린다', async () => {
    calls.redraw.mockResolvedValue({ ok: true, jobId: 'job-1', done: Promise.resolve('failed') })
    await run([{ type: 'generateImage', id: 'sh_01_01', change: 'x' }])
    await vi.waitFor(() => expect(calls.notify).toHaveBeenCalledWith('⚠ 샷 1을(를) 다시 그리지 못했어요. 다시 부탁해 주세요.'))
  })

  // 왜(#ref-gate): 인물 시트가 없으면 서버가 그리지 않는다 — 서버가 준 까닭(누구 시트인지)을 그대로 알린다.
  it('인물 시트가 없어 못 맡기면 서버가 준 까닭을 채팅에 알린다', async () => {
    calls.redraw.mockResolvedValue({ ok: false, reason: 'missing_sheets', message: '미나 시트가 없어요' })
    await run([{ type: 'generateImage', id: 'sh_01_01', change: 'x' }])
    expect(calls.notify).toHaveBeenCalledWith('⚠ 미나 시트가 없어요')
  })

  // 왜(W5 공유 규칙 cardDrawing · 리드 지시 "S5 에서 그대로"): 맡긴 그리기가 작업 큐에 오르기 전(서버가 받는 몇 초)에도 그 카드에 기다림을 보인다 — 다 그리면 내린다.
  it('채팅이 샷 하나를 다시 그리라고 맡기면 큐에 오르기 전에도 그 카드에 기다림을 걸고, 다 그리면 내린다', async () => {
    let finish!: (value: 'drawn') => void
    calls.redraw.mockImplementation(async () => {
      expect(calls.mark).toHaveBeenCalledWith('p1', 'sh_01_01')
      return { ok: true, jobId: 'job-1', done: new Promise((resolve) => { finish = resolve }) }
    })
    await run([{ type: 'generateImage', id: 'sh_01_01', change: 'x' }])
    expect(calls.clear).not.toHaveBeenCalled()
    finish('drawn')
    await vi.waitFor(() => expect(calls.clear).toHaveBeenCalledWith('p1', 'sh_01_01'))
  })

  // 왜: 맡기지 못했으면(그리는 중 · 시트 없음 등) 기다릴 것이 없다 — 건 기다림을 바로 내린다.
  it('다시 그리기를 맡기지 못하면 그 카드에 건 기다림을 바로 내린다', async () => {
    calls.redraw.mockResolvedValue({ ok: false, reason: 'missing_sheets', message: '미나 시트가 없어요' })
    await run([{ type: 'generateImage', id: 'sh_01_01', change: 'x' }])
    expect(calls.mark).toHaveBeenCalledWith('p1', 'sh_01_01')
    expect(calls.clear).toHaveBeenCalledWith('p1', 'sh_01_01')
  })
})
