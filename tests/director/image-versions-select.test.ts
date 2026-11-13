// 실사 이미지 버전 고르기 — v1 · v2 를 누르면 다시 만들지 않고(Take 0) 그 버전이 지금 그림이 된다 (디자이너 11/13 D6 · 오너 2026-11-14 답 5번 · 리드 A)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), owns: vi.fn(), update: vi.fn() }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.owns }))
vi.mock('@/lib/director/storyboard-image-store', () => ({ updateStoryboardImage: mocks.update }))
vi.mock('@/lib/generation-queue', () => ({ refreshGenerationQueue: vi.fn() }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: () => Promise.resolve() }))

import { POST } from '@/app/api/director/storyboard-image/version/route'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { withStoryboardVersion } from '@/lib/director/storyboard-image-versions'
import type { StoryboardImage } from '@/types/director'

const made = (id: string, tag: string, generatedAt: number) => ({
  id, url: `https://media.test/${tag}-start.png`, generatedAt, source: 'generated' as const,
  frames: { start: `https://media.test/${tag}-start.png`, direction: `https://media.test/${tag}-dir.png`, end: `https://media.test/${tag}-end.png` },
})
const TWO: StoryboardImage = withStoryboardVersion(withStoryboardVersion(null, made('job-1', 'a', 100), { select: true }), made('job-2', 'b', 200), { select: true })

const post = (body: unknown) => POST(new Request('http://test/api/director/storyboard-image/version', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.owns.mockResolvedValue(true)
  // 서버 저장은 지금 그림을 넘겨받아 바꾼 값을 쓴다 — 바꾼 결과를 그대로 돌려준다.
  mocks.update.mockImplementation(async (_project: string, _shot: string, change: (current: StoryboardImage | null) => StoryboardImage | null) => change(TWO))
})

afterEach(() => vi.unstubAllGlobals())

describe('실사 이미지 버전 고르기', () => {
  it('v1 을 고르면 서버가 다시 만들지 않고 v1 을 지금 그림으로 바꾼다', async () => {
    // 왜: D6 "v1 · v2를 누르면 그 버전으로 돌아가요" — 생성 · Take 없이 지금 칸만 바꾼다(리드 A "비용 0").
    const res = await post({ projectId: 'project-1', writerShotId: 'shot-1', versionId: 'job-1' })
    expect(res.status).toBe(200)
    const { image } = (await res.json()) as { image: StoryboardImage }
    expect(image).toMatchObject({ url: 'https://media.test/a-start.png', versionId: 'job-1' })
    expect(image.versions).toHaveLength(2)
    expect(mocks.update).toHaveBeenCalledWith('project-1', 'shot-1', expect.any(Function))
  })

  it('없는 버전을 고르면 아무것도 바꾸지 않고 찾지 못했다고 답한다', async () => {
    // 왜: 다른 창에서 이미 바뀐 목록일 수 있다 — 엉뚱한 그림을 지금 그림으로 만들지 않는다.
    const res = await post({ projectId: 'project-1', writerShotId: 'shot-1', versionId: 'nope' })
    expect(res.status).toBe(404)
  })

  it('남의 프로젝트 버전은 고를 수 없다', async () => {
    // 왜: 정상 경로 고정 — 다른 생성 라우트와 같은 주인 확인.
    mocks.owns.mockResolvedValue(false)
    expect((await post({ projectId: 'project-1', writerShotId: 'shot-1', versionId: 'job-1' })).status).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('화면에서 버전을 누르면 바로 그 버전을 보이고, 서버가 고른 결과로 맞춘다', async () => {
    // 왜: 누른 즉시 바뀌어야 되돌아간 줄 안다 — 서버 답(차례 rev 포함)이 오면 그것으로 맞춘다.
    const api = () => useDirectorCanvasStore.getState()
    api().reset()
    useDirectorCanvasStore.setState({ projectId: 'project-1' })
    const shotId = api().addShotNode(null, { x: 0, y: 0 }, '버전')
    api().updateNodeData<'shot'>(shotId, { writerShotId: 'shot-1', storyboardImage: TWO })
    const serverImage = { ...withStoryboardVersion(TWO, made('job-1', 'a', 100), { select: true }), rev: 9 }
    const fetcher = vi.fn().mockResolvedValue(Response.json({ image: serverImage }))
    vi.stubGlobal('fetch', fetcher)

    const pending = api().selectStoryboardImageVersion(shotId, 'job-1')
    const local = api().nodes.find((n) => n.id === shotId)!.data as { storyboardImage: StoryboardImage }
    expect(local.storyboardImage).toMatchObject({ url: 'https://media.test/a-start.png', versionId: 'job-1' })
    await pending

    expect(fetcher).toHaveBeenCalledWith('/api/director/storyboard-image/version', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(String(fetcher.mock.calls[0]![1].body))).toEqual({ projectId: 'project-1', writerShotId: 'shot-1', versionId: 'job-1' })
    const after = api().nodes.find((n) => n.id === shotId)!.data as { storyboardImage: StoryboardImage }
    expect(after.storyboardImage.rev).toBe(9)
  })
})
