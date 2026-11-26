// 앞 영상에서 이어 붙일 장면은 Editor 가 자르는 자리에서 잡고, 검은 화면이면 앞으로 가며 다시 잡는다 (오너 2026-11-27 N4a ① · dev 리드 고장 2)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isVideoData } from '@/types/director'
import { useDirectorCanvasStore } from '@/stores/director-store'
import {
  chainFrameAtMs,
  continuationCaptureTime,
  continuationRetryTimes,
  isNearlyBlackFrame,
} from '@/lib/director/video-frame-capture'

const api = () => useDirectorCanvasStore.getState()

beforeEach(() => {
  api().reset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** 앞 샷(길이 plannedSec)의 완성 영상과 다음 샷의 새 Take. */
function seedChain(plannedSec: number) {
  const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'Scene')
  const sourceShotId = api().addShotNode(sceneId, { x: 360, y: 0 }, 'Source')
  const targetShotId = api().addShotNode(sceneId, { x: 360, y: 560 }, 'Target')
  api().updateNodeData<'shot'>(sourceShotId, { durationSeconds: plannedSec })
  const sourceVideoId = api().addVideoTake(sourceShotId)!
  const targetVideoId = api().addVideoTake(targetShotId)!
  api().updateNodeData<'video'>(sourceVideoId, {
    status: 'completed',
    videoUrl: 'https://cdn.example/source.mp4',
    videoClipId: 'clip-source',
    generationJobId: 'job-source',
  })
  return { sourceVideoId, targetVideoId }
}

/**
 * 브라우저 흉내 — 파일 길이 fileSec 의 영상. blackFromSec 뒤의 장면은 검다(Veo 가 샷 길이 뒤를 검게 채운 것).
 *   seeks 에 이동한 시각이, uploads 에 올린 양식이 쌓인다.
 */
function fakeBrowser(fileSec: number, blackFromSec = Number.POSITIVE_INFINITY) {
  const seeks: number[] = []
  const uploads: FormData[] = []
  let currentTime = 0
  const video = {
    duration: fileSec,
    videoWidth: 64,
    videoHeight: 36,
    crossOrigin: '',
    muted: false,
    preload: '',
    playsInline: false,
    onloadedmetadata: null as (() => void) | null,
    onloadeddata: null as (() => void) | null,
    onseeked: null as (() => void) | null,
    onerror: null as (() => void) | null,
    removeAttribute: vi.fn(),
    load: vi.fn(),
  }
  Object.defineProperty(video, 'src', { set: () => queueMicrotask(() => video.onloadedmetadata?.()) })
  Object.defineProperty(video, 'currentTime', {
    get: () => currentTime,
    set: (value: number) => {
      currentTime = value
      seeks.push(value)
      queueMicrotask(() => video.onseeked?.())
    },
  })
  const canvas = () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const level = currentTime >= blackFromSec ? 0 : 128
        return { data: new Uint8ClampedArray(w * h * 4).fill(level) }
      },
    }),
    toBlob: (callback: BlobCallback) => callback(new Blob(['frame'], { type: 'image/jpeg' })),
  })
  vi.stubGlobal('document', { cookie: '', createElement: (tag: string) => (tag === 'video' ? video : canvas()) })
  vi.stubGlobal('window', { location: { pathname: '/studio/director' } })
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: FormData }) => {
    uploads.push(init.body)
    return { ok: true, json: async () => ({ publicUrl: `https://media.example/clip-source/job-source_chain-frame-${init.body.get('atMs')}.jpg` }) }
  }))
  return { seeks, uploads }
}

const targetData = (id: string) => {
  const node = api().nodes.find((n) => n.id === id)
  return node && isVideoData(node.data) ? node.data : null
}

describe('같이 정한 것', () => {
  // 왜: 짧은 앞 샷의 영상에서 이을 때(샷 상세 [이어서] · 노드 '이전 영상' 구멍, dev 리드 고장 2) — Veo 는 8초 고정이라 3초 샷 뒤를 검게 채우고,
  //   Seedance 는 3초 샷도 4초로 만든다. 파일 끝을 잡으면 검은 화면이나 Editor 가 잘라 낼 꼬리가 다음 샷 시작이 됐다.
  it('앞 샷이 짧아도 이어서의 시작 그림은 검은 화면이나 Editor 가 잘라 낼 끝부분이 아니다', async () => {
    const veo = seedChain(3)
    const veoBrowser = fakeBrowser(8, 2.5)
    expect(await api().wireVideoChainToVideo(veo.sourceVideoId, veo.targetVideoId, 'video-chain')).toBe(true)
    expect(veoBrowser.seeks[0]).toBeCloseTo(2.85)
    expect(veoBrowser.seeks.at(-1)).toBeCloseTo(2.35)
    expect(veoBrowser.uploads[0]!.get('atMs')).toBe('2350')
    expect(targetData(veo.targetVideoId)?.videoChainFrameUrl).toContain('chain-frame-2350')

    api().reset()
    vi.unstubAllGlobals()
    const seedance = seedChain(3)
    const seedanceBrowser = fakeBrowser(4)
    expect(await api().wireVideoChainToVideo(seedance.sourceVideoId, seedance.targetVideoId, 'video-chain')).toBe(true)
    expect(seedanceBrowser.seeks).toEqual([2.85])
  })
})

describe('혼자 정한 것', () => {
  // 왜: Editor 는 클립을 min(샷 길이, 실제 길이)에서 자른다(editor-store clipDurationSec) — 이어 붙일 장면은 보는 사람이 본 마지막 장면이어야 한다.
  //   샷 길이를 모르면(독립 영상) 지금처럼 파일 끝 0.15초 앞.
  it('이어서의 마지막 장면은 앞 샷 길이와 실제 영상 길이 중 짧은 쪽의 0.15초 앞에서 잡는다', () => {
    expect(continuationCaptureTime(3, 8)).toBeCloseTo(2.85)
    expect(continuationCaptureTime(3, 4)).toBeCloseTo(2.85)
    expect(continuationCaptureTime(6, 4.04)).toBeCloseTo(3.89)
    expect(continuationCaptureTime(null, 5)).toBeCloseTo(4.85)
    expect(continuationCaptureTime(5, Number.NaN)).toBeNull()
  })

  // 왜: Veo 가 샷 길이보다 조금 일찍 검게 바뀌면 그 자리의 장면도 검다 — 1초 안에서 검지 않은 마지막 장면을 찾는다.
  it('잡은 장면이 거의 검으면 0.25초씩 앞으로 네 번까지 다시 잡는다', () => {
    expect(continuationRetryTimes(2.85)).toEqual([2.85, 2.6, 2.35, 2.1, 1.85])
    expect(continuationRetryTimes(0.3)).toEqual([0.3, 0.05])
  })

  // 왜: 밤 장면 · 어두운 실내도 평균은 어둡다 — 밝은 점이 거의 없을 때만 검은 화면으로 본다(검은 화면을 이어 붙이지 않되, 어두운 장면은 막지 않게).
  it('밝은 점이 거의 없는 장면만 검은 화면으로 보고, 어두운 밤 장면은 검은 화면으로 보지 않는다', () => {
    const black = new Uint8ClampedArray(100 * 4).fill(3)
    const night = new Uint8ClampedArray(100 * 4).fill(6)
    for (let i = 0; i < 5; i += 1) night.set([220, 210, 180, 255], i * 4) // 창 불빛 다섯 점
    const gray = new Uint8ClampedArray(100 * 4).fill(120)

    expect(isNearlyBlackFrame(black)).toBe(true)
    expect(isNearlyBlackFrame(night)).toBe(false)
    expect(isNearlyBlackFrame(gray)).toBe(false)
  })

  // 왜: 1초 앞까지 전부 검으면 이어 붙일 장면이 없다 — 검은 화면을 시작 그림으로 보내지 않고 사람에게 까닭을 보인다.
  it('1초 앞까지 다 검으면 이어서를 막고 앞 영상이 검은 화면으로 끝난다고 알린다', async () => {
    const chain = seedChain(3)
    const browser = fakeBrowser(8, 0)
    expect(await api().wireVideoChainToVideo(chain.sourceVideoId, chain.targetVideoId, 'video-chain')).toBe(false)
    expect(browser.seeks).toHaveLength(5)
    expect(browser.uploads).toHaveLength(0)
    expect(targetData(chain.targetVideoId)?.videoChainInputId).toBeNull()
    expect(targetData(chain.targetVideoId)?.errorMessage).toContain('black screen')
  })

  // 왜: 같은 앞 영상에서 다른 시각을 잡으면 그림이 달라진다 — 예전 이름(작업마다 하나)에 다시 올리면 덮어쓰기 거절로 실패했다.
  it('잡은 시각을 밀리초로 파일 이름에 붙인다', () => {
    expect(chainFrameAtMs(2.85)).toBe(2850)
    expect(chainFrameAtMs(-1)).toBe(0)
  })
})
