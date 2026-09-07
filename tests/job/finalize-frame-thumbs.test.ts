import { beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

// 러프/실사 그리드 영속화가 **세 프레임 모두**에 썸네일을 만드는지 잠근다 (#thumb-pipeline).
//   2026-07-17~08-12 동안 start 프레임만 썸네일이 생겨(생성률 30%) 나머지 2장이 영원히
//   원본 폴백이었다. 회귀 계약: 프레임 업로드 경로 집합 == 썸네일 생성 경로 집합(같은 문자열),
//   그리고 업로드와 썸네일이 같은 버퍼 짝을 쓴다.

const mocks = vi.hoisted(() => ({
  dbFrom: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
  uploadThumbnail: vi.fn(),
  crop: vi.fn(),
  completeJob: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: mocks.dbFrom, storage: { from: mocks.storageFrom } },
}))
vi.mock('@/lib/storage-thumb', () => ({ uploadThumbnail: mocks.uploadThumbnail }))
vi.mock('@/lib/writer/rough-grid-crop', () => ({ cropRoughGridFrames: mocks.crop }))
vi.mock('@/lib/generation-jobs', () => ({
  completeGenerationJob: mocks.completeJob,
  failGenerationJob: vi.fn(),
  patchGenerationJobResponseSnapshotByRequestId: vi.fn(),
  GenerationJobTerminalTransitionError: class GenerationJobTerminalTransitionError extends Error {},
}))
vi.mock('@/lib/director-video-takes', () => ({
  completeDirectorVideoAttempt: vi.fn(),
  markDirectorVideoAttemptFailed: vi.fn(),
}))
vi.mock('@/lib/artist/portrait', () => ({ cropTurnaroundPortrait: vi.fn() }))
vi.mock('@/lib/fal/observability', () => ({ buildFalResponseSnapshot: () => ({}) }))

import { finalizeGenerationJob } from '@/lib/fal/finalize'

function frames(tag: string) {
  return {
    start: Buffer.from(`${tag}-start`),
    direction: Buffer.from(`${tag}-direction`),
    end: Buffer.from(`${tag}-end`),
  }
}

/** mock 호출 목록에서 프레임 파일(path)만 골라 path→buffer 짝으로 만든다. */
function framePairs(calls: unknown[][], pattern: RegExp): Map<string, Buffer> {
  const map = new Map<string, Buffer>()
  for (const [path, buf] of calls as [string, Buffer][]) {
    if (pattern.test(path)) map.set(path, buf)
  }
  return map
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.upload.mockResolvedValue({ error: null })
  mocks.storageFrom.mockReturnValue({ upload: mocks.upload })
  mocks.dbFrom.mockReturnValue({
    update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
  })
})

describe('rough grid finalize — 3프레임 썸네일', () => {
  it('샷마다 start/direction/end 세 장 전부, 업로드와 같은 경로·같은 버퍼로 썸네일을 만든다', async () => {
    // 러프 그리드는 이미지 파싱 없이 길이(50KB)만 검사한다 — 아무 버퍼면 된다.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(Buffer.alloc(60_000))))
    mocks.crop.mockResolvedValue([frames('s1'), frames('s2')])

    const job = {
      id: 'job-1',
      project_id: 'project-1',
      kind: 'shot_rough_storyboard',
      target: { workspaceId: 'ws-1', writerShotIds: ['shot-1', 'shot-2'], gridVariant: 'grid4' },
      input_snapshot: {},
    } as never

    await finalizeGenerationJob(job, { media: 'image', url: 'https://fal.media/grid.png' })

    const framePattern = /_rough_(start|direction|end)\.png$/
    const uploaded = framePairs(mocks.upload.mock.calls, framePattern)
    const thumbed = framePairs(mocks.uploadThumbnail.mock.calls, framePattern)

    // 2샷 × 3프레임 = 6장, 경로 집합 일치(같은 문자열 — 오타로 짝이 어긋나면 여기서 걸린다).
    expect(uploaded.size).toBe(6)
    expect(new Set(thumbed.keys())).toEqual(new Set(uploaded.keys()))
    // 버퍼 짝 일치 — 썸네일이 그 경로의 원본과 같은 그림에서 나왔다.
    for (const [path, buf] of uploaded) expect(thumbed.get(path)).toBe(buf)
  })
})

describe('real grid finalize — 3프레임 썸네일', () => {
  it('실사 그리드도 storyboard start/direction/end 세 장 전부 썸네일을 만든다', async () => {
    // 실사 그리드는 sharp.metadata 로 방향을 검사한다 — 실제 PNG 가 필요하다.
    //   요청 캔버스 기본값(1536x1024)과 같은 가로 방향 + 50KB 이상이면 통과.
    const raw = Buffer.alloc(512 * 342 * 3)
    for (let i = 0; i < raw.length; i++) raw[i] = (Math.random() * 256) | 0
    const png = await sharp(raw, { raw: { width: 512, height: 342, channels: 3 } })
      .png()
      .toBuffer()
    expect(png.length).toBeGreaterThan(50_000)
    // Node 의 Buffer 는 BodyInit 에 안 맞는다 — 저장소 관행대로 ArrayBuffer 로 떠서 넘긴다
    // (tests/director-video-lifecycle.test.ts 의 responseBody 와 같은 변환).
    const body = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)))
    mocks.crop.mockResolvedValue([frames('s1')])

    const job = {
      id: 'job-2',
      project_id: 'project-1',
      kind: 'storyboard_real_grid',
      target: { workspaceId: 'ws-1', writerShotIds: ['shot-1'], gridVariant: 'grid4' },
      input_snapshot: {},
    } as never

    await finalizeGenerationJob(job, { media: 'image', url: 'https://fal.media/grid.png' })

    const framePattern = /_storyboard_(start|direction|end)\.png$/
    const uploaded = framePairs(mocks.upload.mock.calls, framePattern)
    const thumbed = framePairs(mocks.uploadThumbnail.mock.calls, framePattern)

    expect(uploaded.size).toBe(3)
    expect(new Set(thumbed.keys())).toEqual(new Set(uploaded.keys()))
    for (const [path, buf] of uploaded) expect(thumbed.get(path)).toBe(buf)
  })
})
