// 연출 그림 저장 · 한 장 다시 그리기 · 화살표 분리가 그 프로젝트 폴더의 파일만 덮어쓰고, 미리보기는 '그사이 다시 그려졌는지' 확인 뒤에만 바꾸는지 검사한다
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PROJECT = '11111111-2222-4333-8444-555555555555'
const WORKSPACE = 'ws-own'
const SHOT = 'sh_01_03'
const own = (frame: string) => `https://media.test/${WORKSPACE}/${PROJECT}/shots/v1-x_rough_${frame}.png?v=1`
const foreign = (frame: string) => `https://media.test/ws-other/99999999-2222-4333-8444-555555555555/shots/v1-y_rough_${frame}.png?v=1`
const roughOf = (url: (frame: string) => string, generatedAt = 100) => ({
  status: 'completed', generatedAt, frames: { start: url('start'), direction: url('direction'), end: url('end') },
})

const mocks = vi.hoisted(() => ({ from: vi.fn(), generateReservedImage: vi.fn(), upload: vi.fn(), thumbnail: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/fal/generate-image', () => ({ generateReservedImage: mocks.generateReservedImage }))
vi.mock('@/lib/storage/media', () => ({
  mediaPathFromUrl: (url: string) => new URL(url).pathname.replace(/^\//, ''),
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
  mediaUpload: mocks.upload,
}))
vi.mock('@/lib/storage-thumb', () => ({ uploadThumbnail: mocks.thumbnail }))

import { regenerateRoughFrame, saveDirectingFrame, separateArrowLayer } from '@/lib/writer/directing-edit'

/** 차례대로 돌려줄 러프 JSON — 두 번째 읽기에 다른 값을 주면 "그사이 다시 그려짐"이다. */
let roughReads: Array<Record<string, unknown>>
function query(table: string) {
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.update = () => q
  q.maybeSingle = async () => {
    if (table === 'projects') return { data: { workspace_id: WORKSPACE }, error: null }
    const rough = roughReads.length > 1 ? roughReads.shift()! : roughReads[0]
    return { data: { rough_storyboard: rough, action_description: 'She pushes the coin in' }, error: null }
  }
  q.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve, reject)
  return q
}
const png = `data:image/png;base64,${Buffer.alloc(20_000, 9).toString('base64')}`

beforeEach(() => {
  vi.clearAllMocks()
  mocks.from.mockImplementation((table: string) => query(table))
  mocks.generateReservedImage.mockResolvedValue({ url: 'https://fal.test/result.jpg' })
  mocks.upload.mockResolvedValue({ data: { path: 'saved' }, error: null })
  mocks.thumbnail.mockResolvedValue(undefined)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.alloc(20_000, 7), { status: 200, headers: { 'content-type': 'image/jpeg' } })))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('연출 고치기는 그 프로젝트 폴더의 파일만 덮어쓴다', () => {
  // 왜: 2026-11-01 리뷰 M5 — 덮어쓸 파일 주소를 브라우저가 고칠 수 있는 rough_storyboard 에서 가져오고 버킷만 확인했다. 다른 작업 공간의 그림과
  //   미리보기를 덮어쓸 수 있었다. 라우트는 늘 projectFolderOnly 로 부르고, "작업 공간/프로젝트/" 밖이면 아무것도 올리지 않고 거절한다.
  it('연출 그림 저장 · 한 장 다시 그리기 · 화살표 분리는 그 프로젝트 폴더 밖의 파일이면 거절하고 아무것도 올리지 않는다', async () => {
    roughReads = [roughOf(foreign)]
    await expect(saveDirectingFrame(PROJECT, SHOT, png, 'ko', { projectFolderOnly: true })).rejects.toThrow()
    await expect(regenerateRoughFrame(PROJECT, SHOT, 'start', 'ko', { projectFolderOnly: true })).rejects.toThrow()
    await expect(separateArrowLayer(PROJECT, SHOT, 'ko', { projectFolderOnly: true })).rejects.toThrow()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.thumbnail).not.toHaveBeenCalled()
    // 한 장 다시 그리기는 그리기 전에 막는다(남의 파일 때문에 그림 값을 쓰지 않는다).
    expect(mocks.generateReservedImage).toHaveBeenCalledTimes(1)

    const route = readFileSync('src/app/api/writer/rough-directing-edit/route.ts', 'utf8')
    expect(route.match(/projectFolderOnly: true/g)?.length).toBe(4)
  })

  // 왜: 정상 경로 고정 — 그 프로젝트 폴더의 그림이면 지금처럼 저장하고 다시 그린다.
  it('그 프로젝트 폴더의 그림이면 지금처럼 저장하고 한 장을 다시 그린다', async () => {
    roughReads = [roughOf(own)]
    await saveDirectingFrame(PROJECT, SHOT, png, 'ko', { projectFolderOnly: true })
    await regenerateRoughFrame(PROJECT, SHOT, 'start', 'ko', { projectFolderOnly: true })
    expect(mocks.upload.mock.calls.map(([path]) => path)).toEqual([
      `${WORKSPACE}/${PROJECT}/shots/v1-x_rough_direction.png`,
      `${WORKSPACE}/${PROJECT}/shots/v1-x_rough_start.jpg`,
    ])
  })
})

describe('한 장 다시 그리기의 미리보기', () => {
  // 왜: 2026-11-01 리뷰 L7 — 미리보기를 "그사이 러프 세트가 다시 그려졌는지" 확인보다 먼저 올렸다. PNG · JPG 가 미리보기 한 장을 같이 써서,
  //   그사이 새로 그린 세트의 미리보기를 옛 장으로 덮을 수 있었다.
  it('한 장 다시 그리기는 그사이 러프 세트가 새로 그려졌으면 미리보기를 바꾸지 않는다', async () => {
    roughReads = [roughOf(own, 100), roughOf(own, 200)]
    await expect(regenerateRoughFrame(PROJECT, SHOT, 'start', 'ko', { projectFolderOnly: true })).rejects.toThrow()
    expect(mocks.thumbnail).not.toHaveBeenCalled()
  })
})
