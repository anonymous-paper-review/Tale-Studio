// Director 에서 고친 샷 프롬프트(채팅 [적용] · 샷 상세 프롬프트 칸)는 DB(shots.director_prompt)에 남아 다른 기기 · 다른 프로젝트를 다녀와도 그대로이고, Writer 가 샷 글을 다시 쓰면 비워진다 (오너 2026-11-26 O5 · 리드 승인)
import { readFileSync } from 'node:fs'
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const shared = vi.hoisted(() => ({ client: null as unknown as QueryClient }))
vi.mock('@/lib/query-client', () => ({ getQueryClient: () => shared.client }))

// supabase 흉내: 읽기는 표 이름으로 답하고, 쓰기(update)는 payload 와 거른 shot_id 를 기록한다.
const db = vi.hoisted(() => ({
  shots: [] as Array<Record<string, unknown>>,
  writes: [] as Array<{ table: string; payload: Record<string, unknown>; shotId: unknown }>,
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      let payload: Record<string, unknown> | null = null
      let shotId: unknown = null
      const result = () => {
        if (payload) {
          db.writes.push({ table, payload, shotId })
          return { data: null, error: null }
        }
        if (table === 'shots') return { data: db.shots, error: null }
        return { data: [], error: null }
      }
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'order', 'is', 'in', 'not', 'maybeSingle']) chain[m] = () => chain
      chain.eq = (column: string, value: unknown) => {
        if (column === 'shot_id') shotId = value
        return chain
      }
      chain.update = (p: Record<string, unknown>) => {
        payload = p
        return chain
      }
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject)
      return chain
    },
  }),
}))

import { effectivePrompt, useDirectorCanvasStore } from '@/stores/director-store'
import { isShotData } from '@/types/director'

const api = () => useDirectorCanvasStore.getState()
const WRITER_TEXT = 'A tired woman sits alone in a night subway car.'
let shotId = ''

const shotRow = (writerShotId: string, extra: Record<string, unknown> = {}) => ({
  shot_id: writerShotId, canvas_position: null, storyboard_image: null, image_inputs: [], director_refs: null, director_prompt: null, ...extra,
})
const promptWrites = () => db.writes.filter((w) => w.table === 'shots' && 'director_prompt' in w.payload)
const shotData = (id: string) => {
  const node = api().nodes.find((n) => n.id === id)
  return node && isShotData(node.data) ? node.data : null
}

beforeEach(() => {
  shared.client = new QueryClient()
  db.shots = []
  db.writes = []
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('/api/director/video-takes?')) return new Response(JSON.stringify({ takes: [] }), { status: 200 })
    return new Response('{}', { status: 200 })
  }))
  api().reset()
  api().setProjectId('p1')
  const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'sc_01')
  shotId = api().addShotNode(sceneId, { x: 300, y: 0 }, 'sh_01_01')
  api().updateNodeData<'shot'>(shotId, { writerShotId: 'sh_01_01', derivedPrompt: WRITER_TEXT, promptMigratedV2: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Director 고친 프롬프트 저장', () => {
  it('Director 에서 Writer 샷의 프롬프트를 고치면 0.5초 뒤 그 샷의 director_prompt 에 남는다', async () => {
    // 왜: 오너 O5 — 고치기는 채팅 [적용]으로만 한다. 그 글이 브라우저 기억에만 있으면 다른 기기에서 보이지 않고,
    //   같은 브라우저도 다른 프로젝트를 열었다 오면 사라져 다음 영상이 옛 글로 나갔다.
    api().updateNodeData<'shot'>(shotId, { promptOverride: `${WRITER_TEXT} Raindrops on the window behind her.` })
    await vi.advanceTimersByTimeAsync(600)
    expect(promptWrites()).toEqual([{ table: 'shots', payload: { director_prompt: `${WRITER_TEXT} Raindrops on the window behind her.` }, shotId: 'sh_01_01' }])
  })

  it('고친 글을 지우거나 Writer 글과 같게 되돌리면 director_prompt 를 비운다', async () => {
    // 왜: 고친 글이 없다는 것을 DB 에도 남겨야 다른 기기가 옛 고친 글을 쓰지 않는다. Writer 글과 같은 글은 고친 것이 아니다.
    api().updateNodeData<'shot'>(shotId, { promptOverride: WRITER_TEXT })
    await vi.advanceTimersByTimeAsync(600)
    api().updateNodeData<'shot'>(shotId, { promptOverride: undefined })
    await vi.advanceTimersByTimeAsync(600)
    expect(promptWrites().map((w) => w.payload.director_prompt)).toEqual([null, null])
  })

  it('캔버스에서 만든 샷(Writer 와 이어지지 않은 샷)의 고친 글은 DB 에 쓰지 않는다', async () => {
    // 왜: 정상 경로 고정 — 그 샷은 shots 행이 없다(화면에만 있다).
    const canvasShot = api().addShotNode(null, { x: 0, y: 900 })
    api().updateNodeData<'shot'>(canvasShot, { promptOverride: 'A lighthouse at dusk' })
    await vi.advanceTimersByTimeAsync(600)
    expect(promptWrites()).toEqual([])
  })

  it('Director 에 들어오면 DB 에 남은 고친 글이 그 샷 프롬프트가 된다 — 다른 기기 · 다른 프로젝트를 다녀와도', async () => {
    // 왜: DB 가 진실이다 — 다른 기기에서 고친 글, 다른 프로젝트를 다녀온 뒤(노드를 비웠다 다시 만듦)에도 같은 글이 보이고 다음 생성이 그 글로 간다.
    db.shots = [shotRow('sh_01_01', { director_prompt: 'Edited on another device.' })]
    await api().hydrateFromDb('p1')
    expect(shotData(shotId)?.promptOverride).toBe('Edited on another device.')
    expect(effectivePrompt(shotData(shotId)!)).toBe('Edited on another device.')
  })

  it('DB 에 고친 글이 없으면(null) 이 브라우저에 남은 옛 고친 글을 지우고 Writer 글로 돌아간다', async () => {
    // 왜: Writer 가 샷 글을 다시 써서 DB 가 고친 글을 비웠을 수 있다 — 브라우저에 남은 옛 고친 글이 새 이야기를 덮으면 안 된다.
    api().updateNodeData<'shot'>(shotId, { promptOverride: 'Old local edit.' })
    await vi.advanceTimersByTimeAsync(600)
    db.writes = []
    db.shots = [shotRow('sh_01_01', { director_prompt: null })]
    await api().hydrateFromDb('p1')
    expect(shotData(shotId)?.promptOverride).toBeUndefined()
    expect(effectivePrompt(shotData(shotId)!)).toBe(WRITER_TEXT)
  })

  it('고친 글을 저장하기 전(0.5초 안)에 다시 읽어도 막 고친 글을 덮지 않고, 그 뒤 저장한다', async () => {
    // 왜: 진입 재수화가 겹치는 사이 사람이 고친 글이 DB 의 옛 값으로 되돌아가면 안 된다(자리 · 그림의 같은 규칙).
    db.shots = [shotRow('sh_01_01', { director_prompt: null })]
    api().updateNodeData<'shot'>(shotId, { promptOverride: 'Typing now.' })
    await api().hydrateFromDb('p1')
    expect(shotData(shotId)?.promptOverride).toBe('Typing now.')
    await vi.advanceTimersByTimeAsync(600)
    expect(promptWrites().map((w) => w.payload.director_prompt)).toEqual(['Typing now.'])
  })

  it('Writer 가 샷 글(prompt)을 다시 쓰면 DB 가 Director 고친 글을 비운다 — 같은 갱신에서 둘 다 쓰면 고친 글을 남긴다', () => {
    // 왜: 고친 글은 옛 Writer 글 전체를 고친 것이라 남기면 새 이야기를 말없이 덮는다. Writer 쓰기 길(파이프라인 · 콘티 · 채팅)이 여럿이라 DB 방아쇠 한 곳이 잡는다
    //   (개발 DB 실측: Director 글 → Writer 글 바꿈 → null, 둘 다 쓰면 그 값).
    const sql = readFileSync('supabase/migrations/20261126220000_shots_director_prompt.sql', 'utf8')
    expect(sql).toMatch(/alter table public\.shots add column if not exists director_prompt text;/)
    expect(sql).toMatch(/if new\.prompt is distinct from old\.prompt and new\.director_prompt is not distinct from old\.director_prompt then\s+new\.director_prompt := null;/)
    expect(sql).toMatch(/before update of prompt on public\.shots/)
  })
})
