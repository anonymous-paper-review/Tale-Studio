// 새 프로젝트를 시작하면 고른 것·아이디어·자료로 Producer를 채우고 트리트먼트를 바로 쓰기 시작한다 (2026-10-02 오너 · 시안 v04)
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
import { useProjectStore } from '@/stores/project-store'
import { useProducerStore } from '@/stores/producer-store'
import { useLocaleStore } from '@/stores/locale-store'
import { resetActionGuard } from '@/lib/action-guard'

let fetchMock: ReturnType<typeof vi.fn>
let ingest: (file: File) => Response
const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => String(u) === url)
const startBody = () => JSON.parse(String((calls('/api/writer/start')[0][1] as RequestInit).body))
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
  ingest = (file) => Response.json({ kind: 'text', name: file.name, text: '이야기 파일 본문' })
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/project/new') return Response.json({ workspaceId: 'ws', projectId: 'proj-new', project: { locale: 'ko', locale_locked: true, settings: null } })
    if (url === '/api/produce/ingest') return ingest((init!.body as FormData).get('file') as File)
    if (url === '/api/writer/start') return Response.json({ projectId: 'proj-new', runId: 'run-1', status: 'started', sceneGate: true, draft: true })
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

  it('올린 글이 대본이면 문장 그대로 보존해 트리트먼트를 쓴다', async () => {
    ingest = (file) => Response.json({ kind: 'text', name: file.name, text: SCRIPT })
    await createProjectForNewFlow({ title: '대본' })
    const uploaded = await ingestCreationFile('proj-new', new File([SCRIPT], '대본.txt', { type: 'text/plain' }))
    expect(uploaded).toMatchObject({ kind: 'text', name: '대본.txt' })
    await beginTreatment({ projectId: 'proj-new', purposeId: 'short_film', idea: '', files: [uploaded as never] })
    expect(startBody()).toMatchObject({ preserveScript: true, story: SCRIPT })
    expect(useProducerStore.getState().preserveScript).toBe(true)
  })

  it('대본이 아닌 글은 아이디어와 합쳐 트리트먼트의 바탕이 된다', async () => {
    await createProjectForNewFlow({ title: '메모' })
    const uploaded = await ingestCreationFile('proj-new', new File(['x'], '메모.txt', { type: 'text/plain' }))
    await beginTreatment({ projectId: 'proj-new', purposeId: 'short_film', idea: '비 오는 편의점', files: [uploaded as never] })
    expect(startBody().story).toBe('비 오는 편의점\n\n이야기 파일 본문')
    expect(startBody().preserveScript).toBeUndefined()
  })

  it('올린 그림은 Producer 채팅에서 쓰임새를 묻도록 넘긴다', async () => {
    ingest = (file) => Response.json({ kind: 'image', name: file.name, originalUrl: 'https://img.test/a.png', slices: [{ url: 'https://img.test/a-1.jpg' }] })
    await createProjectForNewFlow({ title: '그림' })
    const uploaded = await ingestCreationFile('proj-new', new File(['x'], '지아.png', { type: 'image/png' }))
    await beginTreatment({ projectId: 'proj-new', purposeId: 'short_film', idea: '두 아이 이야기', files: [uploaded as never] })
    expect(usePendingCreationStore.getState().take('proj-new')).toEqual([{ id: expect.any(String), name: '지아.png', thumbUrl: 'https://img.test/a.png', sliceUrls: ['https://img.test/a-1.jpg'] }])
    expect(usePendingCreationStore.getState().take('proj-new')).toEqual([])
  })

  it('그림만 올리면 트리트먼트를 시작하지 않고 Producer 채팅에서 그림 쓰임새부터 묻는다', async () => {
    ingest = (file) => Response.json({ kind: 'image', name: file.name, originalUrl: 'https://img.test/a.png', slices: [] })
    await createProjectForNewFlow({ title: '그림' })
    const uploaded = await ingestCreationFile('proj-new', new File(['x'], '지아.png', { type: 'image/png' }))
    expect(await beginTreatment({ projectId: 'proj-new', purposeId: 'short_film', idea: '', files: [uploaded as never] })).toEqual({ started: false })
    expect(calls('/api/writer/start')).toHaveLength(0)
    expect(usePendingCreationStore.getState().take('proj-new')).toHaveLength(1)
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
