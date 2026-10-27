// 브레이크다운 레퍼런스 그림 올리기는 프로젝트 주인의 JPG · PNG · WebP 그림만 받아 이 프로젝트 보관함에 두고 그 주소를 돌려준다 (2026-10-27 오너)
import sharp from 'sharp'
import { NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  uploads: [] as Array<{ path: string; data: Buffer; contentType: string }>,
}))

vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.access }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.maybeSingle = async () => ({ data: { workspace_id: 'ws-1' }, error: null })
      return q
    },
  },
}))
vi.mock('@/lib/storage/media', async (original) => ({
  ...(await original<typeof import('@/lib/storage/media')>()),
  mediaUpload: async (path: string, data: Buffer, options: { contentType: string }) => {
    mocks.uploads.push({ path, data: Buffer.from(data), contentType: options.contentType })
    return { data: { path }, error: null }
  },
}))

import { POST } from '@/app/api/artist/breakdown-image/route'
import { isOwnMediaUrl, mediaPathFromUrl } from '@/lib/storage/media-url'
import { IMAGE_MAX_BYTES } from '@/lib/upload/limits'

const picture = (format: 'png' | 'jpeg' | 'webp' = 'png', width = 64, height = 32) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 60, b: 40 } } }).toFormat(format).toBuffer()

/** 보낼 파일 — Buffer 는 Blob 조각 타입이 아니라 Uint8Array 로 감싼다. */
const blob = (data: Buffer | Uint8Array | string, type: string) => new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type })

const post = (file: Blob | null, opts: { projectId?: string; name?: string; cookie?: string } = {}) => {
  const form = new FormData()
  form.append('projectId', opts.projectId ?? 'project-1')
  if (file) form.append('file', file, opts.name ?? 'minho.png')
  return POST(new Request('http://localhost/api/artist/breakdown-image', {
    method: 'POST',
    body: form,
    headers: opts.cookie ? { cookie: opts.cookie } : undefined,
  }))
}
const originals = () => mocks.uploads.filter((u) => !u.path.endsWith('_thumb.webp'))

beforeEach(() => {
  mocks.uploads.length = 0
  mocks.access.mockReset()
  mocks.access.mockImplementation(async (_req: Request, projectId: string) => ({ ok: true, projectId, userId: 'owner', viaShare: false }))
})

describe('레퍼런스 그림 올리기 라우트', () => {
  it('프로젝트 주인이 그림을 올리면 이 프로젝트 보관함의 브레이크다운 칸에 두고 그 주소를 돌려준다', async () => {
    // 왜: 정상 경로 고정 — 이 주소가 카드 그림이 되고, 넘길 때 서버는 우리 보관함 주소만 받는다.
    const response = await post(blob(await picture('png'), 'image/png'))

    expect(response.status).toBe(200)
    const body = (await response.json()) as { ok: boolean; url: string }
    expect(body.ok).toBe(true)
    expect(isOwnMediaUrl(body.url)).toBe(true)
    expect(mediaPathFromUrl(body.url)).toMatch(/^ws-1\/project-1\/breakdown\/[0-9a-f-]{36}\.png$/)
    expect(originals()).toEqual([expect.objectContaining({ path: mediaPathFromUrl(body.url), contentType: 'image/png' })])
    // 그리드 · 카드가 읽는 작은 미리보기도 옆에 만든다.
    expect(mocks.uploads.some((u) => u.path === mediaPathFromUrl(body.url)!.replace(/\.png$/, '_thumb.webp'))).toBe(true)
  })

  it('프로젝트 주인이 아니면 그림을 받지 않는다', async () => {
    // 왜: 남의 프로젝트 보관함에 파일을 쌓거나 남의 카드 그림을 바꿀 수 없어야 한다.
    mocks.access.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })

    const response = await post(blob(await picture('png'), 'image/png'))

    expect(response.status).toBe(403)
    expect(mocks.uploads).toEqual([])
  })

  it('공유 데모 화면에서 온 요청은 그림을 받지 않는다', async () => {
    // 왜: 데모(공유) 화면은 읽기 전용이다.
    const response = await post(blob(await picture('png'), 'image/png'), { cookie: `demo_share=${'a'.repeat(64)}` })

    expect(response.status).toBe(403)
    expect(mocks.access).not.toHaveBeenCalled()
    expect(mocks.uploads).toEqual([])
  })

  it('JPG · PNG · WebP 가 아닌 파일은 받지 않는다', async () => {
    // 왜: 카드 그림은 화면과 그림 생성 참고로 그대로 쓰인다 — GIF · SVG 는 그림 모델이 읽지 못하거나 화면에서 스크립트가 돈다.
    const gif = await post(blob('GIF89a', 'image/gif'), { name: 'minho.gif' })
    const svg = await post(blob('<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml'), { name: 'minho.svg' })

    expect([gif.status, svg.status]).toEqual([415, 415])
    expect(await gif.json()).toMatchObject({ code: 'unsupported_type' })
    expect(mocks.uploads).toEqual([])
  })

  it('확장자만 그림이고 그림으로 열리지 않는 파일은 받지 않는다', async () => {
    // 왜: 열리지 않는 파일이 카드 그림이 되면 카드가 깨진 채 남고 그림 생성 참고도 실패한다.
    const garbage = await post(blob('not really a picture', 'image/png'))
    const mislabeled = await post(blob(await picture('png'), 'image/jpeg'), { name: 'minho.jpg' })

    expect([garbage.status, mislabeled.status]).toEqual([400, 400])
    expect(await garbage.json()).toMatchObject({ code: 'invalid_image' })
    expect(mocks.uploads).toEqual([])
  })

  it('10MB 를 넘는 그림은 받지 않는다', async () => {
    // 왜: 서버 상한은 채팅 업로드와 같은 IMAGE_MAX_BYTES 다. 화면은 4MB 를 넘으면 미리 줄여 보낸다.
    const huge = new Uint8Array(IMAGE_MAX_BYTES + 1)
    huge.set(await picture('png'))

    const response = await post(blob(huge, 'image/png'))

    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ code: 'too_large' })
    expect(mocks.uploads).toEqual([])
  })

  it('사진의 회전 정보대로 세워 저장하고 촬영 정보는 지운다', async () => {
    // 왜: 휴대폰 사진은 회전 정보만 달고 누운 채 저장된다 — 그대로 두면 그림 모델이 누운 그림을 참고하고, 촬영 정보가 공개 주소로 나간다.
    const photo = await sharp({ create: { width: 64, height: 32, channels: 3, background: { r: 10, g: 120, b: 200 } } })
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'phone' } } })
      .toBuffer()

    const response = await post(blob(photo, 'image/jpeg'), { name: 'phone.jpg' })

    expect(response.status).toBe(200)
    const [stored] = originals()
    expect(stored.path).toMatch(/\.jpg$/)
    const meta = await sharp(stored.data).metadata()
    expect([meta.width, meta.height]).toEqual([32, 64])
    expect(meta.orientation).toBeUndefined()
    expect(meta.exif).toBeUndefined()
  })

  it('긴 변이 2048을 넘는 그림은 비율을 지켜 긴 변 2048로 줄여 저장한다', async () => {
    // 왜: 화면은 파일 크기로만 줄인다 — 단색 PNG 처럼 용량은 작고 픽셀이 큰 그림이 그대로 시트 · 참고 그림이 되면 그림 모델이 느려지거나 거절한다(2026-10-27 검토 지적).
    const response = await post(blob(await picture('png', 3000, 1500), 'image/png'))

    expect(response.status).toBe(200)
    const meta = await sharp(originals()[0].data).metadata()
    expect([meta.width, meta.height]).toEqual([2048, 1024])
  })

  it('가로나 세로가 다른 쪽의 4배를 넘는 그림은 받지 않는다', async () => {
    // 왜: 띠처럼 긴 그림은 인물 시트 · 배경 와이드샷 자리에 맞지 않아 카드와 장면 그림이 깨진다(2026-10-27 검토 지적).
    for (const [width, height] of [[500, 100], [100, 500]]) {
      const response = await post(blob(await picture('png', width, height), 'image/png'))
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'bad_shape' })
    }
    expect(mocks.uploads).toEqual([])
  })
})
