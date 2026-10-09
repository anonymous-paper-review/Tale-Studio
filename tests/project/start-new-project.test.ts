// 새 프로젝트를 시작하면 고른 것·아이디어·자료로 Producer를 채우고 트리트먼트를 바로 쓰기 시작한다 (2026-10-02 오너 · 시안 v04)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ writes: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        db.writes.push(patch)
        const done = { error: null, data: { producer_draft: patch.producer_draft ?? null } }
        return { eq: () => Object.assign(Promise.resolve(done), { select: () => ({ single: async () => done }) }) }
      },
    }),
  }),
  createCatalogClient: vi.fn(),
}))

import { beginTreatment, createProjectForNewFlow, ingestCreationFile } from '@/lib/project/start-new-project'
import { usePendingCreationStore } from '@/stores/pending-creation-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useProjectStore } from '@/stores/project-store'
import { useProducerStore } from '@/stores/producer-store'
import { useLocaleStore } from '@/stores/locale-store'
import { resetActionGuard } from '@/lib/action-guard'

let fetchMock: ReturnType<typeof vi.fn>
let ingest: (file: File) => Response
const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => String(u) === url)
const startBody = () => JSON.parse(String((calls('/api/writer/start')[0][1] as RequestInit).body))
// 새 프로젝트 화면이 넘긴 할 일을 Producer 가 이어서 한다(Producer 화면이 열리면 하는 일).
const runPending = async () => {
  const pending = usePendingCreationStore.getState().take('proj-new')
  if (pending) await useGlobalChatStore.getState().runCreationPlan(pending)
}
const urlOrder = () => fetchMock.mock.calls.map(([u]) => String(u))
const SCRIPT = [
  'S#1. 운동장 / 낮', '', '지아', '이번엔 내가 끝까지 간다!', '', '진수', '아니거든.', '', '지아', '내가 먼저였어!', '', '진수', '아니라니까.', '',
  'S#2. 교실 창가 / 낮', '', '수지', '같이 밟으면 되잖아.', '', '지아', '그래, 같이.', '', '수지', '하나, 둘, 셋!',
].join('\n')

beforeEach(() => {
  resetActionGuard()
  db.writes.length = 0
  useLocaleStore.setState({ locale: 'ko' })
  useProjectStore.getState().resetProject()
  useProducerStore.getState().reset()
  usePendingCreationStore.getState().clear()
  useGlobalChatStore.getState().reset()
  ingest = (file) => Response.json({ kind: 'text', name: file.name, text: '이야기 파일 본문' })
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/project/new') return Response.json({ workspaceId: 'ws', projectId: 'proj-new', project: { locale: 'ko', locale_locked: true, settings: null } })
    if (url === '/api/produce/ingest') return ingest((init!.body as FormData).get('file') as File)
    if (url === '/api/writer/start') return Response.json({ projectId: 'proj-new', runId: 'run-1', status: 'started', sceneGate: true, draft: true })
    if (url === '/api/produce/chat') return Response.json({ reply: '카드를 채웠어요.' })
    if (url === '/api/produce/comic-script') return Response.json({ script: SCRIPT, stats: { scenes: 2, dialogue_lines: 7, action_blocks: 0, characters: 3 } })
    if (url === '/api/produce/anchor-medium') return Response.json({ medium: '2d_anime' })
    if (url === '/api/produce/style-anchor') {
      const b = JSON.parse(String(init!.body))
      return b.medium ? Response.json({ key: 'custom_abc', imageUrl: b.imageUrl, label: b.label, medium: b.medium }) : Response.json({ error: 'Unsupported medium' }, { status: 400 })
    }
    if (url === '/api/produce/style-facets') return Response.json({ ok: true, facets: true, figure: true })
    return Response.json({ ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('시작하기', () => {
  it('시작하면 프로젝트를 만들고 아이디어를 이야기로 저장한 뒤 트리트먼트를 바로 쓰기 시작한다', async () => {
    const created = await createProjectForNewFlow({ title: '운동장의 오후' })
    expect(created).toMatchObject({ ok: true, projectId: 'proj-new' })
    const result = await beginTreatment({ projectId: 'proj-new', purposeId: 'short_film', idea: '두 아이가 다투고 화해하는 이야기', files: [] })
    expect(result).toEqual({ started: true })
    expect(startBody()).toMatchObject({
      projectId: 'proj-new', story: '두 아이가 다투고 화해하는 이야기', treatmentDraft: true, writerEngine: 'v1', runtimeSeconds: 300,
      genre: { genre: '드라마', format: 'horizontal_16:9' }, cast: { characters: [] }, backgrounds: { locations: [] },
    })
    expect(useProducerStore.getState()).toMatchObject({ storyText: '두 아이가 다투고 화해하는 이야기', storyReady: true })
    expect(useProducerStore.getState().projectSettings).toMatchObject({ format: 'horizontal_16:9', playtime: 300, genre: '드라마', dialogueLanguage: 'ko', purpose: 'short_film' })
    expect(db.writes.some((w) => w.story_text === '두 아이가 다투고 화해하는 이야기')).toBe(true)
  })

  it('아이디어가 한국어면 계정 언어가 정해져 있지 않아도 장르와 대사 언어와 첫 인사를 한국어로 채운다', async () => {
    // 왜: 2026-10-02 로컬 실측 — 계정 언어가 없는 프로젝트(영어로 시작, 잠기지 않음)에서 한국어 아이디어를 넣었더니
    //   장르 Drama · 대사 언어 English · 영어 인사가 됐다. 트리트먼트는 한국어로 나와 대사만 영어가 될 뻔했다.
    useLocaleStore.setState({ locale: 'en' })
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/project/new') return Response.json({ workspaceId: 'ws', projectId: 'proj-new', project: { locale: 'en', locale_locked: false, settings: null } })
      if (url === '/api/writer/start') return Response.json({ projectId: 'proj-new', runId: 'run-1', status: 'started', sceneGate: true, draft: true })
      return Response.json({ ok: true })
    })
    await createProjectForNewFlow({ title: '운동장' })
    await beginTreatment({ projectId: 'proj-new', purposeId: 'short_film', idea: '두 아이가 다투고 화해하는 이야기', files: [] })
    expect(useProducerStore.getState().projectSettings).toMatchObject({ genre: '드라마', dialogueLanguage: 'ko' })
    const posted = calls('/api/project/proj-new/messages').map(([, init]) => JSON.parse(String((init as RequestInit).body)))
    expect(posted[0].content).toContain('포맷')
    // Writer 가 처음 넘김에서 이야기 언어로 프로젝트 언어를 잠그므로 화면도 같은 언어로 맞춘다(채팅 언어 배지가 English 로 남지 않게).
    expect(useProjectStore.getState()).toMatchObject({ projectLocale: 'ko', projectLocaleLocked: true })
  })

  it('계정 언어로 언어가 정해진 프로젝트는 아이디어 언어와 상관없이 그 언어로 장르 · 대사 언어 · 첫 인사를 채운다', async () => {
    // 왜: 언어가 정해진 프로젝트는 Writer 도 그 언어로 트리트먼트를 쓴다 — 설정과 인사만 아이디어 언어를 따르면 서로 어긋난다(검토 지적).
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/project/new') return Response.json({ workspaceId: 'ws', projectId: 'proj-new', project: { locale: 'en', locale_locked: true, settings: null } })
      if (url === '/api/writer/start') return Response.json({ projectId: 'proj-new', runId: 'run-1', status: 'started', sceneGate: true, draft: true })
      return Response.json({ ok: true })
    })
    await createProjectForNewFlow({ title: '운동장' })
    await beginTreatment({ projectId: 'proj-new', purposeId: 'short_film', idea: '두 아이가 다투고 화해하는 이야기', files: [] })
    expect(useProducerStore.getState().projectSettings).toMatchObject({ genre: 'Drama', dialogueLanguage: 'en' })
    const posted = calls('/api/project/proj-new/messages').map(([, init]) => JSON.parse(String((init as RequestInit).body)))
    expect(posted[0].content).toContain('format')
  })

  it('받을 수 없는 파일은 고르는 즉시 이유를 알려 주고 프로젝트를 만들지 않는다', async () => {
    const { checkCreationFile } = await import('@/lib/project/start-new-project')
    expect(checkCreationFile(new File(['x'], '초안.pdf', { type: 'application/pdf' }))).toBeTruthy()
    expect(checkCreationFile(new File(['x'], '메모.txt', { type: 'text/plain' }))).toBeNull()
    expect(calls('/api/project/new')).toHaveLength(0)
  })

  it('트리트먼트를 쓰기 시작해도 Producer는 잠기지 않고 Producer 단계에 머문다', async () => {
    await createProjectForNewFlow({ title: '운동장의 오후' })
    await beginTreatment({ projectId: 'proj-new', purposeId: 'ad', idea: '여름 음료 광고', files: [] })
    expect(useProjectStore.getState()).toMatchObject({ producerLocked: false, treatmentDraft: true, currentStage: 'producer' })
    expect(db.writes.some((w) => 'current_stage' in w)).toBe(false)
  })

  it('첫 인사로 포맷을 먼저 채웠고 트리트먼트를 쓰는 동안 고쳐도 된다고 남긴다', async () => {
    await createProjectForNewFlow({ title: '운동장의 오후' })
    await beginTreatment({ projectId: 'proj-new', purposeId: 'short_film', idea: '두 아이 이야기', files: [] })
    const posted = calls('/api/project/proj-new/messages').map(([, init]) => JSON.parse(String((init as RequestInit).body)))
    expect(posted[0]).toMatchObject({ stage: 'producer', role: 'model' })
    expect(posted[0].content).toContain('포맷')
  })

  // 2026-10-09 오너 결정 "자료마다 쓰임새를 고른다" — 앞 문장: "올린 글이 대본이면 문장 그대로 보존해 트리트먼트를 쓴다".
  it('"대본 그대로"로 고른 글은 문장 그대로 보존해 트리트먼트를 쓴다', async () => {
    ingest = (file) => Response.json({ kind: 'text', name: file.name, text: SCRIPT })
    await createProjectForNewFlow({ title: '대본' })
    const uploaded = await ingestCreationFile('proj-new', new File([SCRIPT], '대본.txt', { type: 'text/plain' }))
    expect(uploaded).toMatchObject({ kind: 'text', name: '대본.txt' })
    await beginTreatment({ projectId: 'proj-new', format: 'horizontal_16:9', idea: '', files: [{ ...(uploaded as object), use: 'script_keep' } as never] })
    await runPending()
    expect(startBody()).toMatchObject({ preserveScript: true, story: SCRIPT })
    expect(useProducerStore.getState().preserveScript).toBe(true)
  })

  // 2026-10-09 오너 결정 "자료마다 쓰임새를 고른다" — 앞 문장: "대본이 아닌 글은 아이디어와 합쳐 트리트먼트의 바탕이 된다".
  it('"대본 다듬어서 · 아이디어 · 메모"로 고른 글은 아이디어와 합쳐 트리트먼트의 바탕이 된다', async () => {
    await createProjectForNewFlow({ title: '메모' })
    const uploaded = await ingestCreationFile('proj-new', new File(['x'], '메모.txt', { type: 'text/plain' }))
    await beginTreatment({ projectId: 'proj-new', purposeId: 'short_film', idea: '비 오는 편의점', files: [{ ...(uploaded as object), use: 'memo' } as never] })
    expect(startBody().story).toBe('비 오는 편의점\n\n이야기 파일 본문')
    expect(startBody().preserveScript).toBeUndefined()
  })

  // 2026-10-09 오너 결정 "자료마다 쓰임새를 고른다" — 앞 문장: "올린 그림은 Producer 채팅에서 쓰임새를 묻도록 넘긴다".
  it('새 프로젝트에서 고른 그림 쓰임새대로 Producer가 묻지 않고 처리한다', async () => {
    ingest = (file) => Response.json({ kind: 'image', name: file.name, originalUrl: 'https://img.test/a.png', slices: [{ url: 'https://img.test/a-1.jpg' }] })
    await createProjectForNewFlow({ title: '그림' })
    const uploaded = await ingestCreationFile('proj-new', new File(['x'], '지아.png', { type: 'image/png' }))
    await beginTreatment({ projectId: 'proj-new', purposeId: 'short_film', idea: '두 아이 이야기', files: [{ ...(uploaded as object), use: 'character' } as never] })
    const pending = usePendingCreationStore.getState().take('proj-new')
    expect(pending?.cards).toEqual([{ image: { id: expect.any(String), name: '지아.png', thumbUrl: 'https://img.test/a.png', sliceUrls: ['https://img.test/a-1.jpg'] }, role: 'character' }])
    expect(usePendingCreationStore.getState().take('proj-new')).toBeNull()
    await useGlobalChatStore.getState().runCreationPlan(pending!)
    expect(useProducerStore.getState().cast).toHaveLength(1)
    expect(useGlobalChatStore.getState().imageRoleGate).toBeNull()
    expect(useGlobalChatStore.getState().imageBatchGate).toBeNull()
    expect(useGlobalChatStore.getState().suggestion?.action?.kind).not.toBe('choices')
  })

  // 2026-10-09 오너 결정 "자료마다 쓰임새를 고른다" — 앞 문장: "그림만 올리면 트리트먼트를 시작하지 않고 Producer 채팅에서 그림 쓰임새부터 묻는다".
  it('그림만 있고 이야기가 없으면 트리트먼트를 시작하지 않고 고른 쓰임새대로 카드를 만든 뒤 이야기를 묻는다', async () => {
    ingest = (file) => Response.json({ kind: 'image', name: file.name, originalUrl: 'https://img.test/a.png', slices: [] })
    await createProjectForNewFlow({ title: '그림' })
    const uploaded = await ingestCreationFile('proj-new', new File(['x'], '골목.png', { type: 'image/png' }))
    expect(await beginTreatment({ projectId: 'proj-new', purposeId: 'short_film', idea: '', files: [{ ...(uploaded as object), use: 'background' } as never] })).toEqual({ started: false })
    const posted = calls('/api/project/proj-new/messages').map(([, init]) => JSON.parse(String((init as RequestInit).body)))
    expect(posted[0].content).toContain('이야기')
    await runPending()
    expect(useProducerStore.getState().backgrounds).toHaveLength(1)
    expect(calls('/api/writer/start')).toHaveLength(0)
  })
})

describe('Producer에서 이어서 하기', () => {
  const img = (name: string, use: string) => ({ kind: 'image', id: name, name, thumbUrl: `https://img.test/${name}`, sliceUrls: [`https://img.test/${name}-1.jpg`], use })

  it('트리트먼트는 그림으로 만든 인물 · 배경 카드가 다 채워진 뒤에 시작한다', async () => {
    // 왜: 지금은 그림 쓰임새를 묻기도 전에 트리트먼트를 시작해, 그림 속 인물이 트리트먼트에 빠졌다.
    await createProjectForNewFlow({ title: '두 아이' })
    expect(await beginTreatment({ projectId: 'proj-new', purposeId: 'short_film', idea: '두 아이 이야기', files: [img('지아.png', 'character') as never] })).toEqual({ started: false })
    expect(calls('/api/writer/start')).toHaveLength(0)
    await runPending()
    const order = urlOrder()
    expect(order.indexOf('/api/produce/chat')).toBeGreaterThan(-1)
    expect(order.indexOf('/api/produce/chat')).toBeLessThan(order.indexOf('/api/writer/start'))
    expect(startBody().story).toBe('두 아이 이야기')
  })

  it('원작을 그대로 쓰면 채팅이 원작을 읽고 설정 · 인물 · 배경 카드를 채운 뒤 트리트먼트를 시작한다', async () => {
    // 왜: 원작 길에서는 만들 것 카드를 거치지 않아 장르가 비어 있다 — 채팅이 원작을 읽고 채운 뒤에 써야 트리트먼트가 낡지 않는다.
    await createProjectForNewFlow({ title: '대본' })
    expect(await beginTreatment({ projectId: 'proj-new', format: 'horizontal_16:9', idea: '', files: [{ kind: 'text', name: '대본.txt', text: SCRIPT, use: 'script_keep' } as never] })).toEqual({ started: false })
    await runPending()
    const fill = calls('/api/produce/chat').map(([, init]) => JSON.parse(String((init as RequestInit).body)))
    expect(fill[0]).toMatchObject({ preserveScript: true })
    const order = urlOrder()
    expect(order.indexOf('/api/produce/chat')).toBeLessThan(order.indexOf('/api/writer/start'))
  })

  it('원작을 그대로 쓰면 고른 화면 비율로 채우고 길이와 장르는 비워 둔다', async () => {
    // 정상 경로 고정 — 길이는 원작 길이대로, 장르는 채팅이 원작을 읽고 채운다.
    await createProjectForNewFlow({ title: '대본' })
    await beginTreatment({ projectId: 'proj-new', format: 'vertical_9:16', idea: '', files: [{ kind: 'text', name: '대본.txt', text: SCRIPT, use: 'script_keep' } as never] })
    expect(useProducerStore.getState().projectSettings).toMatchObject({ format: 'vertical_9:16', playtime: 0, genre: '' })
  })

  it('만화 원고는 대본으로 옮긴 뒤 트리트먼트를 시작한다', async () => {
    // 왜: 만화는 대본으로 옮기기 전에는 이야기가 없다 — 옮긴 대본을 그대로 쓰기로 트리트먼트에 넘긴다.
    await createProjectForNewFlow({ title: '만화' })
    expect(await beginTreatment({ projectId: 'proj-new', format: 'horizontal_16:9', idea: '', comicStyle: 'lock', files: [img('comic_2.webp', 'comic'), img('comic_1.webp', 'comic')] as never })).toEqual({ started: false })
    await runPending()
    const order = urlOrder()
    expect(order.indexOf('/api/produce/comic-script')).toBeLessThan(order.indexOf('/api/writer/start'))
    expect(startBody()).toMatchObject({ preserveScript: true, story: SCRIPT })
  })

  it('만화 원고의 트리트먼트는 그림체 분석이 끝나기를 기다리지 않는다', async () => {
    // 왜: 10/9 로컬 시험에서 트리트먼트가 대본 옮기기 · 카드 채우기 뒤가 아니라 그림체 분석(약 2분)이 끝난 뒤에야 시작됐다. 트리트먼트는 분석 결과를 쓰지 않는다.
    let releaseFacets!: () => void
    const facetsGate = new Promise<void>((resolve) => { releaseFacets = resolve })
    const base = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/produce/style-facets') {
        await facetsGate
        return Response.json({ ok: true, facets: true, figure: true })
      }
      return base(url, init)
    })
    await createProjectForNewFlow({ title: '만화' })
    await beginTreatment({ projectId: 'proj-new', format: 'horizontal_16:9', idea: '', comicStyle: 'lock', files: [img('comic_1.webp', 'comic')] as never })
    const run = runPending()
    await vi.waitFor(() => expect(calls('/api/writer/start')).toHaveLength(1))
    releaseFacets()
    await run
  })

  it('자료를 올리느라 프로젝트를 먼저 만들었어도 시작할 때의 아이디어 · 자료로 제목을 다시 정한다', async () => {
    // 왜: 자료가 있으면 첫 화면에서 프로젝트를 만든다 — 그 뒤 아이디어를 적거나 파일을 바꾸면 처음 정한 제목이 남는다(10/9 로컬 시험: 지운 파일 이름 "시험대본"이 제목으로 남음).
    await createProjectForNewFlow({ title: '시험대본' })
    await beginTreatment({ projectId: 'proj-new', purposeId: 'short_film', idea: '두 아이 이야기', files: [], title: '두 아이 이야기' })
    const renames = calls('/api/project/proj-new').filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')
    expect(renames.map(([, init]) => JSON.parse(String((init as RequestInit).body)))).toEqual([{ title: '두 아이 이야기' }])
    expect(useProjectStore.getState().projectTitle).toBe('두 아이 이야기')
  })

  it('사용자가 채팅하는 동안에도 새 프로젝트의 숨은 요청은 버려지지 않고, 채팅이 끝나기를 기다렸다가 보낸다', async () => {
    // 왜: 채팅은 한 번에 한 요청만 받는다 — 사용자 말과 겹친 숨은 요청(카드 채우기)이 버려져 장르가 빈 채로 트리트먼트가 시작될 수 있었다(10/9 검토).
    await createProjectForNewFlow({ title: '대본' })
    await beginTreatment({ projectId: 'proj-new', format: 'horizontal_16:9', idea: '', files: [{ kind: 'text', name: '대본.txt', text: SCRIPT, use: 'script_keep' } as never] })
    useGlobalChatStore.setState({ loading: true })
    const run = runPending()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(calls('/api/produce/chat')).toHaveLength(0)
    useGlobalChatStore.setState({ loading: false })
    await run
    expect(calls('/api/produce/chat')).toHaveLength(1)
    expect(calls('/api/writer/start')).toHaveLength(1)
  })

  it('그림 카드나 원작을 먼저 채울 때는 프로젝트 언어를 이야기 언어로 먼저 정해 장르 · 카드도 그 언어로 채운다', async () => {
    // 왜: 언어가 정해지지 않은 프로젝트에서 채팅은 화면 언어를 따른다 — 영어 화면에 한국어 대본이면 장르 · 카드가 영어로 채워진 뒤
    //   트리트먼트가 한국어로 잠긴다(10/9 검토, 10/2 실측과 같은 섞임).
    useLocaleStore.setState({ locale: 'en' })
    const base = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/project/new') return Response.json({ workspaceId: 'ws', projectId: 'proj-new', project: { locale: 'en', locale_locked: false, settings: null } })
      return base(url, init)
    })
    await createProjectForNewFlow({ title: '대본' })
    await beginTreatment({ projectId: 'proj-new', format: 'horizontal_16:9', idea: '', files: [{ kind: 'text', name: '대본.txt', text: SCRIPT, use: 'script_keep' } as never] })
    expect(useProjectStore.getState()).toMatchObject({ projectLocale: 'ko', projectLocaleLocked: true })
    await runPending()
    const all = fetchMock.mock.calls
    const lockAt = all.findIndex(([u, init]) => String(u) === '/api/project/proj-new' && (init as RequestInit | undefined)?.method === 'PATCH' && JSON.parse(String((init as RequestInit).body)).locale === 'ko')
    const chatAt = all.findIndex(([u]) => String(u) === '/api/produce/chat')
    expect(lockAt).toBeGreaterThan(-1)
    expect(lockAt).toBeLessThan(chatAt)
  })

  it('새 프로젝트가 넘긴 일을 하는 동안에는 트리트먼트 쓰기 단추 대신 곧 쓴다는 안내를 보인다', async () => {
    // 왜: 이야기가 있으면 보드에 트리트먼트 쓰기 단추가 보여, 그림 카드를 채우는 동안 누르면 카드 없이 트리트먼트가 시작됐다(10/9 검토).
    await createProjectForNewFlow({ title: '두 아이' })
    await beginTreatment({ projectId: 'proj-new', purposeId: 'short_film', idea: '두 아이 이야기', files: [img('지아.png', 'character') as never] })
    const run = runPending()
    expect(useGlobalChatStore.getState().creationPlanFor).toBe('proj-new')
    await run
    expect(useGlobalChatStore.getState().creationPlanFor).toBeNull()
    expect(readFileSync('src/features/producer/scene-story-section.tsx', 'utf8')).toMatch(/creationPlanFor/)
  })

  it('만화를 대본으로 옮기지 못하면 다시 옮기기를 고를 수 있고, 고르면 같은 쪽을 다시 옮겨 이어서 트리트먼트를 쓴다', async () => {
    // 왜: 옮기기가 실패하면 "잠시 후 다시"라고만 하고, 다시 하려면 만화 전부를 채팅에 다시 올려야 했다(10/9 검토).
    let attempts = 0
    const base = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/produce/comic-script' && ++attempts === 1) return Response.json({ error: 'comic_script_failed' }, { status: 502 })
      return base(url, init)
    })
    await createProjectForNewFlow({ title: '만화' })
    await beginTreatment({ projectId: 'proj-new', format: 'horizontal_16:9', idea: '', comicStyle: 'lock', files: [img('comic_1.webp', 'comic'), img('comic_2.webp', 'comic')] as never })
    await runPending()
    expect(calls('/api/writer/start')).toHaveLength(0)
    const s = useGlobalChatStore.getState().suggestion
    const options = s?.action?.kind === 'choices' ? s.action.options : []
    const retry = options.find((option) => option.label === '다시 옮기기')
    expect(retry).toBeTruthy()
    await useGlobalChatStore.getState().sendMessage(retry!.utterance)
    await vi.waitFor(() => expect(calls('/api/writer/start')).toHaveLength(1))
    const bodies = calls('/api/produce/comic-script').map(([, init]) => JSON.parse(String((init as RequestInit).body)))
    expect(bodies).toHaveLength(2)
    expect(bodies[1].pages).toEqual(bodies[0].pages)
    expect(startBody()).toMatchObject({ preserveScript: true, story: SCRIPT })
  })

  it('새 프로젝트에서 만화 원고의 각색을 고르면 만화 그림을 그림체로 쓰지 않고 스타일 고르기 창을 띄운 뒤 대본을 옮겨 트리트먼트를 쓴다', async () => {
    // 왜: 각색은 만화 그림체를 쓰지 않는다 — 실사 등 만들 스타일은 사용자가 고른다(10/9 오너).
    await createProjectForNewFlow({ title: '만화' })
    await beginTreatment({ projectId: 'proj-new', format: 'horizontal_16:9', idea: '', comicStyle: 'adapt', files: [img('comic_1.webp', 'comic')] as never })
    await runPending()
    expect(calls('/api/produce/anchor-medium')).toHaveLength(0)
    expect(calls('/api/produce/style-anchor')).toHaveLength(0)
    expect(useChatUiStore.getState().stylePickerRequest?.projectId).toBe('proj-new')
    expect(startBody()).toMatchObject({ preserveScript: true, story: SCRIPT })
  })

  it('그대로 쓰는 원작이 있으면 아이디어 칸 글은 내 메모로 채팅에 남는다', async () => {
    // 왜: 메모를 대본에 합치면 메모가 "그대로 쓸 대본"이 된다 — 대신 채팅이 읽고 카드 · 설정에 반영한다.
    await createProjectForNewFlow({ title: '대본' })
    await beginTreatment({ projectId: 'proj-new', format: 'horizontal_16:9', idea: '결말은 꼭 지켜 줘', files: [{ kind: 'text', name: '대본.txt', text: SCRIPT, use: 'script_keep' } as never] })
    expect(useProducerStore.getState().storyText).toBe(SCRIPT)
    await runPending()
    expect(useGlobalChatStore.getState().messages.some((m) => m.role === 'user' && m.content === '결말은 꼭 지켜 줘')).toBe(true)
    const saved = calls('/api/project/proj-new/messages').map(([, init]) => JSON.parse(String((init as RequestInit).body)))
    expect(saved).toContainEqual(expect.objectContaining({ role: 'user', content: '결말은 꼭 지켜 줘' }))
  })

  it('그림체로 고른 그림은 매체를 고르고 그림체로 정한 뒤 그림체 분석기로 분석한다', async () => {
    // 왜: 사용자가 그 그림체를 바탕으로 아이디에이션 · 작품 작업을 할 수 있다(10/9 오너 "분석기 돌려줘").
    await createProjectForNewFlow({ title: '그림체' })
    await beginTreatment({ projectId: 'proj-new', purposeId: 'short_film', idea: '두 아이 이야기', files: [img('look.png', 'style')] as never })
    await runPending()
    const body = (url: string) => calls(url).map(([, init]) => JSON.parse(String((init as RequestInit).body)))
    expect(body('/api/produce/anchor-medium')[0]).toMatchObject({ projectId: 'proj-new', imageUrl: 'https://img.test/look.png', consent: 'creation-choice-v1' })
    expect(body('/api/produce/style-anchor')[0]).toMatchObject({ imageUrl: 'https://img.test/look.png', medium: '2d_anime' })
    expect(body('/api/produce/style-facets')[0]).toMatchObject({ projectId: 'proj-new', consent: 'creation-choice-v1' })
    expect(useProducerStore.getState().styleAnchorKey).toBe('custom_abc')
  })

  it('그림체로 고른 그림이 있으면 만화 첫 쪽 대신 그 그림을 그림체로 쓴다', async () => {
    // 왜: 그림체 그림은 한 장이고, 사용자가 직접 고른 것이 만화 첫 쪽보다 우선이다.
    await createProjectForNewFlow({ title: '만화' })
    await beginTreatment({ projectId: 'proj-new', format: 'horizontal_16:9', idea: '', files: [img('comic_1.webp', 'comic'), img('look.png', 'style')] as never })
    await runPending()
    const anchors = calls('/api/produce/style-anchor').map(([, init]) => JSON.parse(String((init as RequestInit).body)))
    expect(anchors).toHaveLength(1)
    expect(anchors[0].imageUrl).toBe('https://img.test/look.png')
  })
})

describe('자료 올리기 실패', () => {
  it('자료를 올리지 못하면 그 파일의 실패 이유를 알려 준다', async () => {
    ingest = () => Response.json({ error: 'No readable content in 빈.txt.' }, { status: 400 })
    await createProjectForNewFlow({ title: '실패' })
    expect(await ingestCreationFile('proj-new', new File(['   '], '빈.txt', { type: 'text/plain' }))).toEqual({ error: 'No readable content in 빈.txt.' })
  })

  it('받을 수 없는 형식은 올리기 전에 거른다', async () => {
    const result = await ingestCreationFile('proj-new', new File(['x'], '초안.pdf', { type: 'application/pdf' }))
    expect(result).toHaveProperty('error')
    expect(calls('/api/produce/ingest')).toHaveLength(0)
  })

  it('트리트먼트 시작에 실패해도 만든 프로젝트와 아이디어는 남는다', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/project/new') return Response.json({ workspaceId: 'ws', projectId: 'proj-new', project: { locale: 'ko', locale_locked: true } })
      if (url === '/api/writer/start') return Response.json({ error: 'boom' }, { status: 500 })
      return Response.json({ ok: true })
    })
    await createProjectForNewFlow({ title: '실패' })
    expect(await beginTreatment({ projectId: 'proj-new', purposeId: 'short_film', idea: '두 아이 이야기', files: [] })).toEqual({ started: false })
    expect(useProducerStore.getState().storyText).toBe('두 아이 이야기')
    expect(useProjectStore.getState()).toMatchObject({ projectId: 'proj-new', treatmentDraft: false })
  })
})
