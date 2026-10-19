// Producer 시작 화면 서버: 초안 읽기 · 고치기 · 파일 올리기 · AI 추천 · 시작을 프로젝트 주인만 하고, 시작한 뒤에는 고치지 않는다 (리뉴얼 1차 2026-10-19)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

type Row = Record<string, unknown>

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  owns: vi.fn(),
  rows: new Map<string, Record<string, unknown>>(),
  updates: [] as Array<{ table: string; patch: Record<string, unknown> }>,
  mediaUpload: vi.fn(),
  decodeImage: vi.fn(),
  sliceForVision: vi.fn(),
  ocr: vi.fn(),
  recommend: vi.fn(),
  runStatus: vi.fn(),
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.owns }))
vi.mock('@/lib/storage/media', () => ({
  mediaUpload: mocks.mediaUpload,
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
}))
vi.mock('@/lib/upload/image', () => ({ decodeImage: mocks.decodeImage, sliceForVision: mocks.sliceForVision }))
vi.mock('@/lib/entry/recommend-llm', () => ({ ocrImageText: mocks.ocr, recommendWithLlm: mocks.recommend }))
vi.mock('@/lib/writer/run-store', () => ({ getRunStatusLight: mocks.runStatus }))

// supabaseAdmin 흉내 — projects 표 하나를 메모리에 둔다. select · update 와 eq · in 거르기만 쓴다.
vi.mock('@/lib/supabase/admin', () => {
  function query(table: string, kind: 'select' | 'update', patch?: Record<string, unknown>) {
    const filters: Array<(row: Record<string, unknown>) => boolean> = []
    let returning = false
    const run = () => {
      const matched = [...mocks.rows.values()].filter((row) => filters.every((f) => f(row)))
      if (kind === 'update') {
        mocks.updates.push({ table, patch: patch! })
        for (const row of matched) Object.assign(row, JSON.parse(JSON.stringify(patch)))
        return { data: returning ? matched.map((r) => ({ id: r.id })) : null, error: null }
      }
      return { data: matched.map((r) => JSON.parse(JSON.stringify(r))), error: null }
    }
    const q = {
      eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return q },
      in(col: string, vals: unknown[]) { filters.push((r) => vals.includes(r[col])); return q },
      select() { returning = true; return q },
      maybeSingle() { const res = run(); return Promise.resolve({ data: (res.data as unknown[] | null)?.[0] ?? null, error: null }) },
      single() { const res = run(); return Promise.resolve({ data: (res.data as unknown[] | null)?.[0] ?? null, error: null }) },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) { return Promise.resolve(run()).then(resolve, reject) },
    }
    return q
  }
  return {
    supabaseAdmin: {
      from: (table: string) => ({
        select: () => query(table, 'select'),
        update: (patch: Record<string, unknown>) => query(table, 'update', patch),
      }),
    },
  }
})

import { GET as getEntry, PATCH as patchEntry } from '@/app/api/produce/entry/route'
import { POST as uploadEntryFile } from '@/app/api/produce/entry/file/route'
import { POST as recommendEntry } from '@/app/api/produce/entry/recommend/route'
import { POST as startEntry } from '@/app/api/produce/entry/start/route'

const PID = 'project-1'
// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const IDEA = '회사 복도 자판기가 고장 나서 캔이 우르르 쏟아지는 코미디. 주인공 민호는 하나도 못 먹는다.'

function seed(over: Row = {}): Row {
  const row: Row = {
    id: PID,
    workspace_id: 'ws1',
    title: 'Untitled',
    locale: 'ko',
    current_stage: 'entry',
    entry_draft: null,
    settings: null,
    story_text: null,
    producer_draft: null,
    ...over,
  }
  mocks.rows.set(PID, row)
  return row
}
const project = () => mocks.rows.get(PID) as Row
const draftOf = () => project().entry_draft as Record<string, any>

function jsonRequest(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
function fileRequest(file: File) {
  const form = new FormData()
  form.set('projectId', PID)
  form.set('file', file)
  return new NextRequest('http://localhost/api/produce/entry/file', { method: 'POST', body: form })
}
const readyDraft = (over: Row = {}) => ({
  version: 1,
  idea: IDEA,
  file: null,
  rec: null,
  picks: { mood: 'comedy', runtime: 'r60', level: 'polish', ratio: '9:16' },
  chat: { answered: {}, pre: {} },
  startedAt: null,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rows.clear()
  mocks.updates.length = 0
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.owns.mockResolvedValue(true)
  mocks.mediaUpload.mockResolvedValue({ data: {}, error: null })
  mocks.runStatus.mockResolvedValue(null)
  seed()
})

describe('초안 읽기 · 고치기', () => {
  it('프로젝트 주인은 시작 화면 초안 · 제목 · 시작 시각 · 언어 · 단계를 읽는다', async () => {
    // 왜: 두 탭(화면에서 고르기 · 채팅으로 만들기)이 같은 초안을 읽어야 한쪽에서 쓴 값이 다른 쪽에 보인다.
    seed({ entry_draft: readyDraft(), title: '자판기의 반란' })
    const res = await getEntry(jsonRequest('GET', `/api/produce/entry?projectId=${PID}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ title: '자판기의 반란', startedAt: null, locale: 'ko', stage: 'entry' })
    expect(body.draft).toMatchObject({ idea: IDEA, picks: { mood: 'comedy', runtime: 'r60', level: 'polish', ratio: '9:16' } })
  })

  it('프로젝트 주인이 아니면 초안을 읽지도 고치지도 못한다', async () => {
    // 왜: 초안에는 사용자가 올린 대본 글이 들어 있다.
    mocks.owns.mockResolvedValue(false)
    expect((await getEntry(jsonRequest('GET', `/api/produce/entry?projectId=${PID}`))).status).toBe(403)
    expect((await patchEntry(jsonRequest('PATCH', '/api/produce/entry', { projectId: PID, patch: { idea: IDEA } }))).status).toBe(403)
    mocks.getUser.mockResolvedValue(null)
    expect((await getEntry(jsonRequest('GET', `/api/produce/entry?projectId=${PID}`))).status).toBe(401)
  })

  it('글 · 고른 값 · 채팅 진행을 초안에 합쳐 저장하고 정해진 값 밖의 값은 버린다', async () => {
    // 왜: 한쪽 탭에서 쓴 글과 고른 값이 다른 쪽에 그대로 보이려면 같은 칸에 저장해야 한다. 이상한 값은 시작을 망친다.
    const res = await patchEntry(jsonRequest('PATCH', '/api/produce/entry', {
      projectId: PID,
      patch: { idea: IDEA, picks: { mood: 'comedy', runtime: 'r9999' }, chat: { answered: { mood: true, bogus: true } } },
    }))
    expect(res.status).toBe(200)
    expect(draftOf()).toMatchObject({ idea: IDEA, picks: { mood: 'comedy', runtime: null }, chat: { answered: { mood: true } } })
    expect(draftOf().chat.answered).not.toHaveProperty('bogus')
    // 다음 고침은 앞의 값을 지우지 않는다.
    await patchEntry(jsonRequest('PATCH', '/api/produce/entry', { projectId: PID, patch: { picks: { ratio: '16:9' } } }))
    expect(draftOf()).toMatchObject({ idea: IDEA, picks: { mood: 'comedy', ratio: '16:9' } })
  })

  it('이미 시작한 프로젝트의 초안은 고치지 않는다', async () => {
    // 왜: 시작하면 화면 비율이 잠기고 Producer 는 완료 화면이다. 뒤늦은 저장이 잠긴 값을 바꾸면 안 된다.
    seed({ entry_draft: readyDraft({ startedAt: '2026-10-19T00:00:00.000Z' }), current_stage: 'producer' })
    const res = await patchEntry(jsonRequest('PATCH', '/api/produce/entry', { projectId: PID, patch: { picks: { ratio: '16:9' } } }))
    expect(res.status).toBe(409)
    expect(draftOf().picks.ratio).toBe('9:16')
  })

  it('데모(공유) 세션에서는 초안을 고칠 수 없다', async () => {
    // 왜: 공유 링크로 보는 사람은 읽기만 한다.
    const res = await patchEntry(jsonRequest('PATCH', '/api/produce/entry', { projectId: PID, patch: { idea: IDEA } }, { cookie: 'demo_share=abc' }))
    expect(res.status).toBe(403)
    expect(mocks.updates).toEqual([])
  })
})

describe('파일 올리기', () => {
  it('받을 수 없는 확장자는 저장하지 않고 안내 코드로 거절한다', async () => {
    // 왜: 영상 · 압축 파일은 읽을 수 없다. 화면은 이 코드로 "이 파일은 올릴 수 없어요" 를 보여준다.
    const res = await uploadEntryFile(fileRequest(new File([new Uint8Array([1, 2, 3])], '예고편.mp4')))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'bad_ext' })
    expect(mocks.updates).toEqual([])
  })

  it('10MB 넘는 파일은 거절한다', async () => {
    // 왜: 화면 검사를 건너뛴 요청도 서버가 같은 상한으로 막는다.
    const res = await uploadEntryFile(fileRequest(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf')))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'too_large' })
  })

  it('글 파일은 글을 꺼내 초안의 파일로 저장하고 이전 파일은 바뀐다', async () => {
    // 왜: 파일은 하나만 둔다. 새로 올리면 앞의 파일과 그 추천은 더 쓰지 않는다.
    seed({ entry_draft: readyDraft({ file: { name: 'old.txt', ext: 'txt', kind: 'text', size: 3, chars: 3, text: '예전', uploadedAt: '2026-10-18T00:00:00.000Z' } }) })
    const res = await uploadEntryFile(fileRequest(new File(['민호: 또 안 나와?\n팀장: 고마워.'], '대본.txt', { type: 'text/plain' })))
    expect(res.status).toBe(200)
    const file = draftOf().file
    expect(file).toMatchObject({ name: '대본.txt', ext: 'txt', kind: 'text', text: '민호: 또 안 나와?\n팀장: 고마워.', chars: 20 })
    expect(file.noText).toBeUndefined()
    expect(draftOf().idea).toBe(IDEA)
  })

  it('글이 없는 글 파일은 글 없음으로 표시해 저장한다', async () => {
    // 왜: 화면은 이 표시를 보고 "다른 파일 올리기 / 파일 빼고 진행"을 고르게 한다.
    const res = await uploadEntryFile(fileRequest(new File(['   \n  '], 'blank.txt', { type: 'text/plain' })))
    expect(res.status).toBe(200)
    expect(draftOf().file).toMatchObject({ name: 'blank.txt', noText: true, chars: 0 })
  })

  it('이미지는 예전 첨부와 같은 저장소 경로에 원본과 읽기용 조각을 올리고 경로를 초안에 둔다', async () => {
    // 왜: 글자 읽기(OCR)는 추천할 때 한다. 원본은 다시 읽을 수 있게 남긴다.
    mocks.decodeImage.mockResolvedValue({ ok: true, image: { width: 800, height: 600, extension: 'png' } })
    mocks.sliceForVision.mockResolvedValue({ slices: [{ buffer: Buffer.from('jpg'), width: 800, height: 600, index: 0 }], truncated: false })
    const res = await uploadEntryFile(fileRequest(new File([new Uint8Array([137, 80, 78, 71])], '대본_사진.png', { type: 'image/png' })))
    expect(res.status).toBe(200)
    const paths = mocks.mediaUpload.mock.calls.map((c) => c[0] as string)
    expect(paths[0]).toMatch(/^ws1\/project-1\/uploads\/v1-[0-9a-f]{64}\/original\.png$/)
    expect(paths[1]).toMatch(/\/s000\.jpg$/)
    expect(draftOf().file).toMatchObject({ name: '대본_사진.png', kind: 'image', storagePath: paths[0], slicePaths: [paths[1]] })
  })
})

describe('AI 추천', () => {
  it('글이 20자 미만이고 파일도 없으면 추천하지 않는다', async () => {
    // 왜: 화면 검사를 건너뛴 요청에 AI 비용을 쓰지 않는다.
    seed({ entry_draft: readyDraft({ idea: '짧은 글' }) })
    const res = await recommendEntry(jsonRequest('POST', '/api/produce/entry/recommend', { projectId: PID }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'too_short' })
    expect(mocks.recommend).not.toHaveBeenCalled()
  })

  it('추천을 만들면 초안에 추천과 이유를 저장하고 고른 값을 추천으로 채운다(화면 비율은 9:16 추천)', async () => {
    // 왜: 설정 화면과 채팅 카드는 AI가 골라 둔 값으로 시작한다. 맞으면 그대로 진행한다.
    seed({ entry_draft: readyDraft({ picks: { mood: null, runtime: null, level: null, ratio: null }, chat: { answered: { mood: true }, pre: {} } }) })
    mocks.recommend.mockResolvedValue({ kind: '1-3', mood: 'comedy', moodWhy: '엉뚱한 사건이라 코미디로 읽었어요', runtime: 'r60', runtimeWhy: '짧은 아이디어라 짧게 잡았어요', level: 'grow', title: '자판기의 반란' })
    const res = await recommendEntry(jsonRequest('POST', '/api/produce/entry/recommend', { projectId: PID }))
    expect(res.status).toBe(200)
    expect(draftOf().rec).toMatchObject({ mood: 'comedy', moodWhy: '엉뚱한 사건이라 코미디로 읽었어요', runtime: 'r60', level: 'grow', title: '자판기의 반란', source: 'llm' })
    expect(draftOf().picks).toEqual({ mood: 'comedy', runtime: 'r60', level: 'grow', ratio: '9:16' })
    // 새 추천이면 채팅 진행은 처음부터.
    expect(draftOf().chat).toEqual({ answered: {}, pre: {} })
    expect((await res.json()).draft.rec.basis).toBeTruthy()
  })

  it('모델이 실패해도 규칙으로 고른 추천으로 답한다', async () => {
    // 왜: 모델이 느리거나 죽어도 사용자는 설정 화면으로 넘어가야 한다.
    seed({ entry_draft: readyDraft({ picks: { mood: null, runtime: null, level: null, ratio: null } }) })
    mocks.recommend.mockRejectedValue(new Error('model down'))
    const res = await recommendEntry(jsonRequest('POST', '/api/produce/entry/recommend', { projectId: PID }))
    expect(res.status).toBe(200)
    expect(draftOf().rec).toMatchObject({ source: 'rules', mood: 'comedy' })
  })

  it('이미지에서 글을 찾지 못하면 no_text 로 답하고 파일에 글 없음 표시를 남긴다', async () => {
    // 왜: 글 없는 그림은 "다른 파일 올리기 / 파일 빼고 진행"을 고르게 해야 한다(프로토타입 E2e).
    const image = { name: '복도_풍경.png', ext: 'png', kind: 'image', size: 10, chars: 0, storagePath: 'ws1/project-1/uploads/x/original.png', slicePaths: ['ws1/project-1/uploads/x/s000.jpg'], uploadedAt: '2026-10-19T00:00:00.000Z' }
    seed({ entry_draft: readyDraft({ idea: '', file: image }) })
    mocks.ocr.mockResolvedValue('')
    const res = await recommendEntry(jsonRequest('POST', '/api/produce/entry/recommend', { projectId: PID }))
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: 'no_text' })
    expect(mocks.ocr).toHaveBeenCalledWith(PID, ['https://media.test/ws1/project-1/uploads/x/s000.jpg'])
    expect(draftOf().file).toMatchObject({ noText: true })
    expect(mocks.recommend).not.toHaveBeenCalled()
  })

  it('이미지에서 읽은 글은 파일의 글로 남기고 그 글로 추천한다', async () => {
    // 왜: 사진 찍은 대본도 글 파일처럼 Writer 의 재료가 된다. 다시 추천할 때 또 읽지 않는다.
    const image = { name: '대본_사진.jpg', ext: 'jpg', kind: 'image', size: 10, chars: 0, storagePath: 'ws1/project-1/uploads/y/original.jpg', slicePaths: ['ws1/project-1/uploads/y/s000.jpg'], uploadedAt: '2026-10-19T00:00:00.000Z' }
    seed({ entry_draft: readyDraft({ idea: '', file: image }) })
    mocks.ocr.mockResolvedValue('민호: 또 안 나와?\n팀장: 고마워.')
    mocks.recommend.mockResolvedValue({ kind: '1-1', mood: 'comedy', moodWhy: 'a', runtime: 'r60', runtimeWhy: 'b', level: 'polish', title: '자판기' })
    const res = await recommendEntry(jsonRequest('POST', '/api/produce/entry/recommend', { projectId: PID }))
    expect(res.status).toBe(200)
    expect(draftOf().file).toMatchObject({ text: '민호: 또 안 나와?\n팀장: 고마워.', chars: 20 })
    expect(draftOf().rec.kind).toBe('img')
    expect(mocks.recommend.mock.calls[0][1]).toMatchObject({ file: { text: '민호: 또 안 나와?\n팀장: 고마워.' } })
  })
})

describe('시작', () => {
  it('시작하면 화면 비율을 잠그고 이야기 · 설정 · Producer 카드 초안 · 단계를 한 번에 저장하고 Writer 시작 요청을 돌려준다', async () => {
    // 왜: 한 번에 저장해야 반쯤 시작한 프로젝트가 생기지 않는다. 클라이언트는 돌려받은 요청을 그대로 Writer 에 보낸다.
    seed({ entry_draft: readyDraft({ rec: { kind: '1-3', mood: 'comedy', moodWhy: '', runtime: 'r60', runtimeWhy: '', level: 'polish', title: '자판기의 반란', basis: 'b', source: 'llm' } }) })
    const res = await startEntry(jsonRequest('POST', '/api/produce/entry/start', { projectId: PID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(mocks.updates).toHaveLength(1)
    const saved = project()
    expect(saved).toMatchObject({
      story_text: IDEA,
      settings: { playtime: 60, genre: '코미디', format: 'vertical_9:16', tone: [], dialogueLanguage: 'ko' },
      current_stage: 'producer',
      title: '자판기의 반란',
    })
    expect(saved.producer_draft).toMatchObject({ version: 1, storyText: IDEA, storyReady: true })
    expect((saved.entry_draft as Row).startedAt).toEqual(expect.any(String))
    expect(body).toMatchObject({ ok: true, title: '자판기의 반란', writerStart: { projectId: PID, story: IDEA, treatmentDraft: true, writerEngine: 'v1', changeLevel: 'polish' } })
  })

  it('이미 시작한 프로젝트는 다시 시작하지 않는다', async () => {
    // 왜: 두 번 시작하면 잠긴 화면 비율과 이야기가 바뀐다.
    seed({ entry_draft: readyDraft({ startedAt: '2026-10-19T00:00:00.000Z' }), current_stage: 'producer' })
    const res = await startEntry(jsonRequest('POST', '/api/produce/entry/start', { projectId: PID }))
    expect(res.status).toBe(409)
    expect(mocks.updates).toEqual([])
  })

  it('고르지 않은 값이 있으면 시작하지 않는다', async () => {
    // 왜: 화면 검사를 건너뛴 요청도 서버가 같은 규칙으로 막는다.
    seed({ entry_draft: readyDraft({ picks: { mood: 'comedy', runtime: 'r60', level: 'polish', ratio: null } }) })
    const res = await startEntry(jsonRequest('POST', '/api/produce/entry/start', { projectId: PID }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'missing_picks' })
    expect(mocks.updates).toEqual([])
  })

  it('Producer 시작 단계를 지난 프로젝트는 시작하지 않는다', async () => {
    // 왜: Artist 이후로 간 예전 프로젝트의 이야기와 설정을 시작 화면이 덮어쓰면 안 된다.
    seed({ entry_draft: readyDraft(), current_stage: 'artist' })
    const res = await startEntry(jsonRequest('POST', '/api/produce/entry/start', { projectId: PID }))
    expect(res.status).toBe(409)
    expect(mocks.updates).toEqual([])
  })
})
