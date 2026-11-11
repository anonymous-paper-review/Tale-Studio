// 시작 화면 읽기가 만화 쪽 그대로로 시작한 프로젝트에만 시작 때 올린 쪽(그림체 질문에 쓸 그림)을 돌려주는지 검사한다 (오너 2026-11-11 그림체 결정)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

type Row = Record<string, unknown>

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  owns: vi.fn(),
  rows: new Map<string, Record<string, unknown>>(),
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.owns }))
vi.mock('@/lib/storage/media', () => ({ mediaUpload: vi.fn(), mediaPublicUrl: (path: string) => `https://media.test/${path}` }))
vi.mock('@/lib/writer/run-store', () => ({ getRunStatusLight: vi.fn(async () => null) }))
// supabaseAdmin 흉내 — projects 표 하나를 메모리에 둔다(읽기만).
vi.mock('@/lib/supabase/admin', () => {
  function query() {
    const filters: Array<(row: Record<string, unknown>) => boolean> = []
    const run = () => ({ data: [...mocks.rows.values()].filter((row) => filters.every((f) => f(row))).map((r) => JSON.parse(JSON.stringify(r))), error: null })
    const q = {
      eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return q },
      maybeSingle() { const res = run(); return Promise.resolve({ data: res.data[0] ?? null, error: null }) },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) { return Promise.resolve(run()).then(resolve, reject) },
    }
    return q
  }
  return { supabaseAdmin: { from: () => ({ select: () => query() }) } }
})

import { GET as getEntry } from '@/app/api/produce/entry/route'

const PID = 'project-1'
// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const OCR_TEXT = '오늘도\n야근이야?\n\n응, 금방\n끝나.'
const SCRIPT = 'S#1. 사무실 - 밤\nA woman leans on the desk.\n여자: 오늘도 야근이야?\n남자: 응, 금방 끝나.'
const PAGE = {
  name: 'comic_1.png', ext: 'png', kind: 'image', size: 4096, chars: Array.from(OCR_TEXT).length, text: OCR_TEXT,
  storagePath: 'ws1/project-1/uploads/u1/original.png', slicePaths: ['ws1/project-1/uploads/u1/s000.jpg', 'ws1/project-1/uploads/u1/s001.jpg'],
  uploadedAt: '2026-11-11T00:00:00.000Z',
}

function seed(over: Row = {}, draft: Row = {}): void {
  mocks.rows.set(PID, {
    id: PID, workspace_id: 'ws1', title: 'Comic', locale: 'en', current_stage: 'producer', series: null, settings: null,
    story_text: SCRIPT, style_anchor_key: null, custom_style_anchor: null,
    entry_draft: {
      version: 1, idea: 'This is my comic. Turn it into a video exactly as drawn, in the comic art style.', file: PAGE, rec: null,
      picks: { mood: 'comedy', runtime: null, level: 'keep', ratio: '9:16' }, chat: { answered: {}, pre: {} }, startedAt: '2026-11-11T00:00:00.000Z',
      ...draft,
    },
    ...over,
  })
}
const read = async () => (await getEntry(new NextRequest(`http://localhost/api/produce/entry?projectId=${PID}`))).json()

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rows.clear()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.owns.mockResolvedValue(true)
})

describe('시작 때 올린 만화 쪽', () => {
  // 왜: 시작 화면에서 만화 쪽을 그대로로 시작하면 그림체를 묻지 않았고, 확정 뒤에는 그 만화 그림체를 쓸 길이 없었다(오너 결정 — Writer 채팅에서 칩으로 묻는다).
  //   시작 때 올린 쪽은 저장돼 있어 다시 올려 달라고 하지 않는다 — 그 주소를 Writer 가 그림체 질문에 쓴다.
  it('만화 쪽 그대로로 시작한 프로젝트는 시작 화면 읽기에 시작 때 올린 쪽(원본 · 읽기용 조각 주소)을 돌려준다', async () => {
    seed()
    expect((await read()).comicStart).toEqual({
      name: 'comic_1.png',
      thumbUrl: 'https://media.test/ws1/project-1/uploads/u1/original.png',
      sliceUrls: PAGE.slicePaths.map((p) => `https://media.test/${p}`),
    })
  })

  // 왜(혼자 정한 것): 다듬기 · 새로는 만화를 대본으로 옮기지 않았고, 문서 · 메모 사진은 만화가 아니라 읽은 글 그대로 시작했다(이야기 = 읽은 글).
  //   그림체가 이미 정해진 프로젝트(시리즈 다음 화 · 이미 고정)와 시작 전 프로젝트도 물을 것이 없다.
  it('다듬기 · 새로 · 만화 아님(문서 사진)으로 시작했거나 시작 전이거나 그림체가 이미 정해진 프로젝트는 시작 때 올린 쪽을 돌려주지 않는다', async () => {
    const cases: Array<[string, Row, Row]> = [
      ['polish', {}, { picks: { mood: 'comedy', runtime: 'r60', level: 'polish', ratio: '9:16' } }],
      ['grow', {}, { picks: { mood: 'comedy', runtime: 'r60', level: 'grow', ratio: '9:16' } }],
      ['not a comic', { story_text: OCR_TEXT }, {}],
      ['not started', { current_stage: 'entry' }, { startedAt: null }],
      ['preset style', { style_anchor_key: 'anime_2d' }, {}],
      ['custom style', { custom_style_anchor: { url: 'https://media.test/x.png', label: 'My art style', locked: true } }, {}],
    ]
    for (const [name, over, draft] of cases) {
      mocks.rows.clear()
      seed(over, draft)
      expect((await read()).comicStart, name).toBeNull()
    }
  })
})
