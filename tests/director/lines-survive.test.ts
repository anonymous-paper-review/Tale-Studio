// Director 배선 1 — 손으로 이은 선은 프로젝트 전환·새 기기에서도 남는다 (2026-09-06)
//
//   재수화가 DB 의 연결 참조를 현재 노드에 대고 풀 때, 아직 캔버스에 없는 대상(에셋 노드는 뒤에 생긴다)을
//   가리키는 참조는 버리지 않고 보관한다. 노드가 생기면 보관분을 풀어 선으로 되돌리고, 스윅은 보관분을
//   DB 값에 합쳐 "줄어든 목록"을 되쓰지 않는다. DB 와 같은 값은 다시 쓰지 않는다. 문장 하나 = 테스트 하나.
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const shared = vi.hoisted(() => ({ client: null as unknown as QueryClient }))
vi.mock('@/lib/query-client', () => ({ getQueryClient: () => shared.client }))

// supabase 흉내: 읽기는 표 이름으로 답하고, 쓰기(update)는 payload 를 기록한다.
const db = vi.hoisted(() => ({
  shots: [] as Array<Record<string, unknown>>,
  writes: [] as Array<{ table: string; payload: Record<string, unknown> }>,
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      let payload: Record<string, unknown> | null = null
      const result = () => {
        if (payload) {
          db.writes.push({ table, payload })
          return { data: null, error: null }
        }
        if (table === 'shots') return { data: db.shots, error: null }
        return { data: [], error: null }
      }
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'is', 'in', 'not', 'maybeSingle']) chain[m] = () => chain
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

import { useDirectorCanvasStore } from '@/stores/director-store'
import { useAssetStorageStore, type RegisterCharacterInput } from '@/stores/asset-storage-store'
import { isShotData, isVideoData } from '@/types/director'
import { mergeStableRefs, splitImageInputs } from '@/lib/director/wiring-persistence'

const api = () => useDirectorCanvasStore.getState()
const ASSET_NODE = 'dn_asset_character_char-a'

function registerCharacter(id: string) {
  const input: RegisterCharacterInput = {
    projectId: 'p1',
    sourceCanvasNodeId: `artist-${id}`,
    name: id,
    alias: '',
    background: '',
    description: id,
    prompt: id,
    referenceImages: [],
    views: {
      single: [{ id: `img-${id}`, url: `https://example.com/${id}.png`, prompt: id, modelId: 'imagen', createdAt: 1 }],
      fiveView: [],
      sixteenAngle: [],
    },
    statusVariants: [],
  }
  useAssetStorageStore.getState().registerCharacter(id, input)
}

function shotRow(shotId: string, extra: Record<string, unknown> = {}) {
  return {
    shot_id: shotId,
    canvas_position: null,
    storyboard_image: null,
    image_inputs: [],
    director_refs: null,
    ...extra,
  }
}

function take(id: string, shotId: string, frameInputs: unknown) {
  return {
    id,
    shot_id: shotId,
    take_number: 1,
    take_label: null,
    override: {},
    canvas_position: null,
    is_final: false,
    url: 'https://x/take.mp4',
    thumbnail_url: null,
    status: 'completed',
    latestJobId: null,
    latestJobStatus: null,
    latestJobError: null,
    latestAttemptAt: null,
    last_attempt_status: null,
    last_attempt_error: null,
    last_attempt_at: null,
    created_at: null,
    updated_at: null,
    frame_inputs: frameInputs,
    video_chain: null,
  }
}

const takes: { rows: unknown[]; gates: Array<Promise<void> | null> } = { rows: [], gates: [] }

function seed() {
  api().reset()
  useAssetStorageStore.getState().reset()
  api().setProjectId('p1')
  const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'S')
  const s1 = api().addShotNode(sceneId, { x: 300, y: 0 }, 'Shot1')
  api().updateNodeData<'shot'>(s1, { writerShotId: 's1' })
  const s2 = api().addShotNode(sceneId, { x: 300, y: 400 }, 'Shot2')
  api().updateNodeData<'shot'>(s2, { writerShotId: 's2' })
  return { s1, s2 }
}

function shotImageInputs(nodeId: string): string[] {
  const node = api().nodes.find((n) => n.id === nodeId)
  return node && isShotData(node.data) ? node.data.imageInputs : []
}

function imageInputWrites(shotId: string): unknown[][] {
  return db.writes
    .filter((w) => w.table === 'shots' && 'image_inputs' in w.payload)
    .map((w) => w.payload.image_inputs as unknown[])
    .filter(() => shotId.length > 0)
}

beforeEach(() => {
  shared.client = new QueryClient()
  db.shots = []
  db.writes = []
  takes.rows = []
  takes.gates = []
  vi.useFakeTimers()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.startsWith('/api/director/video-takes?')) {
        // n 번째 호출을 붙잡아 재수화 둘이 겹치는 상황을 만든다(프로덕션 실측: 진입 재수화 + Pass 2.5).
        const gate = takes.gates.shift() ?? null
        if (gate) await gate
        return new Response(JSON.stringify({ takes: takes.rows }), { status: 200 })
      }
      if (url.includes('/api/director/video-takes/')) {
        db.writes.push({ table: 'video_clips', payload: JSON.parse(String(init?.body ?? '{}')) })
        return new Response('{}', { status: 200 })
      }
      return new Response('{}', { status: 200 })
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Director에서 손으로 이은 연결은 프로젝트 전환·새 기기에서도 남는다', () => {
  it('아직 보이지 않는 에셋을 가리켜도 다시 들어온 뒤 연결을 빼지 않고 그대로 보존한다', async () => {
    seed()
    db.shots = [
      shotRow('s1', { image_inputs: [{ kind: 'shot', shotId: 's2' }, { kind: 'asset', assetId: 'char-a' }] }),
      shotRow('s2'),
    ]
    await api().hydrateFromDb('p1')
    await vi.advanceTimersByTimeAsync(700)
    for (const written of imageInputWrites('s1')) {
      expect(written).toContainEqual({ kind: 'asset', assetId: 'char-a' })
    }
  })

  it('에셋이 나중에 나타나면 보관한 연결이 이미지 목록과 선으로 돌아온다', async () => {
    const { s1 } = seed()
    db.shots = [
      shotRow('s1', { image_inputs: [{ kind: 'shot', shotId: 's2' }, { kind: 'asset', assetId: 'char-a' }] }),
      shotRow('s2'),
    ]
    await api().hydrateFromDb('p1')
    expect(shotImageInputs(s1)).not.toContain(ASSET_NODE)

    registerCharacter('char-a')
    api().updateNodeData<'shot'>(s1, { characterAssetIds: ['char-a'] })
    api().rebuildAssetNodes()

    expect(shotImageInputs(s1)).toContain(ASSET_NODE)
    expect(
      api().edges.some((e) => e.data?.category === 'image' && e.source === ASSET_NODE && e.target === s1),
    ).toBe(true)
  })

  it('영상 카드가 아직 없는 에셋을 가리켜도 연결을 보관했다가 에셋이 나타나면 다시 이어 준다', async () => {
    const { s1 } = seed()
    db.shots = [shotRow('s1'), shotRow('s2')]
    takes.rows = [take('clip-1', 's1', { start: null, end: null, refs: [{ kind: 'asset', assetId: 'char-a' }] })]
    await api().hydrateFromDb('p1')
    await vi.advanceTimersByTimeAsync(700)
    for (const w of db.writes.filter((w) => w.table === 'video_clips' && 'frame_inputs' in w.payload)) {
      const frames = w.payload.frame_inputs as { refs: unknown[] } | null
      expect(frames?.refs ?? []).toContainEqual({ kind: 'asset', assetId: 'char-a' })
    }

    registerCharacter('char-a')
    api().updateNodeData<'shot'>(s1, { characterAssetIds: ['char-a'] })
    api().rebuildAssetNodes()

    const video = api().nodes.find((n) => isVideoData(n.data) && n.data.videoClipId === 'clip-1')
    expect(video && isVideoData(video.data) ? video.data.frameInputs.refs : []).toContain(ASSET_NODE)
  })

  it('화면을 다시 불러오는 중 요청이 겹쳐도 먼저 시작한 결과로 연결이 비워졌다고 저장하지 않는다', async () => {
    const { s1, s2 } = seed()
    db.shots = [shotRow('s1', { image_inputs: [{ kind: 'shot', shotId: 's2' }] }), shotRow('s2')]
    let openSecond!: () => void
    takes.gates = [null, new Promise((r) => { openSecond = r })]
    const first = api().hydrateFromDb('p1') // 큐 훅의 진입 재수화
    const second = api().hydrateFromDb('p1') // 동기화 훅 Pass 2.5 — 영상 테이크 응답이 늦다
    await first
    await vi.advanceTimersByTimeAsync(700) // 앞 재수화가 예약한 스윅이 돌 시각
    expect(db.writes.filter((w) => w.table === 'shots' && 'image_inputs' in w.payload)).toEqual([])
    openSecond()
    await second
    await vi.advanceTimersByTimeAsync(700)
    expect(db.writes.filter((w) => w.table === 'shots' && 'image_inputs' in w.payload)).toEqual([])
    expect(shotImageInputs(s1)).toEqual([s2])
  })

  it('다시 불러온 연결이 기존 내용과 같으면 불필요하게 저장하지 않는다', async () => {
    seed()
    db.shots = [shotRow('s1', { image_inputs: [{ kind: 'shot', shotId: 's2' }] }), shotRow('s2')]
    await api().hydrateFromDb('p1')
    await vi.advanceTimersByTimeAsync(700)
    expect(db.writes.filter((w) => w.table === 'shots' && 'image_inputs' in w.payload)).toEqual([])
  })

  it('아직 찾지 못한 연결도 버리지 않고 보관하며 다시 합칠 때 같은 연결은 하나만 남긴다', () => {
    const { s1 } = seed()
    const { resolved, unresolved } = splitImageInputs(api().nodes, [
      { kind: 'shot', shotId: 's1' },
      { kind: 'asset', assetId: 'char-a' },
    ])
    expect(resolved).toEqual([s1])
    expect(unresolved).toEqual([{ kind: 'asset', assetId: 'char-a' }])
    expect(
      mergeStableRefs([{ kind: 'shot', shotId: 's1' }], [{ kind: 'shot', shotId: 's1' }, { kind: 'asset', assetId: 'char-a' }]),
    ).toEqual([{ kind: 'shot', shotId: 's1' }, { kind: 'asset', assetId: 'char-a' }])
  })
})
