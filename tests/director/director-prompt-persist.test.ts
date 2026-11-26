// Director 에서 고친 샷 프롬프트(채팅 [적용] · 샷 상세 프롬프트 칸)는 DB(shots.director_prompt)에 남아 다른 기기 · 다른 프로젝트를 다녀와도 그대로이고, Writer 가 샷 글 · 샷 이야기를 다시 쓰면 비워지며, 다시 읽을 때 칸이 없거나 아직 못 올린 고친 글은 지우지 않고 올린다 (오너 2026-11-26 O5 · 리드 승인 · 검토 rev-billing)
import { readFileSync } from 'node:fs'
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const shared = vi.hoisted(() => ({ client: null as unknown as QueryClient }))
vi.mock('@/lib/query-client', () => ({ getQueryClient: () => shared.client }))

// supabase 흉내: 읽기는 표 이름으로 답하고, 쓰기(update)는 payload 와 거른 shot_id 를 기록한다.
const db = vi.hoisted(() => ({
  shots: [] as Array<Record<string, unknown>>,
  writes: [] as Array<{ table: string; payload: Record<string, unknown>; shotId: unknown; projectId?: unknown }>,
  /** true 면 쓰기가 실패한다(네트워크 · 칸 없음 등) — 시도는 writes 에 남는다. */
  failWrites: false,
  /** 있으면 shots 읽기가 이 약속이 풀릴 때까지 기다린다(재수화가 DB 를 읽는 동안 다른 일이 끼는 순간을 만든다). */
  readGate: null as Promise<void> | null,
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      let payload: Record<string, unknown> | null = null
      let shotId: unknown = null
      let projectId: unknown = null
      const result = async () => {
        if (payload) {
          db.writes.push({ table, payload, shotId, projectId })
          return db.failWrites ? { data: null, error: { message: 'write failed' } } : { data: null, error: null }
        }
        if (table === 'shots') {
          const rows = db.shots
          if (db.readGate) await db.readGate
          return { data: rows, error: null }
        }
        return { data: [], error: null }
      }
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'order', 'is', 'in', 'not', 'maybeSingle']) chain[m] = () => chain
      chain.eq = (column: string, value: unknown) => {
        if (column === 'shot_id') shotId = value
        if (column === 'project_id') projectId = value
        return chain
      }
      chain.update = (p: Record<string, unknown>) => {
        payload = p
        return chain
      }
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        result().then(resolve, reject)
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
  shot_id: writerShotId, canvas_position: null, storyboard_image: null, image_inputs: [], director_refs: null, director_prompt: null,
  prompt: WRITER_TEXT, action_description: 'She sits alone.', action_description_native: null, ...extra,
})
/** 운영 마이그레이션 전 행 — director_prompt 칸이 아예 없다. */
const rowWithoutColumn = (writerShotId: string, extra: Record<string, unknown> = {}) => {
  const { director_prompt: _missing, ...row } = shotRow(writerShotId, extra)
  return row
}
/** 그사이 다른 곳(Writer · 다른 기기 · 마이그레이션)이 행을 바꿨다 — 샷 사물함을 비워 다음 읽기가 새 행을 받게 한다(화면에서는 Writer 저장이 같은 일을 한다). */
const rowsChangedElsewhere = () => shared.client.clear()
/** 이 브라우저에 남아 있던 고친 글(이 기능 전 · 저장 없이) — 저장을 부르지 않고 노드에만 둔다. */
const setLocalEditWithoutSaving = (text: string) => useDirectorCanvasStore.setState((state) => ({
  nodes: state.nodes.map((n) => (n.id === shotId && isShotData(n.data) ? { ...n, data: { ...n.data, promptOverride: text } } : n)),
}))
const promptWrites = () => db.writes.filter((w) => w.table === 'shots' && 'director_prompt' in w.payload)
const shotData = (id: string) => {
  const node = api().nodes.find((n) => n.id === id)
  return node && isShotData(node.data) ? node.data : null
}

beforeEach(() => {
  shared.client = new QueryClient()
  db.shots = []
  db.writes = []
  db.failWrites = false
  db.readGate = null
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
    expect(promptWrites()).toEqual([{ table: 'shots', payload: { director_prompt: `${WRITER_TEXT} Raindrops on the window behind her.` }, shotId: 'sh_01_01', projectId: 'p1' }])
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

  it('이 브라우저가 이미 DB 와 맞춘 프로젝트에서 DB 의 고친 글이 비었으면(Writer 가 다시 씀 · 다른 기기에서 지움) 이 브라우저의 옛 고친 글을 지우고 Writer 글로 돌아간다', async () => {
    // 왜: 저장된 고친 글이 비었다는 것은 누군가 비운 것이다 — 브라우저에 남은 옛 고친 글이 새 이야기를 덮으면 안 된다.
    //   (옛 이름: 'DB 에 고친 글이 없으면(null) 이 브라우저에 남은 옛 고친 글을 지우고 Writer 글로 돌아간다' — 검토(rev-billing) · 리드 2026-11-26:
    //   처음 맞출 때 · 저장 실패 뒤 · 칸이 없을 때까지 지워 고친 글이 말없이 사라졌다. 이제 "이미 맞춘 프로젝트"에서만 지운다.)
    db.shots = [shotRow('sh_01_01')]
    await api().hydrateFromDb('p1')
    api().updateNodeData<'shot'>(shotId, { promptOverride: 'Old local edit.' })
    await vi.advanceTimersByTimeAsync(600)
    expect(promptWrites().map((w) => w.payload.director_prompt)).toEqual(['Old local edit.'])
    db.writes = []
    db.shots = [shotRow('sh_01_01', { director_prompt: null })]
    await api().hydrateFromDb('p1')
    expect(shotData(shotId)?.promptOverride).toBeUndefined()
    expect(effectivePrompt(shotData(shotId)!)).toBe(WRITER_TEXT)
    await vi.advanceTimersByTimeAsync(600)
    expect(promptWrites()).toEqual([])
  })

  it('이 브라우저에서 처음 DB 와 맞출 때 DB 에 고친 글이 없고 이 브라우저에만 고친 글이 있으면(이 기능 전에 고친 글) 지우지 않고 DB 로 올린다 — Writer 글이 그대로일 때만', async () => {
    // 왜: 검토 ② — 이 기능 전 고친 글은 브라우저에만 있다. 첫 진입에서 DB 의 빈 값으로 덮으면 사용자의 고친 글이 모두 사라진다.
    setLocalEditWithoutSaving('Edited before the column existed.')
    db.shots = [shotRow('sh_01_01', { director_prompt: null })]
    await api().hydrateFromDb('p1')
    expect(shotData(shotId)?.promptOverride).toBe('Edited before the column existed.')
    await vi.advanceTimersByTimeAsync(600)
    expect(promptWrites().map((w) => w.payload.director_prompt)).toEqual(['Edited before the column existed.'])
  })

  it('처음 맞출 때라도 그 고친 글을 쓴 뒤 Writer 가 샷 글이나 샷 이야기를 바꿨으면 올리지 않고 Writer 글로 돌아간다', async () => {
    // 왜: 리드 — Writer 가 이야기를 바꿔 비워야 하는 경우와 갈라야 한다. 칸이 없던 때 읽은 Writer 글과 지금 Writer 글이 다르면 옛 고친 글이다.
    db.shots = [rowWithoutColumn('sh_01_01')]
    await api().hydrateFromDb('p1')
    setLocalEditWithoutSaving('Edit against the old story.')
    db.shots = [shotRow('sh_01_01', { director_prompt: null, action_description: 'She stands up and leaves.' })]
    rowsChangedElsewhere()
    await api().hydrateFromDb('p1')
    expect(shotData(shotId)?.promptOverride).toBeUndefined()
    await vi.advanceTimersByTimeAsync(600)
    expect(promptWrites()).toEqual([])
  })

  it('행에 director_prompt 칸이 없으면(운영 마이그레이션 전) 이 브라우저의 고친 글을 건드리지 않고, 처음 맞춘 것으로도 치지 않는다', async () => {
    // 왜: 검토 ① — 배포 틈에 칸이 없는 것을 "비었음"으로 읽으면 들어오는 사람마다 고친 글이 지워진다.
    setLocalEditWithoutSaving('Edit during the deploy gap.')
    db.shots = [rowWithoutColumn('sh_01_01')]
    await api().hydrateFromDb('p1')
    expect(shotData(shotId)?.promptOverride).toBe('Edit during the deploy gap.')
    expect(api().directorPromptSyncedProjects.p1).toBeUndefined()
    // 칸이 생긴 뒤 첫 진입이 처음 맞춤이다 — 그때 올린다.
    db.shots = [shotRow('sh_01_01', { director_prompt: null })]
    rowsChangedElsewhere()
    await api().hydrateFromDb('p1')
    await vi.advanceTimersByTimeAsync(600)
    expect(promptWrites().map((w) => w.payload.director_prompt)).toEqual(['Edit during the deploy gap.'])
    expect(api().directorPromptSyncedProjects.p1).toBe(true)
  })

  it('고친 글 저장이 실패하면 다음에 들어올 때 DB 로 덮지 않고 그 글을 다시 올린다 — 그사이 Writer 글이 그대로일 때만', async () => {
    // 왜: 검토 ③ — 저장이 한 번 실패하면 다시 올리지 않아 다음 재수화가 지웠다.
    db.shots = [shotRow('sh_01_01')]
    await api().hydrateFromDb('p1')
    db.failWrites = true
    api().updateNodeData<'shot'>(shotId, { promptOverride: 'Edit that failed to save.' })
    await vi.advanceTimersByTimeAsync(600)
    db.failWrites = false
    db.writes = []
    db.shots = [shotRow('sh_01_01', { director_prompt: null })]
    rowsChangedElsewhere()
    await api().hydrateFromDb('p1')
    expect(shotData(shotId)?.promptOverride).toBe('Edit that failed to save.')
    await vi.advanceTimersByTimeAsync(600)
    expect(promptWrites().map((w) => w.payload.director_prompt)).toEqual(['Edit that failed to save.'])
  })

  it('고친 글 저장이 실패한 뒤 Writer 가 샷 이야기를 바꿨으면 다시 올리지 않고 Writer 글로 돌아간다', async () => {
    // 왜: 바뀐 이야기 위에 옛 고친 글을 되살리면 방아쇠 규칙(Writer 가 다시 쓰면 비운다)이 깨진다.
    db.shots = [shotRow('sh_01_01')]
    await api().hydrateFromDb('p1')
    db.failWrites = true
    api().updateNodeData<'shot'>(shotId, { promptOverride: 'Edit that failed to save.' })
    await vi.advanceTimersByTimeAsync(600)
    db.failWrites = false
    db.writes = []
    db.shots = [shotRow('sh_01_01', { director_prompt: null, action_description: 'She stands up and leaves.' })]
    rowsChangedElsewhere()
    await api().hydrateFromDb('p1')
    expect(shotData(shotId)?.promptOverride).toBeUndefined()
    await vi.advanceTimersByTimeAsync(600)
    expect(promptWrites()).toEqual([])
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

  it('Writer 콘티 · 채팅에서 샷 이야기(action_description)를 고쳐도 DB 가 Director 고친 글을 비운다 — 번역 칸(_native)만 바뀌면 남긴다', () => {
    // 왜: 콘티 · 채팅의 샷 이야기 고침은 action_description 만 쓰고 prompt 는 쓰지 않는다 — prompt 만 보던 방아쇠는 콘티 고침에 한 번도 걸리지 않아
    //   옛 고친 글이 새 이야기를 덮었다(리드 2026-11-26 확인 요청으로 찾음). 번역 채우기(derive-en)는 _native 만 바꾸므로 비우지 않는다
    //   (개발 DB 실측: _native 만 → 남음, action_description → null).
    const sql = readFileSync('supabase/migrations/20261126230000_shots_director_prompt_story_edit.sql', 'utf8')
    expect(sql).toMatch(/if \(new\.prompt is distinct from old\.prompt or new\.action_description is distinct from old\.action_description\)\s+and new\.director_prompt is not distinct from old\.director_prompt then\s+new\.director_prompt := null;/)
    expect(sql).toMatch(/before update of prompt, action_description on public\.shots/)
    expect(sql).not.toMatch(/before update of[^;]*action_description_native/)
  })
})

describe('Director 화면이 보내는 그림 · 영상 요청', () => {
  // 화면이 보낸 요청 몸을 모은다 — 생성처는 바로 거절해 다음 단계(기다림 · 판정)를 부르지 않는다.
  const bodiesTo = (fetcher: ReturnType<typeof vi.fn>, url: string) => fetcher.mock.calls
    .filter(([input]) => String(input) === url)
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>)
  const stubFetch = () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.startsWith('/api/director/video-takes?')) return new Response(JSON.stringify({ takes: [] }), { status: 200 })
      return new Response(JSON.stringify({ error: 'stop here' }), { status: 400 })
    })
    vi.stubGlobal('fetch', fetcher)
    return fetcher
  }

  it('Director 화면에서 그림을 만들면 지금 보이는 글(0.5초 안에 막 고친 글 포함)을 보내고 Director 화면의 글이라고 알린다 — 서버가 DB 의 옛 고친 글로 바꾸지 않게', async () => {
    // 왜: 서버는 Storyboard · 다른 기기 요청에는 DB 의 고친 글을 먼저 쓴다(리드 2026-11-26). 채팅 [적용] 바로 뒤처럼 저장 전에 요청하면
    //   DB 는 아직 옛 글이라, Director 화면 요청까지 DB 글로 바꾸면 방금 고친 글이 아닌 옛 글로 그린다.
    const fetcher = stubFetch()
    api().updateNodeData<'shot'>(shotId, { promptOverride: 'Applied from chat just now.' })
    await api().generateStoryboardImage(shotId)
    expect(bodiesTo(fetcher, '/api/director/generate-storyboard')[0]).toMatchObject({ prompt: 'Applied from chat just now.', promptSource: 'director' })
  })

  it('Director 화면에서 영상을 만들면 지금 보이는 글을 보내고 Director 화면의 글이라고 알린다', async () => {
    // 왜: 영상 서버도 같은 규칙이다 — 저장 전(0.5초 안) 요청이 옛 고친 글로 Take 를 쓰지 않게.
    const fetcher = stubFetch()
    api().updateNodeData<'shot'>(shotId, { promptOverride: 'Applied from chat for the video.' })
    await api().generateVideoForShot(shotId)
    expect(bodiesTo(fetcher, '/api/director/generate-video')[0]).toMatchObject({ prompt: 'Applied from chat for the video.', promptSource: 'director' })
  })
})

describe('재수화 경쟁 · 프로젝트 옮기기', () => {
  it('재수화가 DB 를 읽은 뒤 끝나기 전에 고친 글이 저장까지 끝났어도, 재수화가 읽어 둔 옛 값으로 덮지 않는다', async () => {
    // 왜(검토 rev-director 4번): 재수화는 시작 때 DB 를 읽고 끝날 때 0.5초 대기만 봐서, 그사이 저장이 끝난 고친 글을 옛 값으로 덮었다. 자리 · 그림처럼 시작 때와 비교한다.
    db.shots = [shotRow('sh_01_01')]
    await api().hydrateFromDb('p1')
    let release!: () => void
    db.readGate = new Promise<void>((resolve) => { release = resolve })
    rowsChangedElsewhere()
    const hydrating = api().hydrateFromDb('p1')
    await vi.advanceTimersByTimeAsync(0)
    api().updateNodeData<'shot'>(shotId, { promptOverride: 'Edit while the board was reloading.' })
    await vi.advanceTimersByTimeAsync(600)
    expect(promptWrites().map((w) => w.payload.director_prompt)).toEqual(['Edit while the board was reloading.'])
    db.readGate = null
    release()
    await hydrating
    expect(shotData(shotId)?.promptOverride).toBe('Edit while the board was reloading.')
  })

  it('고친 뒤 0.5초 안에 다른 프로젝트로 옮겨도 그 고친 글은 옮길 때 바로 그 프로젝트에 저장된다', async () => {
    // 왜(검토 #8): 저장 대기가 옮긴 뒤에 돌면 노드가 비어 저장하지 못하고 고친 글이 사라졌다.
    db.shots = [shotRow('sh_01_01')]
    await api().hydrateFromDb('p1')
    api().updateNodeData<'shot'>(shotId, { promptOverride: 'Edited right before leaving.' })
    api().setProjectId('p2')
    await vi.advanceTimersByTimeAsync(0)
    expect(promptWrites().map((w) => [w.projectId, w.payload.director_prompt])).toEqual([['p1', 'Edited right before leaving.']])
  })

  it('다른 프로젝트의 같은 이름 샷은 앞 프로젝트의 저장 대기에 막히지 않고 그 프로젝트의 고친 글을 받는다', async () => {
    // 왜(검토 #8): 저장 대기 표의 열쇠가 샷 이름(sh_01_01)뿐이라 다른 프로젝트의 같은 이름 샷도 "저장 대기"로 보고 DB 값을 받지 않았다.
    db.shots = [shotRow('sh_01_01')]
    await api().hydrateFromDb('p1')
    api().updateNodeData<'shot'>(shotId, { promptOverride: 'Edit in project one.' })
    api().setProjectId('p2')
    const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'sc_01')
    const otherShot = api().addShotNode(sceneId, { x: 300, y: 0 }, 'sh_01_01')
    api().updateNodeData<'shot'>(otherShot, { writerShotId: 'sh_01_01', derivedPrompt: WRITER_TEXT, promptMigratedV2: true })
    db.shots = [shotRow('sh_01_01', { director_prompt: 'Edit saved in project two.' })]
    rowsChangedElsewhere()
    await api().hydrateFromDb('p2')
    expect(shotData(otherShot)?.promptOverride).toBe('Edit saved in project two.')
  })
})
