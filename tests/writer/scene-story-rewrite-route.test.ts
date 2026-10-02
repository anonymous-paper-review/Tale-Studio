// 다시 쓰기 안 하나를 만드는 서버 안쪽 요청은 비밀 열쇠가 맞을 때만 받고, 받은 안 하나만 만든다 (2026-10-02 시안 v04, 검토 지적)
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ generate: vi.fn(), after: vi.fn() }))
vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/server')>()), after: mocks.after }))
vi.mock('@/lib/writer/scene-story-rewrite', () => ({ generateSceneStoryRewrite: mocks.generate }))

import { POST } from '@/app/api/writer/scene-story-rewrite/route'

const request = (headers: Record<string, string> = {}) => new NextRequest('http://localhost/api/writer/scene-story-rewrite', {
  method: 'POST',
  body: JSON.stringify({ projectId: 'p1', runId: 'run-1', proposalId: 'prop-1', variantId: 'v2' }),
  headers: { 'Content-Type': 'application/json', ...headers },
})

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

describe('다시 쓰기 안 하나 만들기', () => {
  it('비밀 열쇠가 다르면 받지 않는다', async () => {
    vi.stubEnv('WRITER_STEP_SECRET', 'secret-1')
    expect((await POST(request({ 'x-writer-secret': 'wrong' }))).status).toBe(401)
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it('비밀 열쇠가 맞으면 바로 답하고 받은 안 하나만 뒤에서 만든다', async () => {
    vi.stubEnv('WRITER_STEP_SECRET', 'secret-1')
    const response = await POST(request({ 'x-writer-secret': 'secret-1' }))
    expect(response.status).toBe(202)
    await (mocks.after.mock.calls[0][0] as () => Promise<void>)()
    expect(mocks.generate).toHaveBeenCalledWith('p1', 'run-1', 'prop-1', 'v2')
  })
})
