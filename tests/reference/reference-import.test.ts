// 앞 화를 가져올 때 권한을 확인하고 보관함 안의 그림만 새 프로젝트로 복사한다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  mediaCopy: vi.fn(),
  mediaPublicUrl: vi.fn((path: string) => `https://media.test/${path}`),
  isOwnMediaUrl: vi.fn((url: unknown) =>
    typeof url === 'string' && url.startsWith('https://media.test/'),
  ),
  mediaPathFromUrl: vi.fn((url: string) =>
    url.startsWith('https://media.test/') ? url.slice('https://media.test/'.length) : null,
  ),
  responses: {} as Record<string, unknown[]>,
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/storage/media', () => ({
  mediaCopy: mocks.mediaCopy,
  mediaPublicUrl: mocks.mediaPublicUrl,
}))
vi.mock('@/lib/storage/media-url', () => ({
  isOwnMediaUrl: mocks.isOwnMediaUrl,
  mediaPathFromUrl: mocks.mediaPathFromUrl,
}))

import {
  copyOwnMediaTo,
  prepareReferenceImport,
  ReferenceImportValidationError,
} from '@/lib/reference-import'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.responses = {}
  mocks.mediaCopy.mockResolvedValue({ data: {}, error: null })
  mocks.mediaPublicUrl.mockImplementation((path: string) => `https://media.test/${path}`)
  mocks.isOwnMediaUrl.mockImplementation(
    (url: unknown) =>
      typeof url === 'string' && url.startsWith('https://media.test/'),
  )
  mocks.mediaPathFromUrl.mockImplementation((url: string) =>
    url.startsWith('https://media.test/') ? url.slice('https://media.test/'.length) : null,
  )
  mocks.from.mockImplementation((table: string) => {
    const result = mocks.responses[table]?.shift() ?? { data: null, error: null }
    return query(result)
  })
})

describe('참고 작품 가져오기에서 권한과 자료 복사 규칙을 지킨다', () => {
  it('다른 작업 공간의 참고 작품은 존재 여부도 알리지 않고 거절한다', async () => {
    mocks.responses.projects = [
      { data: { id: 'source', workspace_id: 'other-workspace' }, error: null },
    ]

    await expect(
      prepareReferenceImport({
        userId: 'owner',
        destinationWorkspaceId: 'workspace-1',
        referenceProjectId: 'source',
      }),
    ).rejects.toMatchObject({ code: 'reference_not_found', status: 404 })
  })

  it('참고 작품을 허용하지 않는 요금제면 소유자를 다시 확인해도 거절한다', async () => {
    mocks.responses.projects = [
      {
        data: {
          id: 'source',
          workspace_id: 'workspace-1',
          style_anchor_key: null,
          custom_style_anchor: null,
        },
        error: null,
      },
    ]
    mocks.responses.workspaces = [
      { data: { id: 'workspace-1', owner_id: 'owner', plan: 's10' }, error: null },
    ]

    const error = await captureError(() =>
      prepareReferenceImport({
        userId: 'owner',
        destinationWorkspaceId: 'workspace-1',
        referenceProjectId: 'source',
      }),
    )

    expect(error).toBeInstanceOf(ReferenceImportValidationError)
    expect(error).toMatchObject({ code: 'reference_unavailable', status: 403 })
  })

  // 왜: 혼자 정한 것 — 다음 화 그림 복사가 이 함수를 쓴다. 보관함 밖 주소를 받으면 남의 그림을 이 보관함에 들인다.
  //   옛 참고 프로젝트 흐름의 "외부 스타일 이미지 주소" 테스트가 이 규칙을 지켰다. 그 흐름을 지워서 함수를 직접 검사한다.
  it('보관함 밖 그림 주소는 복사하지 않고 실패로 알린다', async () => {
    const result = await copyOwnMediaTo('https://external.test/style.png', 'workspace-1/destination/series/style-anchor-source')

    expect(result).toEqual({ ok: false, detail: 'source URL is outside the media bucket' })
    expect(mocks.mediaCopy).not.toHaveBeenCalled()
  })
})

async function captureError(run: () => Promise<unknown>) {
  try {
    await run()
    throw new Error('expected the operation to reject')
  } catch (error) {
    return error
  }
}

function query(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    update: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  }
  return builder
}
