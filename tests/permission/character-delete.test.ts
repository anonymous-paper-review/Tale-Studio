// 로그인하지 않았거나 남의 프로젝트면 Artist 인물 카드를 지울 수 없다 (2026-10-27 디자이너 QA 1차)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))

import { DELETE } from '@/app/api/artist/character/route'

const PROJECT = 'proj-1'
function deleteRequest() {
  return new Request('http://localhost/api/artist/character', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: PROJECT, characterId: 'char_new_police' }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // 실제 접근 가드(requireProjectAccess)가 쓰는 표만 둔다 — 소유자는 ws-1 의 proj-1 만 갖는다.
  mocks.from.mockImplementation((table: string) => {
    if (table === 'workspaces') {
      return { select: () => ({ eq: (_column: string, ownerId: string) => ({ data: ownerId === 'owner' ? [{ id: 'ws-1' }] : [] }) }) }
    }
    if (table === 'projects') {
      return { select: () => ({ eq: (_column: string, id: string) => ({ in: (_c: string, ids: string[]) => ({ maybeSingle: () => ({ data: id === PROJECT && ids.includes('ws-1') ? { id } : null }) }) }) }) }
    }
    throw new Error(`unexpected table: ${table}`)
  })
})

describe('인물 카드 지우기의 접근 제한(디자이너 QA 1차 #04)', () => {
  it('로그인하지 않았거나 남의 프로젝트면 인물을 지울 수 없다', async () => {
    // 왜: 지운 카드는 되돌릴 수 없다. 디자이너 QA 1차 #04 로 생긴 지우기 주소를 다른 사람이 알아도 남의 카드를 지우면 안 된다.
    mocks.getUser.mockResolvedValue(null)
    expect((await DELETE(deleteRequest())).status).toBe(401)

    mocks.getUser.mockResolvedValue({ id: 'stranger' })
    expect((await DELETE(deleteRequest())).status).toBe(403)

    // 접근을 확인하기 전에는 인물 · 작업 표를 읽거나 지우지 않는다.
    for (const table of ['characters', 'generation_jobs', 'scenes', 'shots']) expect(mocks.from).not.toHaveBeenCalledWith(table)
  })
})
