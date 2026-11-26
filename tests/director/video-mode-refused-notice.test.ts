// 고른 영상 방식 때문에 서버가 Take 전에 막으면(앞 샷 영상이 바뀜 · 가운데 장 없음 · 러프 바뀜 · 러프 그림 섞임 …), 화면은 새 Take 줄을 남기지 않고 까닭을 사용자 언어로 알린다 (오너 2026-11-27 N4a)
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import { isVideoData } from '@/types/director'
import { KO } from '@/lib/i18n/messages-ko'

const queue = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('@/lib/generation-queue', () => ({ refreshGenerationQueue: queue.refresh }))
const api = () => useDirectorCanvasStore.getState()
let shotId: string
let refusal: { status: number; code: string; error: string }

beforeEach(() => {
  vi.useFakeTimers()
  api().reset()
  shotId = api().addShotNode(null, { x: 0, y: 0 }, '방식 막힘')
  api().updateNodeData<'shot'>(shotId, { writerShotId: 'shot-1', promptOverride: 'A quiet mountain' })
  useDirectorCanvasStore.setState({ projectId: 'project-1' })
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => Promise.resolve(url === '/api/director/generate-video'
    ? Response.json({ error: refusal.error, code: refusal.code }, { status: refusal.status })
    : Response.json({}))))
  vi.spyOn(toast, 'error').mockReturnValue('notice')
  useLocaleStore.setState({ locale: 'ko' })
})

afterEach(() => {
  useLocaleStore.setState({ locale: 'en' })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('고른 방식 때문에 서버가 Take 전에 막으면 새 Take 줄을 남기지 않고 까닭을 사용자 언어로 알린다', async () => {
  // 왜: 화면이 대부분 미리 끄지만(씬 첫 샷 · 앞 영상 없음 · 가운데 장 없음 · 러프 바뀜), 누른 사이 앞 샷을 다시 만들었거나 노드 · Lumi 가
  //   옛 이어서 출처로 다시 만들면 서버가 막는다 — 서버 문구는 영어라(서버는 사용자 언어를 모른다) 화면이 code 를 보고 띄운다.
  for (const [status, code, error] of [
    [409, 'continue_source_changed', "The previous shot's video has changed. Choose Continue again to use its new last frame."],
    [409, 'continue_first_shot', 'This is the first shot of its scene, so there is no previous video to continue from.'],
    [409, 'continue_previous_not_ready', 'The previous shot has no finished video to continue from yet.'],
    [400, 'invalid_continue_frame', 'Invalid request: continueFrom.frameUrl is not a frame captured from that video'],
    [409, 'missing_middle_frame', "This shot's live-action storyboard has no middle (direction) panel."],
    [409, 'middle_outdated', 'Redraw the live-action storyboard after editing the rough to use Start + middle.'],
    [400, 'rough_image_not_allowed', 'Rough (wooden mannequin) images cannot be used to make a video.'],
  ] as const) {
    vi.mocked(toast.error).mockClear()
    refusal = { status, code, error }
    await api().generateVideoForShot(shotId)
    expect({ code, takes: api().nodes.filter((node) => isVideoData(node.data)).length }).toEqual({ code, takes: 0 })
    expect(toast.error).toHaveBeenCalledOnce()
    const shown = vi.mocked(toast.error).mock.calls[0]![0] as string
    expect({ code, korean: Object.values(KO).includes(shown) }).toEqual({ code, korean: true })
  }
})

it('같은 Take 다시 만들기가 방식 · 한도 · Take 부족 때문에 막히면 그 Take 는 만드는 중으로 굳지 않고 요청 전 상태로 돌아온다', async () => {
  // 왜(검토 rev-video 1): 노드 Take 판 [다시 만들기]는 영상이 있는 그 Take 를 다시 만든다 — 서버가 Take 전에 막으면(앞 샷 영상이 바뀜 · 동시 한도 · Take 부족)
  //   만드는 중 표시와 이번 요청 키가 남아, 다시 읽어도(내 요청이 더 새것이라) 그 Take 가 계속 만드는 중으로 보였다.
  for (const [status, code, error] of [[409, 'continue_source_changed', 'refused'], [429, 'quota_exceeded', 'refused'], [402, 'insufficient_takes', 'insufficient_takes']] as const) {
    api().reset()
    useDirectorCanvasStore.setState({ projectId: 'project-1' })
    shotId = api().addShotNode(null, { x: 0, y: 0 }, '다시 만들기 막힘')
    api().updateNodeData<'shot'>(shotId, { writerShotId: 'shot-1', promptOverride: 'A quiet mountain' })
    const takeId = api().addVideoTake(shotId)!
    const before = {
      status: 'completed' as const, videoUrl: 'https://media.test/videos/clip-1/job-old.mp4', videoClipId: 'clip-1',
      generationJobId: 'job-old', lastAttemptStatus: 'completed' as const, lastAttemptError: null, lastAttemptAt: '2026-11-20T00:00:00.000Z',
      override: { videoMode: 'continue' as const, continueFrom: { videoClipId: 'clip-prev', generationJobId: 'job-prev', frameUrl: 'https://media.test/videos/clip-prev/job-prev_chain-frame-2850.jpg' } },
    }
    api().updateNodeData<'video'>(takeId, before)
    refusal = { status, code, error }
    await api().regenerateVideo(takeId)
    const node = api().nodes.find((candidate) => candidate.id === takeId)
    const data = node && isVideoData(node.data) ? node.data : null
    expect({ code, state: { status: data?.status, generationJobId: data?.generationJobId, lastAttemptStatus: data?.lastAttemptStatus, lastAttemptAt: data?.lastAttemptAt, videoUrl: data?.videoUrl } })
      .toEqual({ code, state: { status: 'completed', generationJobId: 'job-old', lastAttemptStatus: 'completed', lastAttemptAt: '2026-11-20T00:00:00.000Z', videoUrl: before.videoUrl } })
  }
})
