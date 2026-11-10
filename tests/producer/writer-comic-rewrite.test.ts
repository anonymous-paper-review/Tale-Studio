// Writer 화면(산문 확정 전) 채팅에서 만화를 고르면 먼저 산문을 만화로 다시 쓸지 묻고, 다시 쓰면 화면에 보이는 산문과 확정 · 이어 만들기가 쓰는 산문이 같아지는지 검사한다
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
import { sceneStoryView } from '@/lib/producer/scene-story'
import { producerBusyKind } from '@/lib/producer/busy'
import { proseTools } from '@/lib/prose/conditions'
import { proseToolsBusy } from '@/lib/prose/busy'

const MEDIA = 'https://example.supabase.co/storage/v1/object/public/media/ws-1/proj-1/uploads'
const img = (name: string) => ({ id: name, name, thumbUrl: `${MEDIA}/${name}/original.webp`, sliceUrls: [`${MEDIA}/${name}/s000.jpg`] })
const PAGE1 = img('comic_1.webp'), PAGE2 = img('comic_2.webp')
const OLD_IDEA = 'Two kids fight over a kite and make up.'
const OLD_PROSE = 'Mina and Jun pull the kite string at the same time. It snaps.'
const SCRIPT = 'S#1. ROOM - DAY\nMAN: Hi.\nWOMAN: Hey.'

let fetchMock: ReturnType<typeof vi.fn>
let writerStart: () => Response
// 만화 읽기 — 기본은 바로 대본을 준다. 읽는 동안을 보려면 늦춘다.
let comicScript: () => Response | Promise<Response>
const order: string[] = []
// 서버가 받아 새로 쓰기 시작한 초안(실패한 요청은 빼고).
const startedDrafts: Array<Record<string, unknown>> = []
const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => String(u) === url).map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')))
function stub() {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    order.push(url)
    if (url === '/api/produce/comic-script') return comicScript()
    if (url === '/api/produce/anchor-medium') return Response.json({ medium: '2d_anime' })
    if (url === '/api/produce/style-anchor') return Response.json({ key: 'custom_new', imageUrl: body.imageUrl, label: body.label, medium: body.medium, ...(body.lock ? { locked: true } : {}) })
    if (url === '/api/produce/style-facets') return Response.json({ ok: true, facets: true, figure: true })
    if (url === '/api/produce/chat') return Response.json({ reply: 'Filled it in.' })
    if (url === '/api/writer/scene-gate') return Response.json({ proposalId: 'proposal-1' })
    if (url === '/api/writer/start') {
      const res = writerStart()
      if (res.ok) startedDrafts.push(body)
      return res
    }
    return Response.json({ ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
}
const send = (text: string) => chat.getState().sendMessage(text)
const question = () => chat.getState().suggestion
const choiceLabels = () => {
  const s = question()
  return s?.action?.kind === 'choices' ? s.action.options.map((o) => o.label) : []
}
// 화면에 보이는 산문 — Writer 화면(use-prose)과 같은 계산. 지금 초안의 산문은 OLD_PROSE 다.
const screenProse = () => {
  const p = producer.getState()
  const view = sceneStoryView({ preserveScript: p.preserveScript, storyText: p.storyText, locked: true, streamed: [OLD_PROSE], saved: [], run: 'started' })
  return view.kind === 'original' ? view.text : view.kind === 'scenes' ? view.paragraphs.join('\n\n') : ''
}
// 확정 · 이어 만들기가 쓰는 산문 — 확정은 지금 기다리는 초안을 잠그고, 이어 만들기는 그 초안의 바탕으로 나머지를 만든다.
//   지금 값으로 다시 쓰면(restartDraft) 옛 초안을 내려놓고 새 초안을 쓴다(서버 약속: tests/writer/treatment-draft-start.test.ts
//   "지금 값으로 다시 쓰면 기다리던 초안을 내려놓고 새 초안을 쓴다"). 대본 그대로 쓰는 초안은 대본이 곧 산문이다.
const proseUsedByConfirm = () => {
  const restart = startedDrafts.filter((b) => b.restartDraft === true && b.treatmentDraft === true).at(-1)
  return restart ? (restart.preserveScript === true ? restart.story : `(new draft from) ${restart.story}`) : OLD_PROSE
}
// 만화를 고르는 세 길 — 말로 함께 보냄 · 여러 장 한 번에 묻기 · 그림마다 묻기.
const pickComicByWords = () => chat.getState().offerImageRoles([PAGE1], { typed: 'Turn my comic into video as drawn', msg: 'Turn my comic into video as drawn' })
const pickComicForBatch = async () => {
  chat.getState().offerImageRoles([PAGE1, PAGE2], { typed: '', msg: 'Uploaded pictures' })
  await send('Turn my comic pages into video exactly as drawn')
}
const pickComicPerPicture = async () => {
  chat.getState().offerImageRoles([PAGE1], { typed: '', msg: 'Uploaded a picture' })
  await send('Use it as a comic page')
}

const said = (pattern: RegExp) => chat.getState().messages.some((m) => m.role === 'model' && pattern.test(m.content))

beforeEach(() => {
  order.length = 0
  startedDrafts.length = 0
  localStorage.clear()
  project.getState().resetProject()
  producer.getState().reset()
  chat.getState().reset()
  useChatUiStore.setState({ stylePickerRequest: null })
  // Writer 화면(id producer) — 넘기기 전 산문 초안(OLD_IDEA 로 쓴 OLD_PROSE)이 있다.
  project.setState({ projectId: 'proj-1', currentStage: 'producer', reachedStage: 'producer', treatmentDraft: true, producerLocked: false, projectLocale: 'en', projectLocaleLocked: true })
  producer.setState({ storyText: OLD_IDEA, preserveScript: null })
  useLocaleStore.setState({ locale: 'en' })
  writerStart = () => Response.json({ runId: 'run-2' })
  comicScript = () => Response.json({ script: SCRIPT, stats: { scenes: 1, dialogue_lines: 2 } })
  stub()
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('확정 전 Writer 화면에서 만화를 고르면', () => {
  // 왜: 검토 a 심각 1(2026-11-10) — 만화를 고르면 화면은 만화 대본으로 바뀌는데 확정 · 이어 만들기는 옛 산문을 써서, 영상이 화면과 다른 이야기가 됐다.
  //   오너 답: 산문이 사라지는 일이라 바꾸기 전에 먼저 묻는다. 세 길(말 · 여러 장 · 그림마다) 모두 같다.
  it('확정 전 Writer 화면 채팅에서 만화를 그대로 영상화로 고르면 바꾸기 전에 "지금 산문 초안은 사라져요. 만화로 다시 쓸까요?"를 묻고 다시 쓰기 · 참고로만 칩을 띄운다', async () => {
    for (const [path, pick] of [['words', pickComicByWords], ['batch', pickComicForBatch], ['per picture', pickComicPerPicture]] as const) {
      chat.getState().reset()
      await pick()
      expect(question()?.id ?? '', path).toMatch(/^comic-rewrite:/)
      expect(question()?.content, path).toBe('The current prose draft will be gone. Rewrite the prose from the comic?')
      expect(choiceLabels(), path).toEqual(['Rewrite', 'Only as reference'])
      expect(question()?.dismissible, path).toBe(false)
    }
    expect(calls('/api/produce/comic-script')).toEqual([])
    expect(calls('/api/writer/start')).toEqual([])
    expect(producer.getState().storyText).toBe(OLD_IDEA)
    // 한국어 프로젝트에서는 오너가 정한 문장 그대로 묻는다.
    chat.getState().reset()
    project.setState({ projectLocale: 'ko' })
    pickComicByWords()
    expect(question()?.content).toBe('지금 산문 초안은 사라져요. 만화로 다시 쓸까요?')
    expect(choiceLabels()).toEqual(['다시 쓰기', '참고로만'])
  })

  // 왜: 검토 a 심각 1 — 화면만 만화 대본으로 바꾸고 산문 초안은 그대로 두면, 확정이 옛 초안을 잠그고 이어 만들기가 옛 이야기로 영상을 만든다.
  //   오너 답 "만화로 산문을 다시 쓴다": 만화 원고 그대로 산문 초안을 새로 써서 화면 · 확정 · 이어 만들기가 같은 글을 본다.
  it('다시 쓰기를 고르면 만화 원고를 대본으로 옮긴 뒤 그 대본으로 산문 초안을 새로 써서, 화면에 보이는 산문과 확정 · 이어 만들기가 쓰는 산문이 같다', async () => {
    pickComicByWords()
    await send('Rewrite the prose from the comic')
    expect(choiceLabels()).toContain('Fix the comic art style')
    await send('Keep the comic art style and fix it')
    await vi.waitFor(() => expect(calls('/api/writer/start')).toHaveLength(1))
    expect(calls('/api/writer/start')[0]).toMatchObject({ projectId: 'proj-1', story: SCRIPT, treatmentDraft: true, restartDraft: true, preserveScript: true })
    expect(order.indexOf('/api/produce/comic-script')).toBeLessThan(order.indexOf('/api/writer/start'))
    expect(producer.getState()).toMatchObject({ storyText: SCRIPT, preserveScript: true })
    expect(screenProse()).toBe(SCRIPT)
    expect(proseUsedByConfirm()).toBe(screenProse())
    await vi.waitFor(() => expect(said(/Rewriting the prose from the comic/)).toBe(true))
    expect(calls('/api/writer/scene-gate')).toEqual([])
  })

  // 왜: 오너 답 "아니오 → 참고로만" — 산문을 지키고 싶으면 만화는 참고 자료로만 쓴다(그림마다 묻는 질문의 "참고 자료만"과 같이 채팅으로 간다).
  it('참고로만을 고르면 산문 초안을 그대로 두고 만화 그림을 참고 자료로만 채팅에 보낸다', async () => {
    await pickComicForBatch()
    await send('Use the comic only as reference')
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(calls('/api/produce/chat')[0]).toMatchObject({ message: 'Uploaded pictures', attachmentImageUrls: [...PAGE1.sliceUrls, ...PAGE2.sliceUrls] })
    expect(calls('/api/produce/comic-script')).toEqual([])
    expect(calls('/api/writer/start')).toEqual([])
    expect(calls('/api/writer/scene-gate')).toEqual([])
    expect(producer.getState()).toMatchObject({ storyText: OLD_IDEA, preserveScript: null })
    expect(screenProse()).toBe(OLD_PROSE)
  })

  // 왜(혼자 정한 것): 다시 쓰기가 실패했는데 대본을 남기면 화면은 만화 대본, 확정은 옛 산문이라 고치기 전과 같은 어긋남이 다시 생긴다.
  //   넣은 대본을 거둬 화면을 옛 산문으로 두고, 만화를 다시 올리지 않아도 "다시 옮기기"로 다시 할 수 있게 한다.
  it('산문을 다시 쓰지 못하면 넣은 만화 대본을 거둬 화면이 옛 산문 그대로이고, 다시 옮기기를 고르면 다시 옮겨 산문을 새로 쓴다', async () => {
    writerStart = () => Response.json({ error: 'Already running', code: 'writer_run_active' }, { status: 409 })
    pickComicByWords()
    await send('Rewrite the prose from the comic')
    await send('Keep the comic art style and fix it')
    await vi.waitFor(() => expect(said(/Couldn't rewrite the prose from the comic/)).toBe(true))
    expect(producer.getState()).toMatchObject({ storyText: OLD_IDEA, preserveScript: null })
    expect(screenProse()).toBe(OLD_PROSE)
    expect(proseUsedByConfirm()).toBe(OLD_PROSE)
    expect(question()?.id ?? '').toMatch(/^comic-retry:/)
    writerStart = () => Response.json({ runId: 'run-3' })
    await send('Turn the comic into a script again')
    await vi.waitFor(() => expect(calls('/api/writer/start')).toHaveLength(2))
    expect(calls('/api/writer/start')[1]).toMatchObject({ story: SCRIPT, restartDraft: true, preserveScript: true })
    expect(screenProse()).toBe(SCRIPT)
    expect(proseUsedByConfirm()).toBe(screenProse())
  })

  // 왜(혼자 정한 것): 다시 쓰기 질문이 떠 있는 동안 [확정]을 눌렀으면 산문은 이미 잠겼다 — 다시 쓸 수 없으니 오너 답의 "확정 뒤"처럼 참고로만 쓰고 그렇다고 알린다.
  it('다시 쓰기 질문에 답하기 전에 산문을 확정했으면 다시 쓰지 않고 만화를 참고로만 쓴다고 알린다', async () => {
    pickComicByWords()
    project.setState({ producerLocked: true })
    await send('Rewrite the prose from the comic')
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(calls('/api/produce/chat')[0].attachmentImageUrls).toEqual(PAGE1.sliceUrls)
    expect(said(/already confirmed/)).toBe(true)
    expect(calls('/api/produce/comic-script')).toEqual([])
    expect(calls('/api/writer/start')).toEqual([])
  })
})

describe('산문을 확정한 뒤', () => {
  // 왜: 정상 경로 고정 — 오너 답 "확정 뒤(Producer 잠김)는 지금처럼 참고로만". 확정한 산문은 다시 쓸 수 없다.
  it('산문을 확정한 뒤에는 만화를 올려도 산문을 다시 쓰지 않고 참고 자료로만 쓴다', async () => {
    project.setState({ producerLocked: true })
    expect(pickComicByWords()).toBe(false)
    await chat.getState().sendMessage('Turn my comic into video as drawn', { imageUrls: PAGE1.sliceUrls, thumbUrls: [PAGE1.thumbUrl] })
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(calls('/api/produce/chat')[0].attachmentImageUrls).toEqual(PAGE1.sliceUrls)
    expect(question()?.id ?? '').not.toMatch(/^comic-rewrite:/)
    expect(calls('/api/produce/comic-script')).toEqual([])
    expect(calls('/api/writer/start')).toEqual([])
  })
})

describe('만화로 산문을 다시 쓰는 동안과 확정한 산문', () => {
  // Writer 화면 도구(다시 쓰기 · 직접 작성 · 브레이크다운)가 지금 막혔는가 — use-prose 와 같은 규칙으로 본다(산문은 다 쓴 상태).
  const breakdownOpen = () => proseTools({
    preserved: false, locked: false, hasProse: true,
    busy: proseToolsBusy({ busy: null, editing: false, openProposal: false, comicRewrite: producerBusyKind('proj-1', { pending: null, busy: chat.getState().boardBusy }) === 'comic' }),
  }).breakdown

  // 왜: 검토 a 낮음 1(2026-11-10) — 만화를 읽는 30~60초 동안 옛 산문이 그대로 보여 [브레이크다운하기]로 확정할 수 있었다.
  //   대본이 들어온 직후 확정하면 뒤이어 온 다시 쓰기가 확정한 초안을 내려놓을 수 있었다. 다 끝나거나 실패하면 다시 확정할 수 있다.
  it('만화로 산문을 다시 쓰는 동안에는 [브레이크다운하기] · 확정을 막고, 다시 쓰기가 끝나거나 실패하면 다시 푼다', async () => {
    let release: () => void = () => {}
    comicScript = () => new Promise<Response>((resolve) => { release = () => resolve(Response.json({ script: SCRIPT, stats: { scenes: 1, dialogue_lines: 2 } })) })
    expect(breakdownOpen()).toBe(true)
    pickComicByWords()
    await send('Rewrite the prose from the comic')
    await send('Adapt it to another style like live action')
    await vi.waitFor(() => expect(calls('/api/produce/comic-script')).toHaveLength(1))
    expect(breakdownOpen()).toBe(false)
    expect(await chat.getState().confirmProse()).toEqual({ ok: false, code: 'comic_rewrite_running' })
    expect(calls('/api/writer/prose-confirm')).toEqual([])
    release()
    await vi.waitFor(() => expect(chat.getState().boardBusy).toBeNull())
    expect(calls('/api/writer/start')).toHaveLength(1)
    expect(breakdownOpen()).toBe(true)
    expect((await chat.getState().confirmProse()).ok).toBe(true)
    expect(calls('/api/writer/prose-confirm')).toHaveLength(1)

    // 만화 읽기에 실패해도 다시 푼다.
    chat.getState().reset()
    project.setState({ producerLocked: false })
    producer.setState({ storyText: OLD_IDEA, preserveScript: null })
    comicScript = () => Response.json({ error: 'comic_script_failed' }, { status: 502 })
    pickComicByWords()
    await send('Rewrite the prose from the comic')
    await send('Adapt it to another style like live action')
    await vi.waitFor(() => expect(said(/Couldn't turn the comic into a script/)).toBe(true))
    await vi.waitFor(() => expect(chat.getState().boardBusy).toBeNull())
    expect(breakdownOpen()).toBe(true)
    expect((await chat.getState().confirmProse()).ok).toBe(true)
    expect(calls('/api/writer/prose-confirm')).toHaveLength(2)
  })

  // 왜: 검토 a 낮음 1 — 다른 창 등에서 이미 확정했으면 서버가 다시 쓰기를 거절한다(prose_locked). 다시 옮겨도 또 막히니 [다시 옮기기]를 띄우지 않고,
  //   넣은 대본을 거둬 화면이 확정한 산문과 같게 둔다.
  it('산문 다시 쓰기가 확정 잠금에 막히면 다시 옮기기 대신 이미 확정해서 참고로만 쓴다고 알리고 화면은 옛 산문 그대로 둔다', async () => {
    writerStart = () => Response.json({ error: 'The prose is confirmed and locked', code: 'prose_locked' }, { status: 409 })
    pickComicByWords()
    await send('Rewrite the prose from the comic')
    await send('Adapt it to another style like live action')
    await vi.waitFor(() => expect(said(/already confirmed/)).toBe(true))
    expect(said(/Couldn't rewrite the prose from the comic/)).toBe(false)
    expect(question()?.id ?? '').not.toMatch(/^comic-retry:/)
    expect(chat.getState().comicRetry).toBeNull()
    expect(producer.getState()).toMatchObject({ storyText: OLD_IDEA, preserveScript: null })
    expect(screenProse()).toBe(OLD_PROSE)
  })
})
