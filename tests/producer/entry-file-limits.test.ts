// Producer 시작 화면 파일 올리기는 로그인부터 보고, 압축을 풀면 너무 커지는 문서는 읽지 않는다 (리뉴얼 1차 검토 2026-10-19)
import { deflateRawSync } from 'node:zlib'
import JSZip from 'jszip'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), owns: vi.fn() }))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.owns }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: () => { throw new Error('DB 를 읽으면 안 된다') } } }))

import { POST as uploadEntryFile } from '@/app/api/produce/entry/file/route'
import { EntryFileUnreadableError, extractHwpxText, inflateSection } from '@/lib/entry/extract-text'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('로그인 먼저', () => {
  it('로그인하지 않은 파일 올리기는 파일을 읽기 전에 거절한다', async () => {
    // 왜: 로그인 확인보다 올린 파일(최대 수 MB)을 먼저 풀어 읽으면, 로그인하지 않은 누구나 서버에 일을 시킬 수 있다.
    mocks.getUser.mockResolvedValue(null)
    const request = new Request('http://localhost/api/produce/entry/file', { method: 'POST', body: 'x' })
    const formData = vi.spyOn(request, 'formData')

    const response = await uploadEntryFile(request)

    expect(response.status).toBe(401)
    expect(formData).not.toHaveBeenCalled()
  })
})

describe('압축을 푼 크기 한도', () => {
  it('압축을 풀면 너무 커지는 한글(HWP) 본문은 읽지 않고 읽을 수 없는 파일로 알린다', () => {
    // 왜: 10MB 안쪽 파일도 풀면 수 GB 가 되도록 만들 수 있다 — 끝까지 풀면 서버 메모리가 바닥난다.
    const bomb = deflateRawSync(Buffer.alloc(3 * 1024 * 1024))
    expect(() => inflateSection(bomb, 1024 * 1024)).toThrow(EntryFileUnreadableError)
  })

  it('압축을 풀면 너무 커지는 한글(HWPX) 문서는 읽지 않고 읽을 수 없는 파일로 알린다', async () => {
    // 왜: HWPX 는 zip 이라 같은 방식으로 부풀릴 수 있다.
    const zip = new JSZip()
    zip.file('Contents/section0.xml', `<hp:p><hp:t>${'가'.repeat(1024 * 1024)}</hp:t></hp:p>`)
    const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })

    await expect(extractHwpxText(data, 1024 * 1024)).rejects.toThrow(EntryFileUnreadableError)
  })

  it('보통 크기의 한글(HWP) 본문은 지금처럼 푼다', () => {
    // 왜: 정상 경로 고정 — 한도는 터무니없이 큰 것만 막는다.
    const text = Buffer.from('보통 크기의 본문')
    expect(Buffer.from(inflateSection(deflateRawSync(text))).toString()).toBe('보통 크기의 본문')
  })
})
