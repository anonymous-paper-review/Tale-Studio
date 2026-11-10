// Writer 화면 채팅(넘기기 전 산문 초안)에 올린 그림의 쓰임새 답과 그림이 실린 말은 산문 고침으로 빠지지 않고 고른 대로 쓰이며, 그림 없는 말만 산문 고침이 되는지 검사한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }),
  createCatalogClient: vi.fn(),
}))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProducerStore as producer } from '@/stores/producer-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useLocaleStore } from '@/stores/locale-store'

const MEDIA = 'https://example.supabase.co/storage/v1/object/public/media/ws-1/proj-1/uploads'
const img = (name: string) => ({ id: name, name, thumbUrl: `${MEDIA}/${name}/original.webp`, sliceUrls: [`${MEDIA}/${name}/s000.jpg`] })
const PERSON = img('ref-person.png'), ROOM = img('bg-classroom.png'), LOOK = img('ref-style-chibi.png'), PAGE = img('comic_1.webp'), PHOTO = img('char-nonfrontal-photo.png')
const SCRIPT = 'S#1. ROOM - DAY\nMAN: Hi.\nWOMAN: Hey.'

let fetchMock: ReturnType<typeof vi.fn>
const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => String(u) === url).map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')))
function stub() {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    if (url === '/api/produce/comic-script') return Response.json({ script: SCRIPT, stats: { scenes: 1, dialogue_lines: 2 } })
    if (url === '/api/produce/anchor-medium') return Response.json({ medium: '2d_anime' })
    if (url === '/api/produce/style-anchor') return Response.json({ key: 'custom_new', imageUrl: body.imageUrl, label: body.label, medium: body.medium, ...(body.lock ? { locked: true } : {}) })
    if (url === '/api/produce/style-facets') return Response.json({ ok: true, facets: true, figure: true })
    if (url === '/api/produce/chat') return Response.json({ reply: 'Filled it in.' })
    if (url === '/api/writer/scene-gate') return Response.json({ proposalId: 'proposal-1' })
    return Response.json({ ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
}
const send = (text: string) => chat.getState().sendMessage(text)
const lastModel = () => chat.getState().messages.filter((m) => m.role === 'model').at(-1)?.content ?? ''

beforeEach(() => {
  project.getState().resetProject()
  producer.getState().reset()
  chat.getState().reset()
  useChatUiStore.setState({ stylePickerRequest: null })
  // Writer 화면(id producer) — 넘기기 전 산문 초안이 있어 말은 산문 고침 요청으로 간다.
  project.setState({ projectId: 'proj-1', currentStage: 'producer', reachedStage: 'producer', treatmentDraft: true, producerLocked: false, projectLocale: 'en', projectLocaleLocked: true })
  useLocaleStore.setState({ locale: 'en' })
  stub()
})
afterEach(() => { vi.unstubAllGlobals() })

describe('Writer 화면 채팅의 그림 쓰임새', () => {
  // 왜: 점검 C07(2026-11-10) — Writer 화면에서는 말이 모두 산문 고침으로 가서, 쓰임새 단추를 눌러도 "I revised the prose…" 수정안만 오고 카드가 안 생겼다.
  it('Writer 화면 채팅에 올린 그림을 인물 · 배경 카드로 고르면 산문을 고치지 않고 카드를 만들어 그림으로 채운다', async () => {
    chat.getState().offerImageRoles([PERSON, ROOM], { typed: '', msg: 'Uploaded pictures' })
    await send('I will decide for each picture')
    await send('Use it as a character')
    await send('Use it as a background')
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(2))
    expect(calls('/api/produce/chat').map((body) => body.cardFill?.kind)).toEqual(['character', 'background'])
    expect(producer.getState().cast).toHaveLength(1)
    expect(producer.getState().backgrounds).toHaveLength(1)
    expect(calls('/api/writer/scene-gate')).toEqual([])
  })

  // 왜: 점검 C08 — "Art style"을 골라도 산문 수정안으로 빠져 그림체가 등록 · 고정되지 않았다(그림 + 짧은 말 "Use this as the art style"만 됐다).
  it('Writer 화면 채팅에 올린 그림을 그림체로 고르면 산문을 고치지 않고 그 그림으로 그림체를 정해 고정한다', async () => {
    chat.getState().offerImageRoles([LOOK], { typed: '', msg: 'Uploaded a picture' })
    await send('Use it as the art style')
    await vi.waitFor(() => expect(calls('/api/produce/style-anchor')).toHaveLength(1))
    expect(calls('/api/produce/style-anchor')[0]).toMatchObject({ imageUrl: LOOK.thumbUrl, lock: true })
    await vi.waitFor(() => expect(producer.getState().customStyleAnchor?.locked).toBe(true))
    expect(calls('/api/writer/scene-gate')).toEqual([])
  })

  // 왜: 점검 C06 — 만화라고 말로 같이 보내면 쓰임새 질문은 건너뛰지만, 이어진 그림체 질문에 답하면 산문 수정안으로 빠져 원고를 읽지 않았다.
  //   2026-11-10 오너 답(검토 a 심각 1): 확정 전 Writer 화면에서는 그림체보다 먼저 산문을 만화로 다시 쓸지 묻는다 — [다시 쓰기]를 고른 뒤 그림체를 고른다.
  it('Writer 화면 채팅에 만화라고 말하며 원고를 올리고 다시 쓰기와 그림체를 고르면 산문 고침 요청으로 빠지지 않고 원고를 읽어 대본으로 옮긴다', async () => {
    chat.getState().offerImageRoles([PAGE], { typed: 'Turn my comic into video as drawn', msg: 'Turn my comic into video as drawn' })
    await send('Rewrite the prose from the comic')
    expect(chat.getState().comicStyleGate).not.toBeNull()
    await send('Keep the comic art style and fix it')
    await vi.waitFor(() => expect(calls('/api/produce/comic-script')).toHaveLength(1))
    expect(calls('/api/produce/comic-script')[0].pages.map((page: { name: string }) => page.name)).toEqual(['comic_1.webp'])
    await vi.waitFor(() => expect(producer.getState().storyText).toBe(SCRIPT))
    expect(calls('/api/writer/scene-gate')).toEqual([])
  })

  // 왜: 점검 C09 — "Reference only"를 고르면 사진과 그 말이 채팅으로 가서 아이디어가 와야 하는데, 말 없이 산문 수정안만 생겼다.
  it('Writer 화면 채팅에 올린 그림을 참고 자료로 고르면 그림과 함께 쓴 말을 산문 고침이 아니라 채팅으로 보내 답을 받는다', async () => {
    const said = 'Give me three short story ideas based on this photo.'
    chat.getState().offerImageRoles([PHOTO], { typed: said, msg: said })
    await send('Use it as reference only')
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(calls('/api/produce/chat')[0]).toMatchObject({ message: said, attachmentImageUrls: PHOTO.sliceUrls })
    await vi.waitFor(() => expect(lastModel()).toBe('Filled it in.'))
    expect(calls('/api/writer/scene-gate')).toEqual([])
  })

  // 왜: 정상 경로 고정 — 그림 없이 말만 보내면 Writer 채팅은 지금처럼 산문 고침 요청이다.
  it('Writer 화면 채팅에 그림 없이 말만 보내면 지금처럼 산문 고침 요청이 된다', async () => {
    await send('Make the ending happier')
    await vi.waitFor(() => expect(calls('/api/writer/scene-gate')).toHaveLength(1))
    expect(calls('/api/writer/scene-gate')[0]).toMatchObject({ action: 'revise', feedback: 'Make the ending happier' })
    expect(calls('/api/produce/chat')).toEqual([])
  })

  // 왜(혼자 정한 것): 쓰임새 질문은 닫을 수 없는 질문이다 — 답이 아닌 말을 산문 고침으로 보내면 질문이 내려가 올린 그림이 조용히 잊혔다(이번 고장과 같은 꼴).
  //   예전 Producer 채팅과 같이 다시 묻는다.
  it('Writer 화면 채팅에 그림 쓰임새 질문이 떠 있는 동안 답이 아닌 말을 보내면 산문을 고치지 않고 질문을 다시 띄운다', async () => {
    chat.getState().offerImageRoles([PERSON], { typed: '', msg: 'Uploaded a picture' })
    await send('Make the ending happier')
    expect(calls('/api/writer/scene-gate')).toEqual([])
    expect(chat.getState().imageRoleGate).not.toBeNull()
    expect(chat.getState().suggestion?.id).toBe(`image-role:${PERSON.id}`)
    expect(lastModel()).toMatch(/choose first how to use the picture/)
  })

  // 왜(혼자 정한 것): 점검 C05 — 원작 대본을 그대로 쓰는 프로젝트는 산문 고침이 막혀 쓰임새 답이 "This project keeps the original script as is…" 오류로 끝났다.
  //   이 프로젝트에서도 쓰임새는 그대로 받는다(Writer 채팅에서 할 수 있는 일이 그것뿐이다).
  it('대본을 그대로 쓰는 프로젝트의 Writer 화면 채팅에서도 그림 쓰임새 답을 받아 고른 대로 쓴다', async () => {
    producer.getState().setPreserveScript(true)
    chat.getState().offerImageRoles([PERSON], { typed: '', msg: 'Uploaded a picture' })
    await send('Use it as a character')
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(producer.getState().cast).toHaveLength(1)
    expect(calls('/api/writer/scene-gate')).toEqual([])
    expect(chat.getState().error ?? '').not.toMatch(/keeps the original script/)
  })
})
