// 실제 Producer 도구 결과로 대화를 이어가고 저장 전 성공 발화와 최종 응답의 중복 변경을 막는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Draft = { settings: Record<string, unknown>; [key: string]: unknown }
type SavePatch = { producer_draft: Draft }
type ToolBlock = { type: string; [key: string]: unknown }
type ChatReply = { reply?: string; choices?: string[]; extractedSettings?: Record<string, unknown>; toolTurn?: { content: ToolBlock[]; stopReason: string } }
const db = vi.hoisted(() => ({
  save: vi.fn(),
  read: vi.fn(),
  persisted: null as Draft | null,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: (patch: SavePatch) => ({
        eq: (_column: string, projectId: string) => ({
          select: () => ({ single: () => db.save(patch, projectId) }),
        }),
      }),
      select: () => ({
        eq: (_column: string, projectId: string) => ({ maybeSingle: () => db.read(projectId) }),
      }),
    }),
  }),
  createCatalogClient: vi.fn(),
}))
vi.mock('@/lib/chat-persistence', () => ({
  saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn(),
}))

import { useProducerStore as producer } from '@/stores/producer-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { choiceSuggestionMarker } from '@/lib/chat-blocks'
import { createPendingProposal } from '@/lib/pending-proposal'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { saveChatMessage } from '@/lib/chat-persistence'

const projectId = 'p-tool-chat'
const readTurn = (id = 'read-one'): ChatReply => ({ toolTurn: { stopReason: 'tool_use', content: [
  { type: 'text', text: '이미 한국어로 모두 저장했어요.' },
  { type: 'tool_use', id, name: 'read_project', input: { resource: 'settings' } },
] } })
const editTurn = (revision = 'r1', patch: Record<string, unknown> = { dialogueLanguage: 'ko' }, id = 'edit-one'): ChatReply => ({ toolTurn: { stopReason: 'tool_use', content: [
  { type: 'text', text: '이미 한국어로 모두 저장했어요.' },
  { type: 'tool_use', id, name: 'edit_project', input: { resource: 'settings', id: 'settings', revision, patch } },
] } })

function responses(replies: Array<ChatReply | Response | (() => Promise<Response>)>) {
  const requests: Array<Record<string, unknown>> = []
  const remaining = [...replies]
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== '/api/produce/chat') throw new Error(`이 테스트에서 허용하지 않은 요청: ${String(input)}`)
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    const next = remaining.shift()
    if (!next) throw new Error('이 테스트가 준비하지 않은 추가 채팅 요청')
    if (typeof next === 'function') return next()
    return next instanceof Response ? next : Response.json(next)
  }))
  return requests
}

function toolResult(request: Record<string, unknown>, id: string) {
  const messages = request.toolMessages as Array<{ role: string; content: ToolBlock[] }>
  const block = messages.flatMap(message => message.role === 'user' ? message.content : [])
    .find(item => item.type === 'tool_result' && item.tool_use_id === id)
  expect(block).toBeDefined()
  return { block: block!, result: JSON.parse(String(block!.content)) as Record<string, unknown> }
}

beforeEach(() => {
  vi.clearAllMocks()
  chat.getState().reset()
  producer.getState().reset()
  project.getState().resetProject()
  useLocaleStore.setState({ locale: 'ko' })
  project.setState({ projectId, currentStage: 'producer', reachedStage: 'producer', projectLocale: 'ko' })
  producer.setState({ projectSettings: { ...producer.getState().projectSettings, dialogueLanguage: 'ja' } })
  db.persisted = {
    version: 1, savedAt: Date.now(), storyText: '', storyReady: false, cast: [], backgrounds: [],
    settings: structuredClone({ ...producer.getState().projectSettings }),
  }
  db.read.mockImplementation(async () => ({ data: { producer_draft: db.persisted }, error: null }))
  db.save.mockImplementation(async (patch: SavePatch) => {
    db.persisted = structuredClone(patch.producer_draft)
    return { data: patch, error: null }
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('Producer 채팅의 실제 도구 왕복', () => {
  const preparePlanning = () => {
    producer.setState({
      projectSettings: { playtime: 120, genre: 'fantasy', format: 'horizontal_16:9', tone: ['quiet'], dialogueLanguage: '' },
      storyReady: true,
      storyText: '엘프는 오랜 친구를 찾아간다. 늙은 전사는 친구를 맞이한다. 둘은 마지막 밤을 함께 보낸다.',
      styleAnchorKey: 'watercolor',
      cast: [{ localId: 'warrior', name: '늙은 전사', entityType: 'person', appearance: '낡은 갑옷을 입은 노인' }],
      backgrounds: [{ localId: 'cabin', name: '전사의 집', visualDescription: '난롯불이 비추는 작은 통나무집', purpose: '두 친구의 재회' }],
    })
    chat.setState({ messages: [{ id: 'question', stage: 'producer', role: 'model', content: '인물들은 어떤 언어로 말할까요?' }] })
  }

  it('기획 답변을 저장하면 다음 응답은 갱신된 설정과 남은 필수 항목을 보고 이어간다', async () => {
    // 왜: 처음 요청의 체크리스트를 계속 보내면 방금 저장한 언어를 다시 묻게 된다.
    preparePlanning()
    const requests = responses([readTurn(), editTurn(), {
      reply: '전사는 마지막 시간을 어떻게 보내고 싶어 하나요?',
      choices: ['친구와 옛 추억을 나누고 싶어 해', '화해하지 못한 일을 털어놓고 싶어 해'],
    }])
    await chat.getState().sendMessage('대사는 한국어로', undefined, { answeringProducerQuestion: true })
    expect(requests[2]).toMatchObject({ answeringProducerQuestion: true, currentSettings: { dialogueLanguage: 'ko' } })
    const remaining = (requests[2].gate as { hardMissing: string[] }).hardMissing.join(' ')
    expect(remaining).not.toContain('대사 언어')
    expect(remaining).toContain('늙은 전사')
    expect(db.save).toHaveBeenCalledTimes(1)
    expect(chat.getState().suggestion?.action).toMatchObject({ kind: 'choices' })
  })

  it('기획 선택지에 답한 뒤 저장 안내만 나오면 남은 필수 항목을 함께 채울 수 있는 제안을 남긴다', async () => {
    // 왜: 모델이 다음 질문을 빠뜨려도 사용자가 무엇을 해야 하는지 찾느라 대화를 다시 시작하지 않아야 한다.
    preparePlanning()
    const requests = responses([readTurn(), editTurn(), { reply: '대사 언어를 한국어로 저장했어요.' }])
    await chat.getState().sendMessage('대사는 한국어로', undefined, { answeringProducerQuestion: true })
    expect(requests).toHaveLength(3)
    expect(chat.getState().suggestion).toMatchObject({
      stage: 'producer',
      content: expect.stringContaining('늙은 전사'),
      action: { kind: 'message', utterance: expect.stringContaining('늙은 전사') },
    })
    expect(producer.getState().cast[0].arc).toBeUndefined()
    expect(chat.getState().pendingProposal).toBeNull()
    expect(chat.getState().pendingNavigatePath).toBeNull()
  })

  it('별도로 요청한 설정 변경을 마치면 남은 기획 항목이 있어도 새 제안을 강제로 붙이지 않는다', async () => {
    // 왜: 저장 뒤 기획을 이어가는 동작은 사용자가 답하고 있던 기획 질문에만 적용한다.
    preparePlanning()
    responses([readTurn(), editTurn(), { reply: '대사 언어를 한국어로 저장했어요.' }])
    await chat.getState().sendMessage('대사 언어를 한국어로 바꿔줘')
    expect(chat.getState().suggestion).toBeNull()
  })

  it('기획 답변을 저장하려면 승인이 필요한 경우 다른 필수 항목 제안을 함께 띄우지 않는다', async () => {
    // 왜: 저장 승인이 끝나기 전에 다른 질문이 끼어들면 무엇에 답해야 하는지 모호해진다.
    preparePlanning()
    project.setState({ reachedStage: 'writer' })
    producer.setState({ projectSettings: { ...producer.getState().projectSettings, dialogueLanguage: 'ja' } })
    responses([readTurn(), editTurn(), { reply: '변경 승인이 필요해요.' }])
    await chat.getState().sendMessage('대사는 한국어로', undefined, { answeringProducerQuestion: true })
    expect(chat.getState().pendingProposal).not.toBeNull()
    expect(chat.getState().suggestion).toBeNull()
  })

  it('기획의 필수 항목이 모두 채워졌으면 부족한 항목 제안을 만들지 않는다', async () => {
    // 왜: 준비가 끝난 프로젝트는 기존 Writer 초대가 안내하며 또 다른 기획 질문을 붙이지 않아야 한다.
    preparePlanning()
    producer.setState({ cast: [{ ...producer.getState().cast[0], arc: { start_state: '외로움', end_state: '안도', arc_type: '수용' }, motivation: { want: '친구와 마지막 시간을 보내기' } }] })
    responses([readTurn(), editTurn(), { reply: '대사 언어를 한국어로 저장했어요.' }])
    await chat.getState().sendMessage('대사는 한국어로', undefined, { answeringProducerQuestion: true })
    expect(chat.getState().suggestion).toBeNull()
  })

  it('기획 답변 저장 뒤 후속 응답이 실패하면 새 기획 제안으로 실패 안내를 가리지 않는다', async () => {
    // 왜: 저장은 됐어도 다음 답변을 받지 못한 상황을 새 질문이 완료된 것처럼 보이면 안 된다.
    preparePlanning()
    responses([readTurn(), editTurn(), () => Promise.reject(new Error('connection lost'))])
    await chat.getState().sendMessage('대사는 한국어로', undefined, { answeringProducerQuestion: true })
    expect(db.save).toHaveBeenCalledTimes(1)
    expect(chat.getState().suggestion).toBeNull()
    expect(chat.getState().messages.at(-1)?.content).toContain('후속 응답을 받지 못해')
  })

  it('독립적인 설정 변경을 위한 선택지에 답하면 다른 기획 질문을 시작하지 않는다', async () => {
    // 왜: 설정 변경을 위해 언어를 고르는 것은 전체 기획을 계속해 달라는 요청이 아니다.
    preparePlanning()
    const requests = responses([
      { reply: '대사 언어는 어떤 언어로 바꿀까요?', choices: ['한국어로', '일본어로'] },
      { reply: '한국어로 저장했어요.', extractedSettings: { dialogueLanguage: 'ko' } },
    ])
    await chat.getState().sendMessage('대사 언어를 바꿔줘')
    expect(chat.getState().suggestion?.action).toMatchObject({ kind: 'choices' })
    expect(chat.getState().suggestion?.action).not.toHaveProperty('answeringProducerQuestion', true)
    await chat.getState().sendMessage('한국어로')
    expect(requests[1]).not.toHaveProperty('answeringProducerQuestion')
    expect(chat.getState().suggestion).toBeNull()
  })

  it.each(['한국어 대사로', '한국어'])('기획 선택지의 답을 일반 입력창에 %s라고 입력해도 다음 필수 항목으로 이어간다', async (answer) => {
    // 왜: 선택지 버튼과 일반 입력창으로 같은 답을 전달했을 때 다음 안내가 달라지면 안 된다.
    preparePlanning()
    const requests = responses([
      { reply: '대사 언어는 어떤 언어로 할까요?', choices: ['한국어 대사로', '일본어 대사로'] },
      { reply: '한국어로 저장했어요.', extractedSettings: { dialogueLanguage: 'ko' } },
    ])
    await chat.getState().sendMessage('다음에 필요한 것을 같이 정하자')
    expect(chat.getState().suggestion?.action).toMatchObject({ kind: 'choices', answeringProducerQuestion: true })
    await chat.getState().sendMessage(answer)
    expect(requests[1]).toHaveProperty('answeringProducerQuestion', true)
    expect(chat.getState().suggestion?.action).toMatchObject({ kind: 'message' })
  })

  it.each(['영상의 포맷이 뭐야?', '대사 언어를 일본어로 바꿔줘'])('기획 선택지가 떠 있어도 다른 요청인 %s에는 기획 답변 표시를 붙이지 않는다', async (message) => {
    // 왜: 선택지를 무시하고 다른 일을 물은 사용자의 새 요청을 기획 답변으로 바꾸면 안 된다.
    preparePlanning()
    const requests = responses([
      { reply: '대사 언어는 어떤 언어로 할까요?', choices: ['한국어 대사로', '일본어 대사로'] },
      { reply: '요청하신 내용을 확인했어요.' },
    ])
    await chat.getState().sendMessage('다음에 필요한 것을 같이 정하자')
    await chat.getState().sendMessage(message)
    expect(requests[1]).not.toHaveProperty('answeringProducerQuestion')
    expect(chat.getState().suggestion).toBeNull()
  })

  it.each(['전사는 마지막에 무엇을 원하나요?', '전사가 마지막에 원하는 것을 알려주세요.'])('기획 답변 뒤 모델이 %s라고 물었으면 같은 차례에 다른 질문을 덧붙이지 않는다', async (reply) => {
    // 왜: 자연어 질문이 이미 있는데 보충 카드까지 나오면 두 질문에 동시에 답하게 된다.
    preparePlanning()
    responses([readTurn(), editTurn(), { reply }])
    await chat.getState().sendMessage('대사는 한국어로', undefined, { answeringProducerQuestion: true })
    expect(chat.getState().messages.at(-1)?.content).toContain(reply)
    expect(chat.getState().suggestion).toBeNull()
  })

  it.each(['approve', 'cancel'] as const)('언어 변경 승인 중에는 다른 주제의 선택지를 띄우지 않고 처리 뒤에도 되살리지 않는다 (%s)', async (action) => {
    // 왜: 언어 변경 승인 카드와 스타일 선택지가 동시에 떠 채팅 입력까지 잠긴 실제 사례.
    project.setState({ reachedStage: 'artist' })
    const requests = responses([readTurn(), editTurn(), {
      reply: '어떤 스타일로 만들까요?', choices: ['실사 스릴러 느낌으로', '심리 공포 분위기로', '일본 멜로 감성으로'],
    }])
    await chat.getState().sendMessage('언어를 일본어에서 한국어로 바꿔줘')
    expect(toolResult(requests[2], 'edit-one').result.status).toBe('approval_required')
    expect(chat.getState().pendingProposal?.payload.patch).toEqual({ dialogueLanguage: 'ko' })
    expect(db.save).not.toHaveBeenCalled()
    expect(producer.getState().projectSettings.dialogueLanguage).toBe('ja')
    expect(chat.getState().suggestion).toBeNull()
    const id = chat.getState().pendingProposal!.id
    if (action === 'approve') expect(await chat.getState().approvePendingProposal(id)).toBe(true)
    else chat.getState().dismissPendingProposal(id)
    expect(chat.getState().pendingProposal).toBeNull()
    expect(chat.getState().suggestion).toBeNull()
    expect(chat.getState().deferredSuggestions).toEqual([])
    expect(db.persisted?.settings.dialogueLanguage).toBe(action === 'approve' ? 'ko' : 'ja')
  })

  it('기존 JSON 설정 변경도 승인 대기 중에는 다른 주제의 선택지를 표시하지 않는다', async () => {
    // 왜: native 도구 외에 남아 있는 기존 변경 경로도 같은 승인 화면을 사용한다.
    project.setState({ reachedStage: 'writer' })
    responses([{ reply: '스타일을 고르세요.', extractedSettings: { dialogueLanguage: 'ko' }, choices: ['실사로', '수채화로'] }])
    await chat.getState().sendMessage('일본어 대신 한국어로 해줘')
    expect(chat.getState().pendingProposal).not.toBeNull()
    expect(chat.getState().suggestion).toBeNull()
    expect(db.save).not.toHaveBeenCalled()
  })

  it('일반 기획 상담의 선택지는 표시하고 언어를 저장하지 않는다', async () => {
    // 왜: 정상 상담에 필요한 후보 선택까지 차단하면 안 된다.
    responses([{ reply: '어떤 장르가 좋을까요?', choices: ['스릴러로', '드라마로'] }])
    await chat.getState().sendMessage('이 이야기의 장르 후보를 같이 생각해보자')
    expect(chat.getState().suggestion?.action).toMatchObject({ kind: 'choices', options: [{ label: '스릴러로' }, { label: '드라마로' }] })
    expect(db.save).not.toHaveBeenCalled()
  })

  it('언어 편집과 함께 요청한 스타일 이름 변경은 기존 경로로 유지한다', async () => {
    // 왜: 스타일은 native settings 필드 밖이며 최종 JSON 전체를 버리면 복합 요청이 유실된다.
    const applyStyle = vi.spyOn(producer.getState(), 'applyStyleAnchorKeyFromChat').mockResolvedValue('applied')
    responses([readTurn(), editTurn(), { reply: '요청한 변경을 처리했어요.', extractedSettings: { styleAnchorKey: 'watercolor' } }])
    await chat.getState().sendMessage('대사 언어는 한국어로 바꾸고 스타일은 수채화로 바꿔줘')
    expect(db.persisted?.settings.dialogueLanguage).toBe('ko')
    expect(applyStyle).toHaveBeenCalledWith('watercolor')
    applyStyle.mockRestore()
  })

  it('도구로 저장한 설정은 최종 답변에 중복된 변경이 있어도 다시 바꾸지 않는다', async () => {
    // 왜: 도구로 한국어를 저장한 뒤 모델의 옛 JSON이 다시 일본어로 덮어쓰면 안 된다.
    const requests = responses([
      readTurn(), editTurn(),
      { reply: '한국어로 저장된 것을 확인했어요.', extractedSettings: { dialogueLanguage: 'ja' } },
    ])

    await chat.getState().sendMessage('대사 언어를 한국어로 바꿔줘')

    expect(db.save).toHaveBeenCalledTimes(1)
    expect(db.save).toHaveBeenCalledWith(expect.objectContaining({ producer_draft: expect.objectContaining({ settings: expect.objectContaining({ dialogueLanguage: 'ko' }) }) }), projectId)
    expect(db.persisted?.settings.dialogueLanguage).toBe('ko')
    expect(producer.getState().projectSettings.dialogueLanguage).toBe('ko')
    expect(requests).toHaveLength(3)
    expect(requests[0].chatTools).toBe(true)
    expect(toolResult(requests[2], 'edit-one').result).toMatchObject({ status: 'ok', saved: { dialogueLanguage: 'ko' } })
    expect(chat.getState().messages.at(-1)?.content).toContain('한국어')
    expect(chat.getState().messages.at(-1)?.content).toContain('저장')
    expect(saveChatMessage).toHaveBeenCalledWith(projectId, 'producer', 'model', expect.stringContaining('한국어'))
  })

  it('저장 중에는 중간 성공 문구를 보여주지 않고 저장 결과 뒤에 모델 대화를 이어간다', async () => {
    // 왜: tool_use와 함께 온 예정 발화를 먼저 보여주면 DB 결과를 확인하기 전에 성공을 약속하게 된다.
    let finish!: () => void
    db.save.mockImplementation((patch: SavePatch) => new Promise(resolve => {
      finish = () => {
        db.persisted = structuredClone(patch.producer_draft)
        resolve({ data: patch, error: null })
      }
    }))
    const requests = responses([readTurn(), editTurn(), { reply: '한국어로 저장된 것을 확인했어요.' }])
    const sending = chat.getState().sendMessage('대사 언어를 한국어로 바꿔줘')

    await vi.waitFor(() => expect(db.save).toHaveBeenCalledTimes(1))
    expect(chat.getState().loading).toBe(true)
    expect(requests).toHaveLength(2)
    expect(chat.getState().messages.some(message => message.content.includes('이미 한국어로 모두 저장했어요.'))).toBe(false)
    expect(chat.getState().messages.some(message => message.content.includes('한국어로 저장된 것을 확인했어요.'))).toBe(false)
    expect(vi.mocked(saveChatMessage).mock.calls.some(([, , role, content]) => role === 'model' && content.includes('저장했어요'))).toBe(false)

    finish()
    await sending
    expect(requests).toHaveLength(3)
    expect(toolResult(requests[2], 'edit-one').result.status).toBe('ok')
    expect(chat.getState().messages.at(-1)?.content).toContain('한국어로 저장된 것을 확인')
    expect(chat.getState().loading).toBe(false)
  })

  it('저장 실패를 모델에 돌려주고 재조회 후 같은 설정을 다시 저장할 수 있다', async () => {
    // 왜: 저장 실패 뒤 보드 값만 바뀌어 있어도 재시도의 실제 저장을 건너뛰면 안 된다.
    db.save.mockResolvedValueOnce({ data: null, error: { message: 'write rejected' } })
    const requests = responses([
      readTurn(), editTurn(), readTurn('read-retry'), editTurn('r2', { dialogueLanguage: 'ko' }, 'edit-retry'),
      { reply: '다시 시도해 대사 언어가 한국어로 저장된 것을 확인했어요.' },
    ])

    await chat.getState().sendMessage('대사 언어를 한국어로 바꿔줘')

    expect(requests).toHaveLength(5)
    expect(toolResult(requests[2], 'edit-one').result.status).toBe('failed')
    expect(toolResult(requests[2], 'edit-one').block.is_error).toBe(true)
    expect(toolResult(requests[4], 'edit-retry').result.status).toBe('ok')
    expect(db.save).toHaveBeenCalledTimes(2)
    expect(db.persisted?.settings.dialogueLanguage).toBe('ko')
    expect(chat.getState().messages.at(-1)?.content).toContain('다시 시도')
  })

  it('잘못된 도구 입력은 저장하지 않고 오류를 돌려줘 모델이 고친 입력으로 실행하게 한다', async () => {
    // 왜: 모델의 첫 입력이 틀려도 실제 오류를 바탕으로 고칠 수 있어야 하며 잘못된 값은 저장되면 안 된다.
    const requests = responses([
      readTurn(), editTurn('r1', { dialogueLanguage: 'fr' }, 'invalid-edit'),
      editTurn('r1', { dialogueLanguage: 'ko' }, 'corrected-edit'),
      { reply: '입력을 바로잡아 한국어로 저장했어요.' },
    ])

    await chat.getState().sendMessage('대사 언어를 한국어로 바꿔줘')

    expect(requests).toHaveLength(4)
    expect(toolResult(requests[2], 'invalid-edit').result.status).toBe('invalid_input')
    expect(toolResult(requests[2], 'invalid-edit').block.is_error).toBe(true)
    expect(toolResult(requests[3], 'corrected-edit').result.status).toBe('ok')
    expect(db.save).toHaveBeenCalledTimes(1)
    expect(db.persisted?.settings.dialogueLanguage).toBe('ko')
  })

  it('도구 저장 중 프로젝트를 바꾸면 이전 도구 결과로 모델 요청이나 새 대화를 이어가지 않는다', async () => {
    // 왜: 이전 저장이 늦게 끝나도 새 프로젝트의 대화·설정·진행 상태를 덮으면 안 된다.
    let finish!: () => void
    db.save.mockImplementation((patch: SavePatch) => new Promise(resolve => {
      finish = () => {
        db.persisted = structuredClone(patch.producer_draft)
        resolve({ data: patch, error: null })
      }
    }))
    const requests = responses([readTurn(), editTurn(), { reply: '이전 프로젝트를 저장했어요.' }])
    const sending = chat.getState().sendMessage('대사 언어를 한국어로 바꿔줘')
    await vi.waitFor(() => expect(db.save).toHaveBeenCalledTimes(1))

    chat.getState().reset()
    producer.getState().reset()
    project.setState({ projectId: 'p-another', currentStage: 'producer', reachedStage: 'producer' })
    producer.setState({ projectSettings: { ...producer.getState().projectSettings, dialogueLanguage: 'en' } })
    const newMessages = [{ id: 'new-message', stage: 'producer' as const, role: 'user' as const, content: '새 프로젝트 질문' }]
    chat.setState({ loading: true, messages: newMessages })
    finish()
    await sending

    expect(requests).toHaveLength(2)
    expect(db.save).toHaveBeenCalledTimes(1)
    expect(db.save.mock.calls[0][1]).toBe(projectId)
    expect(chat.getState().messages).toEqual(newMessages)
    expect(chat.getState().loading).toBe(true)
    expect(producer.getState().projectSettings.dialogueLanguage).toBe('en')
    expect(vi.mocked(saveChatMessage).mock.calls.some(([id, , role]) => id === 'p-another' && role === 'model')).toBe(false)
  })

  it('도구 요청이 없는 일반 상담은 기존 답변을 그대로 보여주고 저장하지 않는다', async () => {
    // 왜: 공통 루프를 켰다는 이유로 정상 상담에 편집이나 추가 모델 요청을 강제하면 안 된다.
    const requests = responses([{ reply: '주인공은 어떤 성격인가요?' }])
    await chat.getState().sendMessage('주인공 성격을 같이 정해보자')

    expect(requests).toHaveLength(1)
    expect(db.save).not.toHaveBeenCalled()
    expect(db.read).not.toHaveBeenCalled()
    expect(chat.getState().messages.at(-1)?.content).toBe('주인공은 어떤 성격인가요?')
  })

  it('설정 저장 뒤 모델 통신이 실패해도 이미 저장한 결과는 대화에 남긴다', async () => {
    // 왜: 실제 변경은 끝났는데 최종 응답 실패로 기록까지 사라지면 사용자가 같은 변경을 다시 시도한다.
    const requests = responses([
      readTurn(), editTurn(), Response.json({ error: '후속 모델 연결 실패' }, { status: 503 }),
    ])

    await chat.getState().sendMessage('대사 언어를 한국어로 바꿔줘')

    expect(db.save).toHaveBeenCalledTimes(1)
    expect(db.persisted?.settings.dialogueLanguage).toBe('ko')
    expect(requests).toHaveLength(3)
    expect(chat.getState().messages.at(-1)?.content).toContain('중단')
    expect(chat.getState().messages.at(-1)?.content).toContain('저장 확인')
    expect(saveChatMessage).toHaveBeenCalledWith(projectId, 'producer', 'model', expect.stringContaining('저장 확인'))
    expect(chat.getState().loading).toBe(false)
  })

  it('저장 확인 뒤 최종 모델 응답을 중단해도 확인된 저장 결과를 대화에 남긴다', async () => {
    // 왜: Stop은 남은 요청을 멈추지만 이미 확인된 저장을 없던 일처럼 숨기면 안 된다.
    let rejectFinal!: (reason: Error) => void
    const requests = responses([
      readTurn(), editTurn(),
      () => new Promise<Response>((_resolve, reject) => { rejectFinal = reject }),
    ])
    const sending = chat.getState().sendMessage('대사 언어를 한국어로 바꿔줘')
    await vi.waitFor(() => expect(requests).toHaveLength(3))
    expect(db.persisted?.settings.dialogueLanguage).toBe('ko')

    chat.getState().stopGeneration()
    rejectFinal(new DOMException('중단 요청', 'AbortError'))
    await sending

    expect(db.save).toHaveBeenCalledTimes(1)
    expect(requests).toHaveLength(3)
    expect(chat.getState().messages.at(-1)?.content).toContain('중단')
    expect(chat.getState().messages.at(-1)?.content).toContain('저장 확인')
    expect(saveChatMessage).toHaveBeenCalledWith(projectId, 'producer', 'model', expect.stringContaining('저장 확인'))
    expect(chat.getState().loading).toBe(false)
  })
})

// 왜: 예전 DB 선택지 마커가 승인 취소 후 새로고침에서 다시 살아나면 안 된다.
it('승인과 함께 복원된 옛 선택지는 취소 후 새로고침해도 다시 나타나지 않는다', async () => {
  const pendingProposal = createPendingProposal({ id: 'old-approval', projectId, stage: 'producer', kind: 'producerSourcePatch', target: 'Settings', action: '언어 변경', impact: [], payload: { patch: { dialogueLanguage: 'ko' } } })
  const values = new Map<string, string>([[`tale:chat-actions:${projectId}`, JSON.stringify({ pendingProposal, deferredProposals: [], deferredSuggestions: [] })]])
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) })
  const rows = [{ stage: 'producer', role: 'model', content: choiceSuggestionMarker({ id: 'old-style', stage: 'producer', content: '', labels: ['실사', '수채화'] }) }]
  vi.mocked(saveChatMessage).mockImplementation(async (_id, stage, role, content) => { rows.push({ stage, role, content }) })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ messages: [...rows] })))
  await chat.getState().loadMessages(projectId)
  expect(chat.getState().pendingProposal?.id).toBe('old-approval')
  expect(chat.getState().suggestion).toBeNull()
  chat.getState().dismissPendingProposal()
  await chat.getState().loadMessages(projectId)
  expect(chat.getState().suggestion).toBeNull()
})

it('스타일 없이 Writer 이동을 요청하면 생성하지 않고 스타일 선택창에 요청을 전달한다', async () => {
  const handoff = vi.spyOn(producer.getState(), 'saveAndHandoff')
  useChatUiStore.setState({ stylePickerRequest: null })
  const requests = responses([])
  await chat.getState().sendMessage('Writer로 넘겨줘')
  expect(requests).toEqual([])
  expect(handoff).not.toHaveBeenCalled()
  expect(useChatUiStore.getState().stylePickerRequest?.projectId).toBe(projectId)
  handoff.mockRestore()
})

// 왜: 늦게 온 DB 선택지 이력이 이미 취소한 승인의 질문을 다시 꺼내면 안 된다.
it('승인 복원 중 취소해도 뒤늦게 도착한 옛 선택지를 다시 표시하지 않는다', async () => {
  const pendingProposal = createPendingProposal({ id: 'slow-approval', projectId, stage: 'producer', kind: 'producerSourcePatch', target: 'Settings', action: '언어 변경', impact: [], payload: { patch: { dialogueLanguage: 'ko' } } })
  const values = new Map<string, string>([[`tale:chat-actions:${projectId}`, JSON.stringify({ pendingProposal, deferredProposals: [], deferredSuggestions: [] })]])
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) })
  let release!: (r: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { release = resolve })))
  const loading = chat.getState().loadMessages(projectId)
  expect(chat.getState().pendingProposal?.id).toBe('slow-approval')
  chat.getState().dismissPendingProposal()
  release(Response.json({ messages: [{ stage: 'producer', role: 'model', content: choiceSuggestionMarker({ id: 'late-style', stage: 'producer', content: '', labels: ['실사', '수채화'] }) }] }))
  await loading
  expect(chat.getState().pendingProposal).toBeNull()
  expect(chat.getState().suggestion).toBeNull()
})
