// 두 인물을 명시한 새 모습 요청에서 전달되지 않은 작업을 알리고 받은 제안은 보존한다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  llm: vi.fn(), roster: vi.fn(), owns: vi.fn(),
}))
vi.mock('@/lib/llm', () => ({ llmChat: mocks.llm }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: vi.fn(async () => ({ id: 'owner', user_metadata: { locale: 'ko' } })) }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: vi.fn(() => null) }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.owns }))
vi.mock('@/lib/artist/chat-context', () => ({ buildArtistActivityContext: vi.fn(async () => '') }))
vi.mock('@/lib/chat-format', async (original) => ({
  ...await original<typeof import('@/lib/chat-format')>(),
  resolveChatLocale: vi.fn(async () => ({ locale: 'ko', switched: null })),
}))
vi.mock('@/lib/chat-trace-server', () => ({ persistChatTraceBestEffort: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (table: string) => {
  expect(table).toBe('characters')
  return { select: (columns: string) => {
    expect(columns).toBe('character_id,name')
    return { eq: mocks.roster }
  } }
} } }))

import { POST } from '@/app/api/artist/chat/route'

const characters = [
  { character_id: 'kyotaro', name: '쿄타로' },
  { character_id: 'komatsu', name: '코마츠' },
]
const first = { type: 'createAppearance', characterId: 'kyotaro', label: '잠옷', appearance: 'blue pajamas' }
const second = { ...first, characterId: 'komatsu', appearance: 'red pajamas' }
const request = '쿄타로와 코마츠의 잠옷입은 모습도 추가해줘'
const reply = '두 사람 모두 완성했어요.'
function respond(updates: unknown[]) {
  mocks.llm.mockResolvedValue(`${reply}\n\n\`\`\`json\n${JSON.stringify({ updates })}\n\`\`\``)
}
async function chat(message = request) {
  const response = await POST(new Request('http://localhost/api/artist/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: 'project-coverage', message, history: [], uiLocale: 'ko' }),
  }))
  expect(response.status).toBe(200)
  return response.json()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.owns.mockResolvedValue(true)
  mocks.roster.mockResolvedValue({ data: characters, error: null })
  respond([first])
})

describe('새 모습 명령 누락을 실제 Artist 채팅 응답에 남긴다', () => {
  it('두 인물의 새 모습을 명시했는데 한 명의 작업만 받으면 빠진 이름을 마지막에 미처리로 알린다', async () => {
    const data = await chat()
    expect(data.appearanceCreations).toEqual([{ characterId: 'kyotaro', label: '잠옷', appearance: 'blue pajamas' }])
    expect(data.updates).toEqual([])
    expect(data.reply.split('\n\n').at(-1)).toContain('코마츠: 미처리')
    expect(data.reply.split('\n\n').at(-1)).toContain('전체 생성이 완료된 것은 아니에요')
    expect(mocks.llm).toHaveBeenCalledTimes(1)
    expect(mocks.roster).toHaveBeenCalledWith('project_id', 'project-coverage')
  })

  it('두 인물의 작업을 모두 받으면 누락 안내 없이 두 제안을 그대로 전달한다', async () => {
    respond([first, second])
    const data = await chat()
    expect(data.appearanceCreations).toHaveLength(2)
    expect(data.reply).toBe(reply)
  })

  it('두 인물을 명시했지만 새 모습 작업을 하나도 받지 못하면 두 이름을 미처리로 알린다', async () => {
    respond([])
    const data = await chat()
    expect(data.appearanceCreations).toEqual([])
    expect(data.reply).toContain('쿄타로, 코마츠: 미처리')
    expect(mocks.llm).toHaveBeenCalledTimes(1)
  })

  it('둘째 인물의 새 모습 설명을 읽지 못했으면 첫 제안은 남기고 둘째를 미처리로 알린다', async () => {
    respond([first, { type: 'createAppearance', characterId: 'komatsu', label: '잠옷' }])
    const data = await chat()
    expect(data.appearanceCreations).toHaveLength(1)
    expect(data.reply).toContain('코마츠: 미처리')
  })

  it.each([
    '코마츠는 제외하고 쿄타로의 잠옷 모습을 추가해줘',
    '코마츠 말고 쿄타로의 잠옷 모습을 추가해줘',
    '쿄타로와 코마츠의 새 모습을 추가해줄 수 있어?',
    '"쿄타로와 코마츠의 잠옷 모습을 추가해줘"라는 문장을 설명해줘',
    '코마츠처럼 쿄타로의 잠옷 모습을 추가해줘',
    '쿄타로와 코마츠의 모습 중 어느 쪽이 좋아?',
  ])('제외·질문·인용·비교는 두 인물 생성 누락으로 단정하지 않는다: %s', async (message) => {
    const data = await chat(message)
    expect(data.reply).toBe(reply)
    expect(mocks.roster).not.toHaveBeenCalled()
  })

  it('등록 이름의 일부가 겹쳐도 다른 인물을 언급했다고 추측하지 않는다', async () => {
    mocks.roster.mockResolvedValue({ data: [...characters, { character_id: 'koma', name: '코마' }], error: null })
    respond([first, second])
    expect((await chat()).reply).toBe(reply)
  })

  it.each([
    '코마츠는 그대로 두고 쿄타로의 잠옷 모습만 추가해줘',
    '코마츠는 친구야. 쿄타로의 잠옷 모습을 추가해줘',
  ])('다른 문맥에 나온 인물을 함께 요청한 대상처럼 누락 보고하지 않는다: %s', async (message) => {
    expect((await chat(message)).reply).toBe(reply)
  })

  it.each(['반환 오류', '조회 예외'])('등록 인물 대조가 실패하면 받은 제안을 유지하고 누락 확인 불가를 알린다: %s', async (failure) => {
    if (failure === '반환 오류') mocks.roster.mockResolvedValue({ data: null, error: { message: 'read failed' } })
    else mocks.roster.mockRejectedValue(new Error('read failed'))
    const data = await chat()
    expect(data.appearanceCreations).toHaveLength(1)
    expect(data.reply.split('\n\n').at(-1)).toContain('누락 여부를 확인하지 못했어요')
    expect(data.reply).not.toContain('코마츠: 미처리')
    expect(mocks.llm).toHaveBeenCalledTimes(1)
  })

  it('프로젝트 소유권을 확인하지 못하면 등록 인물을 조회하지 않는다', async () => {
    mocks.owns.mockResolvedValue(false)
    await chat()
    expect(mocks.roster).not.toHaveBeenCalled()
  })
})
