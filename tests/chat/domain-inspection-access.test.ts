// 프로젝트 근거 조회는 로그인과 소유권 확인을 마친 뒤 읽기만 수행한다
import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ user: vi.fn(), owns: vi.fn(), load: vi.fn() }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mock.user }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mock.owns }))
vi.mock('@/lib/chat-tools/inspect-server', () => ({ loadProjectInspection: mock.load }))
import { POST } from '@/app/api/project/[id]/chat-inspect/route'
import { parseInspection } from '@/lib/chat-tools/inspect'
const run = (body: unknown = { stage: 'writer', target: 'shot', id: 's' }) => POST(new Request('http://localhost/api/project/p/chat-inspect', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'p' }) })
beforeEach(() => { mock.user.mockReset().mockResolvedValue({ id: 'owner' });mock.owns.mockReset().mockResolvedValue(true);mock.load.mockReset().mockResolvedValue({ result: { status: 'ok' }, imageUrl: 'private-server-reference' }) })
it('다른 프로젝트의 연출 근거는 조회하지 않는다', async () => {
  // 왜: 서버 전용 원설계는 로그인만으로 읽을 수 없어야 한다.
  mock.owns.mockResolvedValue(false)
  expect((await run()).status).toBe(403);expect(mock.load).not.toHaveBeenCalled()
  mock.user.mockResolvedValue(null)
  expect((await run()).status).toBe(401);expect(mock.load).not.toHaveBeenCalled()
})
it('근거 조회의 이미지 주소는 브라우저에 전달하지 않고 모델 경계에서 확인한다', async () => {
  // 왜: 브라우저가 임의 URL을 되돌려 모델에게 가져오게 하는 경로를 만들지 않는다.
  const response = await run()
  expect(response.status).toBe(200);expect(await response.json()).toEqual({ status: 'ok' })
  expect(mock.load).toHaveBeenCalledWith('p', { target: 'shot', id: 's' })
})
it('근거 조회에 편집이나 이미지 주소를 끼워 넣으면 실행 전에 거절한다', async () => {
  // 왜: 읽기 전용 도구로 저장·생성 권한을 늘리지 않는다.
  expect((await run({ stage: 'writer', target: 'shot', id: 's', patch: { durationSeconds: 1 } })).status).toBe(400)
  expect(parseInspection({ target: 'character', id: 'c', appearanceKey: 'young', includeImage: true, url: 'http://internal' }, 'artist')).toBeNull()
  expect(parseInspection({ target: 'character', id: 'c', includeImage: true }, 'artist')).toBeNull()
  expect(mock.load).not.toHaveBeenCalled()
})
it('근거 조회가 실패하면 미기록으로 바꾸지 않고 미확인으로 반환한다', async () => {
  // 왜: 장애 때문에 비어 있는 응답을 저장 사실의 부재로 오해하지 않는다.
  mock.load.mockRejectedValue(Error('offline'))
  expect((await run()).status).toBe(503)
})
