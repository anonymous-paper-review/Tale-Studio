// 대사 언어 변경은 실제 저장 결과를 확인한 뒤 안내하고 실패를 완료로 알리지 않는다
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ save: vi.fn(), patch: null as Record<string, unknown> | null }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ update: (patch: Record<string, unknown>) => {
    db.patch = patch
    return { eq: () => ({ select: () => ({ single: () => db.save(patch) }) }) }
  } }) }),
  createCatalogClient: vi.fn(),
}))
vi.mock('@/lib/chat-persistence', () => ({
  saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn(),
}))
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'

beforeEach(() => {
  vi.clearAllMocks()
  useGlobalChatStore.getState().reset()
  useProducerStore.getState().reset()
  useProjectStore.getState().resetProject()
  useLocaleStore.setState({ locale: 'ko' })
  useProjectStore.setState({ projectId: 'p-language', currentStage: 'producer', reachedStage: 'producer', projectLocale: 'ko' })
  useProducerStore.setState({ projectSettings: { ...useProducerStore.getState().projectSettings, dialogueLanguage: 'ja' } })
  db.save.mockImplementation(async (patch) => ({ data: patch, error: null }))
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ reply: '대사 언어를 한국어로 변경했어요.', extractedSettings: { dialogueLanguage: 'ko' } })))
})
afterEach(() => vi.unstubAllGlobals())

describe('대사 언어 변경의 실제 결과', () => {
  it('이미 저장된 대사 언어가 다음 질문 응답에 다시 포함되면 재저장 안내 없이 질문과 선택지를 유지한다', async () => {
    // 왜: 부족한 인물 정보를 묻는 답변 끝에 이미 끝난 언어 저장 안내가 다시 붙어 대화가 끝난 것처럼 보였다.
    useProducerStore.setState({ projectSettings: { ...useProducerStore.getState().projectSettings, dialogueLanguage: 'ko' } })
    const apply = vi.spyOn(useProducerStore.getState(), 'applyExtractedSettings')
    vi.mocked(fetch).mockResolvedValue(Response.json({
      reply: '전사는 엘프가 찾아오기 전 어떤 마음으로 지내다가, 마지막 순간을 어떻게 맞을까요?',
      extractedSettings: { dialogueLanguage: 'ko' },
      choices: ['기다리던 친구를 만나 안심한다', '외로웠다가 함께한 시간을 떠올린다'],
    }))
    await useGlobalChatStore.getState().sendMessage('이제뭐함?')
    const state = useGlobalChatStore.getState()
    expect(state.messages.at(-1)?.content).toContain('마지막 순간을 어떻게 맞을까요?')
    expect(state.messages.at(-1)?.content).not.toContain('대사 언어')
    expect(state.messages.at(-1)?.content).not.toContain('실행 결과')
    expect(state.suggestion?.action).toMatchObject({ kind: 'choices', options: [{ label: '기다리던 친구를 만나 안심한다' }, { label: '외로웠다가 함께한 시간을 떠올린다' }] })
    expect(db.save).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
    apply.mockRestore()
  })
  it('인물 정보를 채우면서 기존 대사 언어가 다시 포함되면 인물만 반영하고 언어 저장 안내를 붙이지 않는다', async () => {
    // 왜: 언어 재저장을 거르면서 같은 응답의 실제 인물 수정까지 잃으면 안 된다.
    useProducerStore.setState({ projectSettings: { ...useProducerStore.getState().projectSettings, dialogueLanguage: 'ko' } })
    vi.mocked(fetch).mockResolvedValue(Response.json({
      reply: '늙은 전사는 친구가 자신을 기억해 주길 바라요.',
      extractedSettings: { dialogueLanguage: 'ko', characters: [{ name: '늙은 전사', entityType: 'person', motivation: { want: '친구가 자신을 기억해 주길 바란다' } }] },
    }))
    await useGlobalChatStore.getState().sendMessage('친구가 기억해주길 바라다가 안심하고 떠난다')
    expect(useProducerStore.getState().cast[0]?.motivation?.want).toBe('친구가 자신을 기억해 주길 바란다')
    expect(useGlobalChatStore.getState().messages.at(-1)?.content).not.toContain('대사 언어')
    expect(useGlobalChatStore.getState().messages.at(-1)?.content).not.toContain('실행 결과')
  })
  it('사용자가 같은 대사 언어로 다시 저장해 달라고 명시하면 저장을 재시도한다', async () => {
    // 왜: 이전 저장 실패 뒤 보드에만 남은 값을 같은 값이라는 이유로 저장하지 않으면 복구할 수 없다.
    useProducerStore.setState({ projectSettings: { ...useProducerStore.getState().projectSettings, dialogueLanguage: 'ko' }, error: '이전 저장 실패' })
    await useGlobalChatStore.getState().sendMessage('대사 언어를 한국어로 바꿔줘')
    expect(db.save).toHaveBeenCalledOnce()
    expect(useGlobalChatStore.getState().messages.at(-1)?.content).toContain('저장')
  })
  it('대사 언어를 한국어로 바꾸면 저장된 설정을 확인한 뒤 완료를 알린다', async () => {
    // 왜: 모델이 변경했다고 말해도 실제 저장이 안 됐으면 재접속 시 일본어로 돌아간다.
    await useGlobalChatStore.getState().sendMessage('대사 언어를 한국어로 바꿔줘')
    expect(db.save).toHaveBeenCalledOnce()
    expect(db.patch).toMatchObject({ producer_draft: { settings: { dialogueLanguage: 'ko' } } })
    expect(useGlobalChatStore.getState().messages.at(-1)?.content).toContain('저장')
    expect(useGlobalChatStore.getState().messages.at(-1)?.content).toContain('한국어')
  })
  it('대사 언어가 아직 저장 중이면 완료 답변을 먼저 보여주지 않는다', async () => {
    // 왜: DB 응답보다 먼저 완료를 표시하던 순서가 성공 여부를 감췄다.
    let finish!: (result: unknown) => void
    db.save.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const sending = useGlobalChatStore.getState().sendMessage('대사 언어를 한국어로 바꿔줘')
    await vi.waitFor(() => expect(db.save).toHaveBeenCalledOnce())
    expect(useGlobalChatStore.getState().loading).toBe(true)
    expect(useGlobalChatStore.getState().messages.filter(m => m.role === 'model')).toHaveLength(0)
    finish({ data: db.patch, error: null })
    await sending
    expect(useGlobalChatStore.getState().loading).toBe(false)
  })
  it('대사 언어 저장이 실패하면 완료라고 하지 않고 다시 저장할 수 있게 알린다', async () => {
    // 왜: 네트워크·권한·DB 오류에서 모델의 성공 발화를 그대로 표시하면 안 된다.
    db.save.mockResolvedValue({ data: null, error: { message: 'write rejected' } })
    await useGlobalChatStore.getState().sendMessage('대사 언어를 한국어로 바꿔줘')
    const reply = useGlobalChatStore.getState().messages.at(-1)?.content
    expect(reply).toContain('저장하지 못')
    expect(reply).not.toContain('변경했어요')
    expect(useProducerStore.getState().error).toBeTruthy()
  })
  it('승인이 필요한 대사 언어 변경은 승인 전 저장하거나 완료로 알리지 않는다', async () => {
    // 왜: 이미 Writer를 실행한 원천 변경의 기존 승인 약속을 유지한다.
    useProjectStore.setState({ reachedStage: 'writer' })
    await useGlobalChatStore.getState().sendMessage('대사 언어를 한국어로 바꿔줘')
    expect(db.save).not.toHaveBeenCalled()
    expect(useProducerStore.getState().projectSettings.dialogueLanguage).toBe('ja')
    expect(useGlobalChatStore.getState().messages.at(-1)?.content).toContain('승인')
    await useGlobalChatStore.getState().approvePendingProposal()
    expect(db.save).toHaveBeenCalledOnce()
    expect(useProducerStore.getState().projectSettings.dialogueLanguage).toBe('ko')
    expect(useGlobalChatStore.getState().messages.at(-1)?.content).toContain('저장')
  })
  it('저장 응답에 요청한 대사 언어가 없으면 저장 성공으로 처리하지 않는다', async () => {
    // 왜: 쓰기 대상 불일치나 빈 반환을 실제 저장 성공으로 오인하면 안 된다.
    db.save.mockResolvedValue({ data: { producer_draft: { settings: { dialogueLanguage: 'ja' } } }, error: null })
    await useGlobalChatStore.getState().sendMessage('대사 언어를 한국어로 바꿔줘')
    expect(useGlobalChatStore.getState().messages.at(-1)?.content).toContain('저장하지 못')
  })
  it.each(['ja', 'ko'])('대사 언어가 %s인 일반 제작 대화에서는 저장 안내와 함께 이야기와 질문을 유지한다', async (language) => {
    // 왜: 이야기·인물 응답에도 언어 설정이 포함되므로 저장 확인이 본문을 지우면 안 된다.
    useProducerStore.setState({ projectSettings: { ...useProducerStore.getState().projectSettings, dialogueLanguage: language } })
    vi.mocked(fetch).mockResolvedValue(Response.json({ reply: '방과 후 축제를 준비하는 이야기예요. 주인공은 어떤 성격인가요?', extractedSettings: { dialogueLanguage: 'ko', tone: 'warm' } }))
    await useGlobalChatStore.getState().sendMessage('이야기를 정리하고 다음에 필요한 걸 알려줘')
    const reply = useGlobalChatStore.getState().messages.at(-1)?.content
    expect(reply).toContain('방과 후 축제를 준비하는 이야기')
    expect(reply).toContain('주인공은 어떤 성격인가요?')
    expect(reply).toContain('저장')
  })
  it.each(['직접 변경', '승인 후 변경'])('대사 언어 %s 저장 중 프로젝트를 바꾸면 이전 답변을 새 대화에 붙이지 않는다', async (path) => {
    // 왜: 이전 프로젝트의 늦은 저장 응답이 새 프로젝트의 성공·실패 안내로 표시되면 안 된다.
    if (path === '승인 후 변경') {
      useProjectStore.setState({ reachedStage: 'writer' })
      await useGlobalChatStore.getState().sendMessage('대사 언어를 한국어로 바꿔줘')
    }
    let finish!: (result: unknown) => void
    db.save.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const sending = useGlobalChatStore.getState().sendMessage(path === '승인 후 변경' ? '승인' : '대사 언어를 한국어로 바꿔줘')
    await vi.waitFor(() => expect(db.save).toHaveBeenCalledOnce())
    const oldPatch = db.patch
    useGlobalChatStore.getState().reset()
    useProjectStore.setState({ projectId: 'another-project' })
    useGlobalChatStore.setState({ loading: true, messages: [{ id: 'new-message', stage: 'producer', role: 'user', content: '새 프로젝트 질문' }] })
    finish({ data: oldPatch, error: null })
    await sending
    expect(useGlobalChatStore.getState().messages).toEqual([{ id: 'new-message', stage: 'producer', role: 'user', content: '새 프로젝트 질문' }])
    expect(useGlobalChatStore.getState().loading).toBe(true)
  })

})
