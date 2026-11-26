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
