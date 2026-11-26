// H3 로 보낼 작은 그림을 키우지 못해 서버가 Take 전에 막으면, 화면은 새 Take 줄을 남기지 않고 까닭을 사용자 언어로 알린다 (m-qa 2026-11-27 · 리드 "까닭을 알린다")
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import { isVideoData } from '@/types/director'
import { KO } from '@/lib/i18n/messages-ko'

const queue = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('@/lib/generation-queue', () => ({ refreshGenerationQueue: queue.refresh }))
const api = () => useDirectorCanvasStore.getState()
const SERVER_TEXT = 'The start or end image is smaller than 256 px, which this video model does not accept, and it could not be enlarged. Choose another video model or remake the images. (Could not store the enlarged reference image (upload failed))'
let shotId: string

beforeEach(() => {
  vi.useFakeTimers()
  api().reset()
  shotId = api().addShotNode(null, { x: 0, y: 0 }, '작은 그림 막힘')
  api().updateNodeData<'shot'>(shotId, { writerShotId: 'shot-1', promptOverride: 'A quiet mountain' })
  useDirectorCanvasStore.setState({ projectId: 'project-1' })
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => Promise.resolve(url === '/api/director/generate-video'
    ? Response.json({ error: SERVER_TEXT, code: 'reference_image_too_small' }, { status: 422 })
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

it('H3 로 보낼 작은 그림을 키우지 못해 막히면 새 Take 줄을 남기지 않고 까닭을 사용자 언어로 알린다', async () => {
  // 왜(리드): 키우기가 안 될 때만 Take 전에 막고 까닭을 알린다 — 서버 문구는 영어라(서버는 사용자 언어를 모른다) 화면이 code 를 보고 띄운다.
  await api().generateVideoForShot(shotId)
  expect(api().nodes.filter((node) => isVideoData(node.data))).toHaveLength(0)
  expect(toast.error).toHaveBeenCalledOnce()
  const shown = vi.mocked(toast.error).mock.calls[0]![0] as string
  expect(Object.values(KO)).toContain(shown)
  expect(shown).not.toContain('px')
})
