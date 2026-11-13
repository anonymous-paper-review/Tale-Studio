// 샷 상세 영상 탭에서 새 Take 를 만들면 고친 모델 · 해상도 · 바꿀 점이 새 Take 에만 실리는지, 다시 만들기 요청이 단추 값과 같은 모델 · 해상도로 나가는지, 넘기기 창이 시작하지 못한 진짜 까닭을 보이는지 (디자이너 11/13 시안 D7 · 오너 2026-11-14 · 리드 검토 a)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const chain = {
      from: () => chain,
      update: () => chain,
      eq: () => chain,
      then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
    }
    return chain
  },
}))
vi.mock('@/lib/generation-queue', () => ({ refreshGenerationQueue: vi.fn() }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: () => Promise.resolve() }))

import { useDirectorCanvasStore } from '@/stores/director-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { latestShotTake, takeSettings } from '@/lib/director/remake-take'
import { remakeNotice } from '@/lib/director/editor-handover'
import { translate } from '@/lib/i18n/translate'
import { isShotData, isVideoData, type VideoOverride } from '@/types/director'

const api = () => useDirectorCanvasStore.getState()
let shotId: string
let sourceId: string
let fetcher: ReturnType<typeof vi.fn>

const generationBodies = () => fetcher.mock.calls
  .filter(([url]) => String(url) === '/api/director/generate-video')
  .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>)

beforeEach(() => {
  vi.useFakeTimers()
  api().reset()
  useDirectorCanvasStore.setState({ projectId: 'project-1', hydrateFromDb: vi.fn().mockResolvedValue(undefined) })
  shotId = api().addShotNode(null, { x: 0, y: 0 }, '샷 상세 Take')
  api().updateNodeData<'shot'>(shotId, { writerShotId: 'shot-1', promptOverride: 'A girl shivers under the eaves.', provider: 'seedance' })
  sourceId = api().addVideoTake(shotId)!
  api().updateNodeData<'video'>(sourceId, { videoClipId: 'clip-source', status: 'completed', videoUrl: 'https://media.test/source.mp4' })
  let clip = 0
  fetcher = vi.fn().mockImplementation((url: string) => {
    if (url === '/api/director/generate-video') {
      clip += 1
      return Promise.resolve(Response.json({ jobId: `job-${clip}`, status: 'queued', videoClipId: `clip-${clip}`, takeNumber: clip + 1 }))
    }
    // 요청에 실린 값만 본다 — 생성처 결과는 바로 실패로 끝내 다음 단계(재생 · 판정)를 부르지 않는다.
    if (url.startsWith('/api/generation-jobs/')) return Promise.resolve(Response.json({ ok: true, data: { status: 'failed', error: 'stopped by test' } }))
    return Promise.resolve(Response.json({ ok: true }))
  })
  vi.stubGlobal('fetch', fetcher)
})

afterEach(async () => {
  await vi.runAllTimersAsync()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('샷 상세의 새 Take', () => {
  it('영상 고치기에서 고친 모델 · 해상도 · 바꿀 점은 새 Take 에만 실리고, 바꿀 점은 지금 샷 프롬프트 끝에 그 한 번만 붙어 Take 에 기록으로 남는다', async () => {
    // 왜: D7 — Take 는 덮어쓰지 않고 쌓인다. 리드 검토 c ③ — 새 Take 의 바탕은 늘 지금 샷 프롬프트다(앞 Take 의 프롬프트 줄기를 잇지 않는다).
    //   (옛 이름: "… 새 Take 의 생성 요청과 설정에 실리고, 보고 있던 Take 의 설정은 그대로다")
    api().updateNodeData<'video'>(sourceId, { override: { prompt: 'An old prompt.\n\nChange from the previous video: faster' } })
    const newTakeId = await api().generateVideoForShot(shotId, {
      inheritFromVideoNodeId: sourceId,
      videoOverride: { provider: 'veo', resolution: '1080p', changeNote: 'slow push in' },
    })

    expect(newTakeId).not.toBeNull()
    expect(newTakeId).not.toBe(sourceId)
    const [body] = generationBodies()
    expect(body).toMatchObject({
      model: 'veo', resolution: '1080p', videoClipId: null,
      prompt: 'A girl shivers under the eaves.\n\nChange from the previous video: slow push in',
      override: { provider: 'veo', resolution: '1080p', changeNote: 'slow push in' },
    })
    const created = api().nodes.find((node) => node.id === newTakeId)!.data
    expect(isVideoData(created) && created.override).toEqual({ provider: 'veo', resolution: '1080p', changeNote: 'slow push in' })
    const source = api().nodes.find((node) => node.id === sourceId)!.data
    expect(isVideoData(source) && source.override).toEqual({ prompt: 'An old prompt.\n\nChange from the previous video: faster' })
  })

  it('다시 만들기(remakeShotVideo)는 가장 최근 Take 가 실패했어도 그 Take 를 덮지 않고 그 모델 · 해상도로 새 Take 를 만든다', async () => {
    // 왜: D8 [다시 만들기 · Take X] · Lumi "실패한 샷 다시 만들어 줘"(entry · board 가 부름) — 실패한 Take 는 기록으로 남고 마지막 설정으로 새 Take 가 쌓인다.
    api().updateNodeData<'video'>(sourceId, { status: 'failed', videoUrl: null, override: { provider: 'kling-o3', resolution: '720p' } })
    const made = await api().remakeShotVideo(shotId)

    expect(made).not.toBeNull()
    expect(made).not.toBe(sourceId)
    const [body] = generationBodies()
    expect(body).toMatchObject({ model: 'kling-o3', videoClipId: null, override: { provider: 'kling-o3', resolution: '720p' } })
  })

  it('상세는 openShotDetail 로 그 노드 · 탭을 열고 closeShotDetail 로 닫는다', () => {
    // 왜: set 의 ⤢ 와 entry D8 [바꾸기]가 같은 길로 상세를 연다(set 과 정한 이름). 영상 노드에서 열면 영상 탭이 먼저다.
    api().openShotDetail(sourceId)
    expect(api()).toMatchObject({ detailNodeId: sourceId, detailTab: 'video' })
    api().openShotDetail(shotId)
    expect(api()).toMatchObject({ detailNodeId: shotId, detailTab: 'image' })
    api().openShotDetail(shotId, 'video')
    expect(api().detailTab).toBe('video')
    api().closeShotDetail()
    expect(api().detailNodeId).toBeNull()
  })
})

describe('다시 만들기 단추 값과 요청', () => {
  /** 샷 하나(와 그 샷의 Take 하나)를 새로 두고, 단추 값을 센 설정과 다시 만들기 요청이 보낸 모델 · 해상도를 함께 돌려준다. */
  async function remakeCase(writerShotId: string, shotProvider: string, takeOverride: VideoOverride | null) {
    const shot = api().addShotNode(null, { x: 0, y: 400 }, writerShotId)
    api().updateNodeData<'shot'>(shot, { writerShotId, promptOverride: 'A girl shivers under the eaves.', provider: shotProvider as never })
    if (takeOverride) {
      const take = api().addVideoTake(shot)!
      api().updateNodeData<'video'>(take, { videoClipId: `clip-${writerShotId}`, status: 'completed', videoUrl: 'https://media.test/old.mp4', override: takeOverride })
    }
    const shotData = api().nodes.find((node) => node.id === shot)!.data
    if (!isShotData(shotData)) throw new Error('not a shot')
    const button = takeSettings(shotData, latestShotTake(api().nodes, shot)?.data ?? null)
    const before = generationBodies().length
    await api().remakeShotVideo(shot)
    const sent = generationBodies().slice(before)
    expect(sent).toHaveLength(1)
    return { button, sent: { model: sent[0].model, resolution: sent[0].resolution } }
  }

  it('다시 만들기 요청이 보내는 모델 · 해상도는 단추 값을 센 설정과 같다 — Take 없음 · 설정 없는 Take · 옛 모델 이름 · 1080p', async () => {
    // 왜: 리드 검토 a(4a486d25 낮음) — 확인 창이 없어 단추에 적은 Take 값이 곧 동의다. 단추는 takeSettings 로 세는데 요청이 모델 · 해상도를
    //   다른 곳에서 다시 세면, 한쪽만 바뀌는 날 단추 값과 실제로 빠지는 Take 가 갈라진다. 네 경우를 모두 같은 값으로 고정한다.
    const none = await remakeCase('shot-none', 'veo', null)
    expect(none.button).toEqual({ model: 'veo', resolution: '720p' })
    expect(none.sent).toEqual(none.button)
    const bare = await remakeCase('shot-bare', 'happy-horse', {})
    expect(bare.button).toEqual({ model: 'happy-horse', resolution: '720p' })
    expect(bare.sent).toEqual(bare.button)
    const legacy = await remakeCase('shot-legacy', 'seedance', { provider: 'kling' as never })
    expect(legacy.button).toEqual({ model: 'kling-o3', resolution: '720p' })
    expect(legacy.sent).toEqual(legacy.button)
    const hd = await remakeCase('shot-hd', 'seedance', { provider: 'seedance-2.5', resolution: '1080p' })
    expect(hd.button).toEqual({ model: 'seedance-2.5', resolution: '1080p' })
    expect(hd.sent).toEqual(hd.button)
  })

  it('Editor 넘기기 창의 [영상 만들기]도 샷 상세와 같은 다시 만들기(remakeShotVideo)로 요청한다', async () => {
    // 왜: 리드 검토 a(4a486d25 낮음) — 넘기기 창(entry D8)이 같은 일을 따로 적어 두면 한쪽만 바뀌는 날 단추 값과 요청이 갈라진다.
    api().updateNodeData<'shot'>(shotId, { storyboardImage: { url: 'https://media.test/s.png', status: 'completed', errorMessage: null, generatedAt: 1 } })
    const original = api().remakeShotVideo
    const remake = vi.fn(async () => 'take-new')
    useDirectorCanvasStore.setState({ remakeShotVideo: remake })
    // 단추는 넘기기 창 안에만 있다 — 창이 열려 있어야 만든다(entry f9c9cb61 되돌림 뒤).
    useGlobalChatStore.setState({ handoffConfirm: { kind: 'editorMissingVideos', projectId: 'project-1', via: 'button' } })
    try {
      await useGlobalChatStore.getState().remakeMissingVideo(shotId)
    } finally {
      useDirectorCanvasStore.setState({ remakeShotVideo: original })
      useGlobalChatStore.setState({ handoffConfirm: null })
    }
    expect(remake).toHaveBeenCalledWith(shotId)
  })
})

describe('넘기기 창 [영상 만들기]가 시작하지 못한 까닭', () => {
  const image = { url: 'https://media.test/s.png', status: 'completed' as const, errorMessage: null, generatedAt: 1 }
  const stopped = { status: 'generating' as const, lastAttemptStatus: 'generating' as const, videoUrl: null, cancelledAt: '2026-11-14T03:00:00Z' }
  const openWindow = () => useGlobalChatStore.setState({ handoffConfirm: { kind: 'editorMissingVideos', projectId: 'project-1', via: 'button' } })

  it('넘기기 창의 [영상 만들기]가 시작하지 못했을 때 멈춘 채 도는 Take 는 "이 샷 영상을 이미 만드는 중"으로 세지 않는다', async () => {
    // 왜: 리드 재검토 a — 멈춘 Take 는 ★ 가 아니면 영상도, 만드는 중도 아니다(오너 7번). 뒤에서 돌아도 그 줄의 까닭은 "이미 만드는 중"이 아니다.
    api().updateNodeData<'shot'>(shotId, { storyboardImage: image })
    api().updateNodeData<'video'>(sourceId, stopped)
    const original = api().remakeShotVideo
    useDirectorCanvasStore.setState({ remakeShotVideo: vi.fn(async () => null) })
    openWindow()
    try {
      expect(await useGlobalChatStore.getState().remakeMissingVideo(shotId)).toEqual({ started: false, reason: 'not_started' })
    } finally {
      useDirectorCanvasStore.setState({ remakeShotVideo: original })
      useGlobalChatStore.setState({ handoffConfirm: null })
    }
  })

  it('멈춘 Take 가 동시 자리를 차지해 새 Take 가 거절되면 넘기기 창 줄에 동시 생성 한도 까닭을 보인다', async () => {
    // 왜: 리드 재검토 a — 멈춘 Take 의 작업은 뒤에서 끝날 때까지 내 영상 동시 자리를 쓴다. 거절된 줄이 "이미 만드는 중"이나 일반 실패로 보이면 무엇을 기다려야 할지 모른다.
    api().updateNodeData<'shot'>(shotId, { storyboardImage: image })
    api().updateNodeData<'video'>(sourceId, stopped)
    fetcher.mockImplementation((url: string) => (url === '/api/director/generate-video'
      ? Promise.resolve(Response.json({ code: 'quota_exceeded', scope: 'user', category: 'video', limit: 3, error: 'Video generation limit reached' }, { status: 429 }))
      : Promise.resolve(Response.json({ ok: true }))))
    openWindow()
    try {
      expect(await useGlobalChatStore.getState().remakeMissingVideo(shotId)).toEqual({ started: false, reason: 'video_limit' })
    } finally {
      useGlobalChatStore.setState({ handoffConfirm: null })
    }
    expect(remakeNotice('video_limit', (key, params) => translate('ko', key, params)))
      .toBe('동시에 만드는 영상 수가 다 찼어요(멈춘 Take 도 끝날 때까지 자리를 써요). 하나가 끝나면 만들 수 있어요.')
  })
})
