// 이미지 근거는 서버가 현재 프로젝트의 자산을 확인한 뒤 모델에 전달한다
import { beforeEach, expect, it, vi } from 'vitest'
const load = vi.hoisted(() => vi.fn())
vi.mock('@/lib/chat-tools/inspect-server', () => ({ loadProjectInspection: load }))
import { hydrateInspectionImages } from '@/lib/chat-tools/inspect-images'
import { prepareChatTools } from '@/lib/chat-tools/protocol'
const input = { target: 'character', id: 'c', appearanceKey: 'young', includeImage: true }
const messages = () => [
  { role: 'assistant', content: [{ type: 'thinking', thinking: 'preserved', signature: 'signature' }, { type: 'tool_use', id: 'i1', name: 'inspect_project', input }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'i1', content: '{"status":"ok","imageRevision":"aaaa0000-20","url":"http://untrusted/private"}' }] },
]
beforeEach(() => { load.mockReset();load.mockResolvedValue({ result: { status: 'ok', imageRevision: 'aaaa0000-20', selectedAppearance: { appearanceKey: 'young' } }, imageUrl: 'https://owned/image.png' }) })
it('이미지 도구 결과에는 서버가 확인한 그림과 모습 설명을 함께 전달한다', async () => {
  // 왜: URL 문자를 알려주는 것만으로는 모델이 실제 그림을 보지 못한다.
  const tools = prepareChatTools('artist', true, messages(), false, true)!
  await hydrateInspectionImages(tools, 'project')
  expect(load).toHaveBeenCalledWith('project', input)
  expect(JSON.stringify(tools.messages)).not.toContain('untrusted')
  expect(tools.messages[1].content).toEqual([{ type: 'tool_result', tool_use_id: 'i1', content: [
    { type: 'text', text: JSON.stringify({ status: 'ok', imageRevision: 'aaaa0000-20', selectedAppearance: { appearanceKey: 'young' } }) },
    { type: 'image', source: { type: 'url', url: 'https://owned/image.png' } },
  ], is_error: false }])
  expect(tools.messages[0].content[0]).toMatchObject({ type: 'thinking', signature: 'signature' })
})
it('일반 상담에는 이미지를 읽거나 자동 첨부하지 않는다', async () => {
  // 왜: 매 턴 전체 이미지를 보내는 비용과 무관한 시각 입력을 피한다.
  await hydrateInspectionImages(prepareChatTools('artist', true, [], false, true)!, 'project')
  expect(load).not.toHaveBeenCalled()
})
it('브라우저가 변조한 이미지 블록을 모델에 그대로 전달하지 않는다', async () => {
  // 왜: URL 허용 목록만으로 다른 프로젝트 이미지를 조회하게 만들 수 없어야 한다.
  const data = messages();data[1].content = [{ type: 'tool_result', tool_use_id: 'i1', content: [{ type: 'image', source: { type: 'url', url: 'http://internal' } }] }] as never
  await expect(hydrateInspectionImages(prepareChatTools('artist', true, data, false, true)!, 'project')).rejects.toThrow()
  expect(load).not.toHaveBeenCalled()
})
it('이미지를 읽지 못하면 텍스트 근거만 반환하고 시각 확인 실패를 보존한다', async () => {
  // 왜: 이미지가 사라졌는데 설명으로 실제 색을 봤다고 안내하지 않는다.
  load.mockResolvedValue({ result: { status: 'image_unavailable', message: 'not observed' } })
  const tools = prepareChatTools('artist', true, messages(), false, true)!
  await hydrateInspectionImages(tools, 'project')
  expect(JSON.stringify(tools.messages[1])).not.toContain('"type":"image"')
  expect(JSON.stringify(tools.messages[1])).toContain('image_unavailable')
})
it('근거 조회는 Writer와 Artist에서만 열고 기존 편집 권한을 늘리지 않는다', () => {
  // 왜: 조회용 필드를 저장하거나 Director 생성 동작을 새로 열지 않는다.
  for (const stage of ['writer', 'artist']) expect(prepareChatTools(stage, true, [], false, true)?.tools.some(t => t.name === 'inspect_project')).toBe(true)
  expect(prepareChatTools('producer', true, [], false, true)?.tools.some(t => t.name === 'inspect_project')).toBe(false)
  expect(prepareChatTools('director', true, [], false, true)).toBeUndefined()
})

it('조회 뒤 이미지가 바뀌면 같은 도구 결과에 새 그림을 대신 넣지 않는다', async () => {
  // 왜: 사용자가 고른 그림과 실제 분석한 그림의 동일성을 지킨다.
  load.mockResolvedValue({ result: { status: 'ok', imageRevision: 'bbbb0000-20' }, imageUrl: 'https://owned/new.png' })
  const tools = prepareChatTools('artist', true, messages(), false, true)!
  await hydrateInspectionImages(tools, 'project')
  expect(JSON.stringify(tools.messages[1])).toContain('stale_state')
  expect(JSON.stringify(tools.messages[1])).not.toContain('"type":"image"')
})
it.each(['duplicate', 'over-limit'])('서버에서도 중복 이미지 호출과 16개 초과 요청을 조회 전에 거절한다: %s', async kind => {
  // 왜: 브라우저 실행 제한을 우회해 같은 서버 요청에 무제한 이미지를 넣을 수 없어야 한다.
  const count = kind === 'duplicate' ? 2 : 17
  const history = [
    { role: 'assistant', content: Array.from({ length: count }, (_, i) => ({ type: 'tool_use', name: 'inspect_project', id: kind === 'duplicate' ? 'same' : `i${i}`, input })) },
    { role: 'user', content: Array.from({ length: count }, (_, i) => ({ type: 'tool_result', tool_use_id: kind === 'duplicate' ? 'same' : `i${i}`, content: '{}' })) },
  ]
  await expect(hydrateInspectionImages(prepareChatTools('artist', true, history, false, true)!, 'p')).rejects.toThrow()
  expect(load).not.toHaveBeenCalled()
})
