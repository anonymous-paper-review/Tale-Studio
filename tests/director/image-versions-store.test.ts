// 실사 이미지 버전 저장 — 완료 · 올리기가 지금 그림을 읽어 버전을 덧붙이고, 그림 파일은 작업마다 새 이름이라 옛 버전을 덮지 않는다 (디자이너 11/13 D6 · 오너 2026-11-14 답 5번 · 리드 A)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
  uploadThumbnail: vi.fn(),
  crop: vi.fn(),
  completeJob: vi.fn(),
  getUser: vi.fn(),
  owns: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, storage: { from: mocks.storageFrom } } }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/storage-thumb', () => ({ uploadThumbnail: mocks.uploadThumbnail }))
vi.mock('@/lib/writer/rough-grid-crop', () => ({ cropRoughGridFrames: mocks.crop }))
vi.mock('@/lib/generation-jobs', () => ({
  completeGenerationJob: mocks.completeJob,
  failGenerationJob: vi.fn(),
  patchGenerationJobResponseSnapshotByRequestId: vi.fn(),
  userOwnsProject: mocks.owns,
  GenerationJobTerminalTransitionError: class GenerationJobTerminalTransitionError extends Error {},
}))
vi.mock('@/lib/director-video-takes', () => ({ completeDirectorVideoAttempt: vi.fn(), markDirectorVideoAttemptFailed: vi.fn() }))
vi.mock('@/lib/artist/portrait', () => ({ cropTurnaroundPortrait: vi.fn() }))
vi.mock('@/lib/fal/observability', () => ({ buildFalResponseSnapshot: () => ({}) }))

import { updateStoryboardImage } from '@/lib/director/storyboard-image-store'
import { finalizeGenerationJob } from '@/lib/fal/finalize'
import { storyboardImageVersions } from '@/lib/director/storyboard-image-versions'
import { POST as uploadImage } from '@/app/api/assets/upload-image/route'
import type { StoryboardImage } from '@/types/director'

/** shots 표 한 줄을 흉내 낸다 — 읽기(select … maybeSingle)와 rev 를 보는 쓰기(update … eq/is … select). */
function shotsTable(initial: StoryboardImage | null, options: { interleave?: () => void } = {}) {
  const row = { storyboard_image: initial as StoryboardImage | null }
  const writes: StoryboardImage[] = []
  let interleaved = false
  const from = () => {
    const filters: Array<[string, unknown]> = []
    let patch: { storyboard_image: StoryboardImage } | null = null
    const query = {
      select: vi.fn(() => query),
      update: vi.fn((value: { storyboard_image: StoryboardImage }) => { patch = value; return query }),
      eq: vi.fn((column: string, value: unknown) => { filters.push([column, value]); return query }),
      is: vi.fn((column: string, value: unknown) => { filters.push([column, value]); return query }),
      maybeSingle: vi.fn(async () => ({ data: { ...row }, error: null })),
      then: (resolve: (value: unknown) => unknown) => {
        if (!patch) return Promise.resolve({ data: [], error: null }).then(resolve)
        if (options.interleave && !interleaved) { interleaved = true; options.interleave() }
        const revFilter = filters.find(([column]) => column === 'storyboard_image->>rev')
        const currentRev = row.storyboard_image?.rev
        const ok = revFilter && (revFilter[1] === null ? currentRev === undefined : String(currentRev) === revFilter[1])
        if (ok) { row.storyboard_image = patch.storyboard_image; writes.push(patch.storyboard_image) }
        return Promise.resolve({ data: ok ? [{ shot_id: 'shot-1' }] : [], error: null }).then(resolve)
      },
    }
    return query
  }
  return { row, writes, from }
}

const frames = (tag: string) => ({ start: Buffer.from(`${tag}-start`), direction: Buffer.from(`${tag}-direction`), end: Buffer.from(`${tag}-end`) })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.owns.mockResolvedValue(true)
  mocks.upload.mockResolvedValue({ error: null })
  mocks.storageFrom.mockReturnValue({ upload: mocks.upload, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://media.test/${path}` } }) })
})

describe('실사 이미지 버전 저장', () => {
  it('지금 그림을 읽어 버전을 덧붙여 쓰고, 그사이 다른 쓰기가 끼면 다시 읽고 써서 어느 버전도 잃지 않는다', async () => {
    // 왜: v1 을 고르는 순간 새 그림이 끝나는 것처럼 두 쓰기가 겹칠 수 있다 — 뒤 쓰기가 앞 쓰기를 덮으면 버전 하나가 목록에서 사라진다(혼자 정한 것).
    const table = shotsTable({ url: 'https://media.test/a.png', status: 'completed', errorMessage: null, generatedAt: 1, versions: [{ id: 'job-1', n: 1, url: 'https://media.test/a.png', generatedAt: 1, source: 'generated' }], versionId: 'job-1', rev: 1 }, {
      // 첫 쓰기 직전에 다른 쓰기(v2)가 먼저 들어간다.
      interleave: () => {
        table.row.storyboard_image = { ...table.row.storyboard_image!, versions: [...table.row.storyboard_image!.versions!, { id: 'job-2', n: 2, url: 'https://media.test/b.png', generatedAt: 2, source: 'generated' }], rev: 2 }
      },
    })
    mocks.from.mockImplementation(table.from)
    const written = await updateStoryboardImage('project-1', 'shot-1', (current) => ({
      ...current!,
      versions: [...current!.versions!, { id: 'job-3', n: current!.versions!.length + 1, url: 'https://media.test/c.png', generatedAt: 3, source: 'generated' }],
      rev: (current!.rev ?? 0) + 1,
    }))
    expect(written?.versions?.map((v) => v.id)).toEqual(['job-1', 'job-2', 'job-3'])
    expect(table.row.storyboard_image?.versions?.map((v) => v.id)).toEqual(['job-1', 'job-2', 'job-3'])
  })

  it('실사 그림이 끝나면 작업마다 새 파일 이름으로 저장하고 버전을 쌓아 그 버전을 지금 그림으로 한다', async () => {
    // 왜: 리드 A "작업마다 새 파일 이름(…_g{작업 id})" — 같은 자리에 덮어쓰면 옛 버전의 그림 파일이 사라진다.
    const table = shotsTable({ url: 'https://media.test/old.png', frames: { start: 'https://media.test/old.png', direction: 'https://media.test/old-d.png', end: 'https://media.test/old-e.png' }, status: 'completed', errorMessage: null, generatedAt: 5 })
    mocks.from.mockImplementation(table.from)
    const sharp = (await import('sharp')).default
    const raw = Buffer.alloc(512 * 342 * 3)
    for (let i = 0; i < raw.length; i++) raw[i] = (Math.random() * 256) | 0
    const png = await sharp(raw, { raw: { width: 512, height: 342, channels: 3 } }).png().toBuffer()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer)))
    mocks.crop.mockResolvedValue([frames('s1')])

    await finalizeGenerationJob({
      id: 'job-77', project_id: 'project-1', kind: 'storyboard_real_grid',
      target: { workspaceId: 'ws-1', writerShotIds: ['shot-1'], gridVariant: 'grid4' }, input_snapshot: {},
    } as never, { media: 'image', url: 'https://fal.media/grid.png' })

    const paths = mocks.upload.mock.calls.map(([path]) => String(path))
    expect(paths).toEqual(expect.arrayContaining([
      expect.stringMatching(/shots\/[^/]*_gjob-77_storyboard_start\.png$/),
      expect.stringMatching(/shots\/[^/]*_gjob-77_storyboard_end\.png$/),
    ]))
    const image = table.row.storyboard_image!
    expect(storyboardImageVersions(image).map((v) => [v.n, v.id])).toEqual([[1, 'legacy'], [2, 'job-77']])
    expect(image.versionId).toBe('job-77')
    expect(image.frames?.start).toMatch(/_gjob-77_storyboard_start\.png/)
  })

  it('직접 올린 실사 그림도 새 파일 이름으로 저장하고 버전 하나가 되어 지금 그림이 된다', async () => {
    // 왜: 리드 답 e — 올린 그림도 같은 목록에서 되돌릴 수 있다. 같은 자리에 덮어쓰면 앞 버전 그림이 사라진다.
    const table = shotsTable({ url: 'https://media.test/a.png', status: 'completed', errorMessage: null, generatedAt: 1 })
    const project = { select: () => project, eq: () => project, maybeSingle: async () => ({ data: { workspace_id: 'ws1' }, error: null }) }
    mocks.from.mockImplementation((name: string) => (name === 'projects' ? project : table.from()))
    mocks.getUser.mockResolvedValue({ id: 'user-1' })
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64')
    const form = new FormData()
    form.set('projectId', 'project-1')
    form.set('type', 'shot')
    form.set('entityId', 'shot-1')
    form.set('field', 'storyboard_image')
    form.set('file', new File([png], 'frame.png', { type: 'image/png' }))

    const res = await uploadImage(new Request('http://test/api/assets/upload-image', { method: 'POST', body: form }))

    expect(res.status).toBe(200)
    expect(String(mocks.upload.mock.calls[0]![0])).toMatch(/shots\/[^/]*_u[0-9a-f-]{36}_storyboard_image\.png$/)
    const image = table.row.storyboard_image!
    expect(storyboardImageVersions(image).map((v) => [v.n, v.source])).toEqual([[1, 'generated'], [2, 'upload']])
    expect(image.versionId).toMatch(/^upload-/)
    expect(image.url).toBe((await res.json()).publicUrl)
  })
})
