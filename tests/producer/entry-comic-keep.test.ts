// 시작 화면에 만화 원고 그림을 올리고 그대로로 시작하면 채팅 길과 같은 만화 대본 옮기기로 대사를 원고 그대로 두는지 검사한다 (오너 2026-11-11 결정 3)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

type Row = Record<string, unknown>

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  owns: vi.fn(),
  rows: new Map<string, Record<string, unknown>>(),
  updates: [] as Array<{ table: string; patch: Record<string, unknown> }>,
  transcribe: vi.fn(),
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.owns }))
vi.mock('@/lib/storage/media', () => ({ mediaUpload: vi.fn(), mediaPublicUrl: (path: string) => `https://media.test/${path}` }))
vi.mock('@/lib/producer/comic-script-llm', () => ({ transcribeComic: mocks.transcribe }))
vi.mock('@/lib/writer/run-store', () => ({ getRunStatusLight: vi.fn(async () => null) }))

// supabaseAdmin 흉내 — projects 표 하나를 메모리에 둔다(entry-routes.test.ts 와 같은 짜임).
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

import { POST as startEntry } from '@/app/api/produce/entry/start/route'
import { GET as getEntry } from '@/app/api/produce/entry/route'
import { buildComicScriptPrompt } from '@/lib/producer/comic-script'

const PID = 'project-1'
// 이 시험을 위해 새로 지은 만화 한 쪽 — 실제 작품이 아니다. 글자 읽기는 말풍선 글만, 대본 옮기기는 장면 · 지문 · 화자를 붙인다.
const OCR_TEXT = '오늘도\n야근이야?\n\n응, 금방\n끝나.\n\n띵\n\n배달\n왔습니다!'
const SCRIPT = [
  'S#1. 사무실 - 밤',
  'A woman leans on the desk and looks at a man typing on a laptop.',
  '여자: 오늘도 야근이야?',
  '',
  'The man keeps typing without looking up.',
  '남자: 응, 금방 끝나.',
  '',
  '효과음: 띵',
  '',
  'A delivery rider opens the door with a bag.',
  '배달원: 배달 왔습니다!',
].join('\n')
const PAGE = {
  name: 'comic_1.png', ext: 'png', kind: 'image', size: 4096, chars: Array.from(OCR_TEXT).length, text: OCR_TEXT,
  storagePath: 'ws1/project-1/uploads/u1/original.png', slicePaths: ['ws1/project-1/uploads/u1/s000.jpg', 'ws1/project-1/uploads/u1/s001.jpg'],
  uploadedAt: '2026-11-11T00:00:00.000Z',
}

function seed(over: Row = {}, draft: Row = {}): void {
  mocks.rows.set(PID, {
    id: PID, workspace_id: 'ws1', title: 'Untitled', locale: 'en', current_stage: 'entry', series: null,
    settings: null, story_text: null, producer_draft: null,
    entry_draft: {
      version: 1, idea: 'This is my comic. Turn it into a video exactly as drawn, in the comic art style.', file: PAGE, rec: null,
      picks: { mood: 'comedy', runtime: null, level: 'keep', ratio: '9:16' }, chat: { answered: {}, pre: {} }, startedAt: null,
      ...draft,
    },
    ...over,
  })
}
const project = () => mocks.rows.get(PID) as Row
const start = () => startEntry(new NextRequest('http://localhost/api/produce/entry/start', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: PID }),
}))
const reply = (text: string) => ({ text, stopReason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } })
const sentPrompt = () => String(mocks.transcribe.mock.calls[0]?.[1] ?? '')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rows.clear()
  mocks.updates.length = 0
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.owns.mockResolvedValue(true)
  mocks.transcribe.mockResolvedValue(reply('```script\n' + SCRIPT + '\n```'))
  seed()
})

describe('만화 쪽으로 그대로 시작', () => {
  // 왜: 점검 R3-1(2026-11-10) — 시작 화면은 만화 쪽을 말풍선 글만 읽어(화자 · 지문 없음) 이야기로 삼아, Writer 가 화자를 짐작하고
  //   말을 고쳐 원고 말 8줄 중 4줄만 그대로였다. 채팅 길(만화 대본 옮기기)로 옮긴 대본은 23줄이 그대로였다. 오너 결정 3.
  it('만화 그림 한 쪽을 올리고 그대로로 시작하면 채팅 길과 같은 만화 대본 옮기기로 옮긴 대본을 이야기로 삼아 대사를 원고 그대로 둔다', async () => {
    const res = await start()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(mocks.transcribe).toHaveBeenCalledTimes(1)
    expect(mocks.transcribe.mock.calls[0][0]).toEqual(PAGE.slicePaths.map((p) => `https://media.test/${p}`))
    // 채팅 길과 같은 지시문(쪽 수 · 지문 언어 · 규칙 전부)으로 옮긴다.
    for (const line of buildComicScriptPrompt({ pageCount: 1, actionLanguage: 'en' }).split('\n')) expect(sentPrompt()).toContain(line)
    const saved = project()
    expect(saved.story_text).toBe(SCRIPT)
    expect(saved.producer_draft).toMatchObject({ storyText: SCRIPT, preserveScript: true })
    expect(body.writerStart).toMatchObject({ story: SCRIPT, preserveScript: true, changeLevel: 'keep' })
    for (const line of ['여자: 오늘도 야근이야?', '남자: 응, 금방 끝나.', '배달원: 배달 왔습니다!']) expect(String(saved.story_text)).toContain(line)
    // 대사 언어는 원고 언어(대본의 대사 줄), 길이는 원작대로 — 어제 규칙 그대로. 그림체는 시작 화면에서 정하지 않는다.
    expect(saved.settings).toMatchObject({ playtime: 0, dialogueLanguage: 'ko' })
    expect(mocks.updates.every((u) => !('custom_style_anchor' in u.patch) && !('style_anchor_key' in u.patch))).toBe(true)
  })

  // 왜(혼자 정한 것): 시작 화면은 사진 찍은 대본 · 메모도 받는다 — 그것을 만화로 옮기면 없는 칸 설명이 붙는다. 그림 모델이 만화가 아니라고 하면 지금처럼 읽은 글을 쓴다.
  it('글이 적힌 문서 · 대본 · 메모를 찍은 사진이면 만화로 옮기지 않고 지금처럼 읽은 글을 그대로 이야기로 쓴다', async () => {
    mocks.transcribe.mockResolvedValue(reply('NOT_A_COMIC'))
    const res = await start()
    expect(res.status).toBe(200)
    expect(mocks.transcribe).toHaveBeenCalledTimes(1)
    expect(sentPrompt()).toContain('NOT_A_COMIC')
    expect(project().story_text).toBe(OCR_TEXT)
    expect((await res.json()).writerStart).toMatchObject({ story: OCR_TEXT, preserveScript: true })
  })

  // 왜(혼자 정한 것): 다듬기 · 새로는 어차피 AI 가 고쳐 쓴다 — 옮기기는 그림 모델 한 번 · 30~60초가 더 든다. 정상 경로 고정.
  it('조금 다듬기 · 새로로 시작하면 만화 그림도 지금처럼 읽은 글로 시작하고 대본으로 옮기지 않는다', async () => {
    for (const level of ['polish', 'grow'] as const) {
      mocks.rows.clear()
      seed({}, { picks: { mood: 'comedy', runtime: 'r60', level, ratio: '9:16' } })
      const res = await start()
      expect(res.status, level).toBe(200)
      expect(String(project().story_text), level).toContain(OCR_TEXT)
    }
    expect(mocks.transcribe).not.toHaveBeenCalled()
  })

  // 왜(혼자 정한 것): 옮기기가 실패했을 때 말없이 읽은 글로 시작하면 "그대로"의 약속이 다시 깨진다 — 시작하지 않고 다시 시도하게 한다.
  it('만화 대본 옮기기에 실패하면 시작하지 않고, 읽은 글로 바꿔 시작하지도 않는다', async () => {
    mocks.transcribe.mockRejectedValue(new Error('model down'))
    const res = await start()
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ error: 'comic_script_failed' })
    expect(mocks.updates).toEqual([])
    expect(project().story_text).toBeNull()
  })

  // 왜(혼자 정한 것): 채팅 길과 같은 규칙 — 지문은 프로젝트 언어로 쓰고 대사 · 글자는 원문 그대로다. 한국어 화면(프로젝트)도 같은 길이다.
  it('만화 대본의 지문은 프로젝트 언어로 쓴다 — 한국어 프로젝트면 한국어 지문으로 옮긴다', async () => {
    mocks.rows.clear()
    seed({ locale: 'ko' })
    expect((await start()).status).toBe(200)
    for (const line of buildComicScriptPrompt({ pageCount: 1, actionLanguage: 'ko' }).split('\n')) expect(sentPrompt()).toContain(line)
    expect(project().story_text).toBe(SCRIPT)
  })

  // 왜(혼자 정한 것): 채팅으로 올린 만화는 사용자가 만화라고 고른 것이다 — "만화 아님" 답은 시작 화면에서만 허락해 채팅 길은 지금 그대로 둔다.
  it('채팅으로 올린 만화를 옮기는 지시문에는 만화 아님 답이 없고, 시작 화면의 지시문에만 있다', () => {
    expect(buildComicScriptPrompt({ pageCount: 2, actionLanguage: 'ko' })).not.toContain('NOT_A_COMIC')
    expect(buildComicScriptPrompt({ pageCount: 1, actionLanguage: 'ko', notComic: true })).toContain('NOT_A_COMIC')
  })

  // 왜: 시작 중에 화면을 닫거나 새로 고치면 시작은 뒤에서 끝나도 산문 초안 쓰기가 시작되지 않을 수 있다 — 그러면 시작한 화면이
  //   "산문 초안을 아직 쓰지 않았어요 · 다시 시도"를 띄운다. 그 다시 시도가 초안의 읽은 글(말풍선 글만)로 쓰면 화면(옮긴 대본)과 확정 · 이어 만들기가 다시 어긋난다.
  it('만화 쪽 그대로로 시작한 프로젝트를 다시 열어 산문 초안을 다시 쓰면 시작 때 옮긴 대본으로 쓴다', async () => {
    mocks.rows.clear()
    seed({ current_stage: 'producer', story_text: SCRIPT }, { startedAt: '2026-11-11T00:00:00.000Z' })
    const res = await getEntry(new NextRequest(`http://localhost/api/produce/entry?projectId=${PID}`))
    expect(res.status).toBe(200)
    expect((await res.json()).writerStart).toMatchObject({ story: SCRIPT, preserveScript: true, changeLevel: 'keep' })
    expect(mocks.transcribe).not.toHaveBeenCalled()
  })

  // 왜: 시작이 옮기기로 길어진 사이 새로 고친 화면에서 [시작]을 또 누르면 두 시작이 다 옮기기 전에 읽고 함께 옮긴다. 옮긴 대본은 매번 조금씩
  //   다를 수 있는데, 늦게 끝난 쪽이 저장을 덮으면 화면(늦은 대본)과 먼저 시작한 산문 초안(먼저 대본)이 어긋난다. 읽은 뒤 단계가 옮겨졌으면 덮지 않는다.
  it('두 번 누른 시작이 함께 만화를 옮기면 먼저 끝난 쪽만 저장하고, 늦게 끝난 쪽은 덮어쓰지 않고 단계가 이미 지났다고 답한다', async () => {
    const SCRIPT_B = SCRIPT.replace('A woman leans on the desk', 'A woman in a cardigan leans on the desk')
    let first: (v: unknown) => void = () => {}
    let second: (v: unknown) => void = () => {}
    mocks.transcribe
      .mockImplementationOnce(() => new Promise((resolve) => { first = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { second = resolve }))
    const early = start()
    const late = start()
    await vi.waitFor(() => expect(mocks.transcribe).toHaveBeenCalledTimes(2))
    first(reply('```script\n' + SCRIPT + '\n```'))
    expect((await early).status).toBe(200)
    second(reply('```script\n' + SCRIPT_B + '\n```'))
    const res = await late
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'wrong_stage' })
    expect(project().story_text).toBe(SCRIPT)
    expect(project().producer_draft).toMatchObject({ storyText: SCRIPT })
  })
})

