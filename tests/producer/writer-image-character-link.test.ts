// Writer 채팅에 올린 인물 사진을 인물 카드로 쓰면 "어느 인물의 그림인가요?"를 산문 인물 칩으로 묻고, 고른 인물 카드에 사진을 잇는지 검사한다 (오너 2026-11-11 결정 2)
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
import { answersRestoredImageQuestion } from '@/lib/producer/chip-answer'
import { coerceCardFill } from '@/lib/producer/image-role'
import { imageCardFillDirective } from '@/app/api/produce/chat/preserve-context'
import type { CastMember } from '@/lib/producer-gate'

const MEDIA = 'https://example.supabase.co/storage/v1/object/public/media/ws-1/proj-1/uploads'
const img = (name: string) => ({ id: name, name, thumbUrl: `${MEDIA}/${name}/original.webp`, sliceUrls: [`${MEDIA}/${name}/s000.jpg`] })
const PERSON = img('ref-person.png'), PHOTO = img('char-nonfrontal-photo.png')

// 산문(트리트먼트)이 부른 인물 카드 — 이 시험을 위해 지은 이름이다.
const TEACHER: CastMember = { localId: 'cast-teacher', name: 'The Teacher', entityType: 'person', appearance: 'A stern man in his fifties with grey hair', origin: 'treatment', userEdited: false }
const MINA: CastMember = { localId: 'cast-mina', name: 'Mina', entityType: 'person', appearance: 'A curious student', origin: 'treatment', userEdited: false }
const PLANE: CastMember = { localId: 'cast-plane', name: 'Paper plane', entityType: 'object', appearance: 'A folded paper plane', origin: 'treatment', userEdited: false }
const BLANK: CastMember = { localId: 'cast-blank', name: '', entityType: 'person', appearance: '', origin: 'producer', userEdited: false }

let fetchMock: ReturnType<typeof vi.fn>
let chatReply: Record<string, unknown> = { reply: 'Filled it in.' }
const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => String(u) === url).map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')))
const send = (text: string) => chat.getState().sendMessage(text)
const question = () => chat.getState().suggestion
const chipLabels = () => {
  const action = question()?.action
  return action?.kind === 'choices' ? action.options.map((o) => o.label) : []
}
const modelSaid = () => chat.getState().messages.filter((m) => m.role === 'model').map((m) => m.content)
const card = (localId: string) => producer.getState().cast.find((c) => c.localId === localId)

beforeEach(() => {
  project.getState().resetProject()
  producer.getState().reset()
  chat.getState().reset()
  useChatUiStore.setState({ stylePickerRequest: null })
  // Writer 화면(id producer) — 넘기기 전 산문 초안이 있고, 산문이 부른 인물이 카드로 들어와 있다.
  project.setState({ projectId: 'proj-1', currentStage: 'producer', reachedStage: 'producer', treatmentDraft: true, producerLocked: false, projectLocale: 'en', projectLocaleLocked: true })
  useLocaleStore.setState({ locale: 'en' })
  producer.setState({ cast: [TEACHER, MINA, PLANE, BLANK] })
  chatReply = { reply: 'Filled it in.' }
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/produce/chat') return Response.json(chatReply)
    return Response.json({ ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

async function askedWhichCharacter(): Promise<void> {
  chat.getState().offerImageRoles([PERSON], { typed: '', msg: 'Uploaded ref-person.png' })
  await send('Use it as a character')
}

describe('Writer 채팅에 올린 인물 사진과 산문 인물 잇기', () => {
  it('인물 사진을 인물 카드로 쓰겠다고 하면 산문 인물이 있을 때 "어느 인물의 그림인가요?"를 산문 인물 칩으로 묻는다', async () => {
    // 왜: 점검 R4(2026-11-10) — 올린 사진이 이름 없는 새 카드가 되고 산문의 The Teacher 는 그림 없이 남아 Artist 에 인물이 둘이 됐다(오너 결정 2).
    await askedWhichCharacter()
    expect(question()?.id).toBe(`image-character:${PERSON.id}`)
    expect(question()?.content).toBe('Which character is this picture of? (ref-person.png)')
    expect(question()?.dismissible).toBe(false)
    expect(chipLabels()).toContain('The Teacher')
    expect(chipLabels()).toContain('Mina')
    // 답하기 전에는 카드를 만들거나 채우지 않는다.
    expect(producer.getState().cast).toHaveLength(4)
    expect(calls('/api/produce/chat')).toEqual([])
  })

  it('산문 인물 칩을 고르면 새 카드를 만들지 않고 그 인물 카드에 사진을 붙인다', async () => {
    // 왜: 같은 사람이 Artist 에서 두 장으로 그려지지 않게 한다. 산문 글은 고치지 않는다.
    await askedWhichCharacter()
    await send('This is The Teacher')
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(producer.getState().cast).toHaveLength(4)
    expect(card('cast-teacher')?.sourceImageUrl).toBe(PERSON.thumbUrl)
    expect(calls('/api/produce/chat')[0].cardFill).toEqual({ kind: 'character', ref: 'cast-teacher', appearanceOnly: true })
    expect(calls('/api/produce/chat')[0].attachmentImageUrls).toEqual(PERSON.sliceUrls)
    expect(modelSaid()).toContain('Linked ref-person.png to The Teacher. I will update the appearance from the picture.')
    expect(calls('/api/writer/scene-gate')).toEqual([])
  })

  it('"새 인물"을 고르면 지금처럼 사진으로 새 인물 카드를 만든다', async () => {
    // 왜: 산문에 없는 사람의 사진도 올릴 수 있어야 한다.
    await askedWhichCharacter()
    expect(producer.getState().cast).toHaveLength(4)
    await send('Make a new character card')
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    const cast = producer.getState().cast
    expect(cast).toHaveLength(5)
    expect(cast[4].sourceImageUrl).toBe(PERSON.thumbUrl)
    expect(calls('/api/produce/chat')[0].cardFill).toEqual({ kind: 'character', ref: cast[4].localId })
    expect(card('cast-teacher')?.sourceImageUrl).toBeUndefined()
  })

  it('칩은 이름 있는 사람 카드마다 하나와 "새 인물" 하나다 — 사물과 이름 없는 카드는 칩에 없다', async () => {
    // 왜: 인물 사진을 사물에 붙일 일이 없고, 이름 없는 카드는 칩으로 고를 수 없다(혼자 정한 것).
    await askedWhichCharacter()
    expect(chipLabels()).toEqual(['The Teacher', 'Mina', 'New character'])
  })

  it('시리즈 다음 화에서 앞 화로부터 이어받은 인물은 칩에 넣지 않는다', async () => {
    // 왜: 이어받은 인물에 사진을 이으면 넘길 때 앞 화에서 만든 시트(돈 든 그림)를 이 화에 적지 않고 새로 그리게 된다 — 오너 2026-11-11 "이어받은 인물은 빼 둔다".
    //   그 인물의 사진은 지금처럼 새 인물 카드가 된다.
    producer.setState({ cast: [{ ...TEACHER, inherited: true }, MINA] })
    await askedWhichCharacter()
    expect(chipLabels()).toEqual(['Mina', 'New character'])
  })

  it('산문 인물이 아직 없으면 묻지 않고 지금처럼 새 인물 카드를 만든다', async () => {
    // 왜: 고를 사람이 없다 — 새 프로젝트 시작 화면처럼 산문이 아직 없는 곳도 이 경우다(혼자 정한 것).
    producer.setState({ cast: [PLANE] })
    await askedWhichCharacter()
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(question()?.id ?? '').not.toMatch(/^image-character:/)
    expect(producer.getState().cast).toHaveLength(2)
    expect(producer.getState().cast[1].sourceImageUrl).toBe(PERSON.thumbUrl)
  })

  it('이미 그림이 있는 인물을 고르면 그 그림을 새 사진으로 바꾼다', async () => {
    // 왜: 카드 하나에 그림은 하나다 — 이 인물의 그림이라고 고른 사진이 그 인물의 그림이 된다(혼자 정한 것).
    producer.setState({ cast: [{ ...TEACHER, sourceImageUrl: `${MEDIA}/old/original.webp`, sourceImageAsIs: true }, MINA] })
    await askedWhichCharacter()
    await send('This is The Teacher')
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(card('cast-teacher')?.sourceImageUrl).toBe(PERSON.thumbUrl)
    expect(card('cast-teacher')?.sourceImageAsIs).toBeUndefined()
  })

  it('사진을 붙인 인물 카드는 사진을 보고 외모 글만 다시 채우고 이름 · 역할은 그대로 둔다', async () => {
    // 왜: 외모 글과 사진이 다르면 Artist 가 시트를 그릴 때 둘이 섞인다. 이름 · 역할은 산문이 정한 것이라 사진으로 바꾸지 않는다(혼자 정한 것).
    chatReply = { reply: 'Updated the appearance.', extractedSettings: { characters: [{ name: 'Kim', role: 'mentor', appearance: 'A young man with glasses in a dark suit' }] } }
    await askedWhichCharacter()
    await send('This is The Teacher')
    await vi.waitFor(() => expect(card('cast-teacher')?.appearance).toBe('A young man with glasses in a dark suit'))
    expect(card('cast-teacher')?.name).toBe('The Teacher')
    expect(card('cast-teacher')?.role).toBeUndefined()
    expect(coerceCardFill({ characters: [{ name: 'Kim', role: 'mentor', appearance: 'Glasses' }] }, { kind: 'character', ref: 'cast-teacher', appearanceOnly: true }))
      .toEqual({ characters: [{ ref: 'cast-teacher', appearance: 'Glasses' }] })
    const directive = imageCardFillDirective({ kind: 'character', ref: 'cast-teacher', appearanceOnly: true }) ?? ''
    expect(directive).toContain('appearance only')
    expect(directive).toContain('Keep the existing name')
  })

  it('사진을 이은 카드의 외모 채우기 답에 인물이 여럿이면 고른 카드와 같은 ref 나 이름의 외모를 쓴다', async () => {
    // 왜: 검토 c(2026-11-11) — 모델이 [Mina, The Teacher] 순서로 돌려주면 첫 항목을 써서 The Teacher 외모가 Mina 설명이 됐다(틀린 글이 조용히 저장됨).
    chatReply = { reply: 'Updated the appearance.', extractedSettings: { characters: [{ name: 'Mina', appearance: 'A curious student with a ponytail' }, { name: 'The Teacher', appearance: 'A young man with glasses in a dark suit' }] } }
    await askedWhichCharacter()
    await send('This is The Teacher')
    await vi.waitFor(() => expect(card('cast-teacher')?.appearance).toBe('A young man with glasses in a dark suit'))
    expect(card('cast-mina')?.appearance).toBe('A curious student')
    const fill = { kind: 'character' as const, ref: 'cast-teacher', appearanceOnly: true }
    expect(coerceCardFill({ characters: [{ ref: 'cast-mina', appearance: 'Ponytail' }, { ref: 'cast-teacher', appearance: 'Glasses' }] }, fill, 'The Teacher'))
      .toEqual({ characters: [{ ref: 'cast-teacher', appearance: 'Glasses' }] })
  })

  it('사진을 이은 카드의 외모 채우기 답에 인물이 여럿인데 고른 카드와 맞는 것이 없으면 외모를 바꾸지 않고, 하나뿐이면 그것을 쓴다', () => {
    // 왜: 어느 인물의 외모인지 모르는 글을 고른 카드에 넣으면 틀린 외모가 조용히 남는다 — 하나뿐이면 그 카드를 채우라고 한 답이라 쓴다(혼자 정한 것).
    const fill = { kind: 'character' as const, ref: 'cast-teacher', appearanceOnly: true }
    expect(coerceCardFill({ characters: [{ name: 'Kim', appearance: 'Glasses' }, { name: 'Lee', appearance: 'Ponytail' }] }, fill, 'The Teacher')).toEqual({})
    expect(coerceCardFill({ characters: [{ name: 'Kim', appearance: 'Glasses' }] }, fill, 'The Teacher')).toEqual({ characters: [{ ref: 'cast-teacher', appearance: 'Glasses' }] })
  })

  it('여러 장을 그림마다 정할 때는 인물 카드로 고른 그림마다 바로 이어서 어느 인물인지 묻는다', async () => {
    // 왜: 그림과 질문이 어긋나지 않게 한 장씩 끝낸다(혼자 정한 것).
    chat.getState().offerImageRoles([PERSON, PHOTO], { typed: '', msg: 'Uploaded pictures' })
    await send('I will decide for each picture')
    await send('Use it as a character')
    expect(question()?.content).toBe('Picture 1 of 2: ref-person.png. Which character is this picture of?')
    await send('This is Mina')
    expect(question()?.id).toBe(`image-role:${PHOTO.id}`)
    await send('Use it as a character')
    expect(question()?.content).toBe('Picture 2 of 2: char-nonfrontal-photo.png. Which character is this picture of?')
    await send('This is The Teacher')
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(2))
    expect(calls('/api/produce/chat').map((body) => body.cardFill?.ref)).toEqual(['cast-mina', 'cast-teacher'])
    expect(card('cast-mina')?.sourceImageUrl).toBe(PERSON.thumbUrl)
    expect(card('cast-teacher')?.sourceImageUrl).toBe(PHOTO.thumbUrl)
    expect(producer.getState().cast).toHaveLength(4)
  })

  it('사진과 함께 쓰임을 적어 올려도 산문 인물이 있으면 어느 인물인지 묻는다', async () => {
    // 왜: 쓰임새를 말로 함께 적는 길도 같은 카드 만들기로 간다 — 같은 일이 생기지 않게 같은 질문을 거친다(혼자 정한 것).
    chat.getState().offerImageRoles([PERSON], { typed: 'character', msg: 'character' })
    expect(question()?.id).toBe(`image-character:${PERSON.id}`)
    expect(producer.getState().cast).toHaveLength(4)
    expect(calls('/api/produce/chat')).toEqual([])
  })

  it('칩 대신 글로 답하면 인물 이름 · 칩 말 · "새 인물" 같은 짧은 답만 받고, 문장이면 아무것도 만들지 않고 다시 묻는다', async () => {
    // 왜: Writer 화면 채팅은 칩 말 · 짧은 답만 답으로 받는다(2026-11-10 오너) — 산문 고침 말이 답으로 잡히면 안 된다(혼자 정한 것).
    await askedWhichCharacter()
    await send("It's the teacher")
    expect(calls('/api/produce/chat')).toEqual([])
    expect(producer.getState().cast).toHaveLength(4)
    expect(modelSaid().at(-1)).toBe('Please choose which character this picture is of, or make a new character.')
    expect(question()?.id).toBe(`image-character:${PERSON.id}`)
    await send('the teacher')
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(card('cast-teacher')?.sourceImageUrl).toBe(PERSON.thumbUrl)
  })

  it('새로 고침 뒤 돌아온 "어느 인물의 그림인가요?" 질문에 답하면 그림을 다시 올려 달라고 하는 답으로 본다', () => {
    // 왜: 새로 고침하면 칩만 돌아오고 올린 그림은 빠진다 — 다른 그림 질문처럼 다시 올려 달라고 한다(혼자 정한 것).
    const restored = { id: `image-character:${PERSON.id}`, labels: ['The Teacher', 'Mina', 'New character'] }
    expect(answersRestoredImageQuestion(restored, 'The Teacher')).toBe(true)
    expect(answersRestoredImageQuestion(restored, 'This is Mina')).toBe(true)
    expect(answersRestoredImageQuestion(restored, 'Make a new character card')).toBe(true)
    expect(answersRestoredImageQuestion(restored, 'Make the ending funnier')).toBe(false)
  })

  it('한국어 화면에서는 "어느 인물의 그림인가요?" 질문 · 새 인물 칩 · 붙인 뒤 안내가 한국어로 나온다', async () => {
    // 왜: 문구를 바꾸면 영어 · 한국어를 둘 다 고친다 — 칩의 인물 이름은 산문에 적힌 그대로다(혼자 정한 것).
    project.setState({ projectLocale: 'ko', projectLocaleLocked: true })
    useLocaleStore.setState({ locale: 'ko' })
    chat.getState().offerImageRoles([PERSON], { typed: '', msg: 'ref-person.png' })
    await send('인물로 써 주세요')
    expect(question()?.content).toBe('어느 인물의 그림인가요? (ref-person.png)')
    expect(chipLabels()).toEqual(['The Teacher', 'Mina', '새 인물'])
    await send('The Teacher의 그림이에요')
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(modelSaid()).toContain('The Teacher 카드에 ref-person.png 그림을 붙였어요. 그림을 보고 외모를 다시 채울게요.')
  })
})
