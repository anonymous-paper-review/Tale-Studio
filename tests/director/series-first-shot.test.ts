// 앞 화 마지막 장면에서 이어 시작한 화는 첫 샷 스토리보드에만 앞 화 끝 장면을 참고 그림으로 넣는다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  reserveGenerationJob: vi.fn(),
  confirmGenerationJobReceipt: vi.fn(),
  rejectGenerationJobReservation: vi.fn(),
  falImageSubmit: vi.fn(),
  recordWriterObservabilityEvent: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
// 접근 가드는 이 파일의 관심사 아님 — 소유자 통과로 고정(가드 자체는 api-project-access-guard.test.ts 전담).
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: async () => ({ ok: true as const, projectId: PROJECT_ID, userId: USER_ID, viaShare: false }),
}))
vi.mock('@/lib/generation-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-quota')>()),
  checkGenerationCapacity: mocks.checkGenerationCapacity,
}))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  reserveGenerationJob: mocks.reserveGenerationJob,
  confirmGenerationJobReceipt: mocks.confirmGenerationJobReceipt,
  rejectGenerationJobReservation: mocks.rejectGenerationJobReservation,
}))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageSubmit: mocks.falImageSubmit }))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: mocks.recordWriterObservabilityEvent }))
vi.mock('@/lib/style-anchor', () => ({
  resolveStyleAnchor: async () => null,
  applyStyleAnchor: (_anchor: unknown, opts: unknown) => opts,
}))
vi.mock('@/lib/fal/webhook-url', () => ({
  resolveWebhookUrl: () => 'https://hook.test/webhook',
  resolveWebhookBaseUrl: () => 'https://base.test',
}))
vi.mock('@/lib/writer/i18n/derive-en', () => ({
  deriveEnBatch: async (items: Array<{ id: string; native: string }>) => new Map(items.map((i) => [i.id, i.native])),
}))
// 시트 합성은 sharp 를 쓰는 무거운 순수 함수 — 이 파일의 검사 대상이 아니다. 샷 문장은 그대로 흘려보내
//   스토리보드 프롬프트에 연속성 한 줄이 실렸는지 볼 수 있게 한다.
vi.mock('@/lib/director/storyboard-strip', () => ({
  composeRoughReferenceGrid: async () => Buffer.from('grid'),
  composeRoughReferenceStrip: async () => ({ buffer: Buffer.from('strip'), sheetFormat: null, geometry: { frameAxis: 'x', repaintCanvas: '1024x1024' } }),
  buildRealGridPrompt: () => 'GRID PROMPT',
  buildRealStripPrompt: (shotPrompt: string) => `STRIP PROMPT ${shotPrompt}`,
  realSheetCanvas: () => '2048x1536',
}))
vi.mock('@/lib/storage/media', () => ({
  mediaUpload: async () => ({ error: null }),
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
}))

import { POST as generateStoryboardPOST } from '@/app/api/director/generate-storyboard/route'
import { POST as generateStoryboardBatchPOST } from '@/app/api/director/generate-storyboard-batch/route'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = 'user-1'
const WORKSPACE_ID = 'workspace-1'
const JOB_ID = 'job-1'
const PREV_END_FRAME = 'https://media.test/prev/last-scene-end.png'
/** 첫 샷 프롬프트에 실리는 연속성 지시의 꼬리표 — 문안 전체가 아니라 이 뜻이 실렸는지만 본다. */
const CONTINUITY_MARK = 'continues from the final moment of the previous episode'

/** 앞 화에서 복사해 온 기록 — 마지막 장면 잇기를 골랐다. */
const SERIES = {
  version: 1,
  prevProjectId: 'p1',
  prevTitle: '자판기의 반란',
  copiedAt: '2026-10-26T00:00:00.000Z',
  characters: [],
  locations: [],
  voices: [],
  styleId: 'anime',
  format: 'landscape',
  dialogueLanguage: 'ko',
  continuesLastScene: true,
  copyFailures: [],
}

let db: Record<string, Array<Record<string, unknown>>>

/** supabase-js 체인 최소 스텁 — eq · in 걸개와 정렬 · 개수 제한을 실제로 적용한다(첫 샷 판정이 정렬에 달려 있다). */
function queryFor(table: string) {
  const filters: Array<[string, unknown]> = []
  const orders: Array<[string, boolean]> = []
  let max: number | null = null
  const rows = () => {
    let out = (db[table] ?? []).filter((row) =>
      filters.every(([column, value]) => (Array.isArray(value) ? value.includes(row[column]) : row[column] === value)),
    )
    for (const [column, ascending] of [...orders].reverse()) {
      out = [...out].sort((a, b) => {
        const x = a[column] as string | number
        const y = b[column] as string | number
        return (x === y ? 0 : x < y ? -1 : 1) * (ascending ? 1 : -1)
      })
    }
    return max === null ? out : out.slice(0, max)
  }
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'not', 'is', 'gte', 'update']) q[name] = () => q
  q.eq = (column: string, value: unknown) => {
    filters.push([column, value])
    return q
  }
  q.in = (column: string, values: unknown[]) => {
    filters.push([column, values])
    return q
  }
  q.order = (column: string, opts?: { ascending?: boolean }) => {
    orders.push([column, opts?.ascending !== false])
    return q
  }
  q.limit = (n: number) => {
    max = n
    return q
  }
  q.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null })
  q.single = q.maybeSingle
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve)
  return q
}

function shotRow(sceneId: string, shotId: string, sortOrder: number) {
  return {
    project_id: PROJECT_ID,
    shot_id: shotId,
    scene_id: sceneId,
    sort_order: sortOrder,
    characters: [],
    character_appearance_keys: {},
    rough_storyboard: {
      frames: { start: 'https://r/s.png', direction: 'https://r/d.png', end: 'https://r/e.png' },
      generatedAt: 1000,
    },
    storyboard_image: null,
    static_spec: null,
    director_refs: null,
    check_notes: null,
  }
}

const storyboardRequest = (writerShotId: string) =>
  new Request('http://localhost/api/director/generate-storyboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: PROJECT_ID, writerShotId, prompt: 'SHOT PROMPT', aspectRatio: '16:9' }),
  })

const batchRequest = () =>
  new Request('http://localhost/api/director/generate-storyboard-batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: PROJECT_ID }),
  }) as never

/** 외부로 나간 첫 주문서 — 참고 그림 목록과 프롬프트. */
const submitted = () => mocks.falImageSubmit.mock.calls[0][0] as { prompt: string; reference_image_urls?: string[] }

beforeEach(() => {
  vi.clearAllMocks()
  db = {
    projects: [
      {
        id: PROJECT_ID,
        workspace_id: WORKSPACE_ID,
        style_anchor_key: null,
        custom_style_anchor: null,
        settings: null,
        series: SERIES,
        optional_reference_frame_url: PREV_END_FRAME,
      },
    ],
    // 일부러 뒤 씬 · 뒤 샷을 앞에 둔다 — 첫 샷은 씬 순서 → 샷 순서로만 정해진다.
    scenes: [
      { project_id: PROJECT_ID, scene_id: 'scene-2', sort_order: 1, time_of_day: null, location: null, narrative_time: null },
      { project_id: PROJECT_ID, scene_id: 'scene-1', sort_order: 0, time_of_day: null, location: null, narrative_time: null },
    ],
    shots: [shotRow('scene-1', 'sh_01_02', 1), shotRow('scene-1', 'sh_01_01', 0), shotRow('scene-2', 'sh_02_01', 2)],
    locations: [],
    location_appearances: [],
    characters: [],
    character_appearances: [],
    generation_jobs: [],
  }
  mocks.from.mockImplementation(queryFor)
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true, queued: 0, limit: 6, scope: 'user', category: 'image', axis: 'user_image' })
  mocks.reserveGenerationJob.mockResolvedValue({ id: JOB_ID, project_id: PROJECT_ID, fal_key_id: 'key-1', request_id: `reserved:${JOB_ID}`, status: 'queued' })
  mocks.confirmGenerationJobReceipt.mockResolvedValue(undefined)
  mocks.rejectGenerationJobReservation.mockResolvedValue(undefined)
  mocks.falImageSubmit.mockResolvedValue({ request_id: 'fal-1', model: 'openai/gpt-image-2/edit', fal_key_id: 'key-1', fal_request: {} })
})

describe('시리즈 첫 샷의 앞 화 끝 장면 참고', () => {
  it('앞 화 마지막 장면에서 잇기로 만든 화는 첫 샷 스토리보드에 앞 화 끝 장면을 참고 그림으로 넣는다', async () => {
    // 왜: 정상 경로 고정 — 다음 화의 첫 컷이 앞 화 마지막 순간에서 이어 보이게 하는 유일한 연결이다.
    expect((await generateStoryboardPOST(storyboardRequest('sh_01_01'))).status).toBe(200)
    expect(submitted().reference_image_urls?.at(-1)).toBe(PREV_END_FRAME)
    expect(submitted().prompt).toContain(CONTINUITY_MARK)

    // 묶음(그리드)도 같다 — 첫 샷이 들어간 시트에만 붙는다.
    mocks.falImageSubmit.mockClear()
    expect((await generateStoryboardBatchPOST(batchRequest())).status).toBe(200)
    expect(submitted().reference_image_urls?.at(-1)).toBe(PREV_END_FRAME)
    expect(submitted().prompt).toContain(CONTINUITY_MARK)
  })

  it('첫 샷이 아닌 샷에는 앞 화 끝 장면을 넣지 않는다', async () => {
    // 왜: 두 번째 샷부터는 같은 화 안에서 이어지므로 앞 화 그림이 들어가면 구도가 앞 화로 끌려간다.
    expect((await generateStoryboardPOST(storyboardRequest('sh_01_02'))).status).toBe(200)
    expect(submitted().reference_image_urls ?? []).not.toContain(PREV_END_FRAME)
    expect(submitted().prompt).not.toContain(CONTINUITY_MARK)

    // 첫 샷을 이미 그려 둔 뒤의 묶음 시트에는 첫 샷이 없다.
    mocks.falImageSubmit.mockClear()
    db.shots = db.shots.map((shot) => (shot.shot_id === 'sh_01_01' ? { ...shot, storyboard_image: { url: 'https://img/done.png' } } : shot))
    expect((await generateStoryboardBatchPOST(batchRequest())).status).toBe(200)
    expect(submitted().reference_image_urls ?? []).not.toContain(PREV_END_FRAME)
    expect(submitted().prompt).not.toContain(CONTINUITY_MARK)
  })

  it('마지막 장면 잇기를 고르지 않은 화는 첫 샷에도 앞 화 끝 장면을 넣지 않는다', async () => {
    // 왜: 체크박스를 고르지 않은 화에 앞 화 그림이 들어가면 사용자가 고르지 않은 연결이 생긴다.
    db.projects[0].series = { ...SERIES, continuesLastScene: false }
    expect((await generateStoryboardPOST(storyboardRequest('sh_01_01'))).status).toBe(200)
    expect(submitted().reference_image_urls ?? []).not.toContain(PREV_END_FRAME)
    expect(submitted().prompt).not.toContain(CONTINUITY_MARK)

    // 잇기를 골랐더라도 앞 화 끝 그림을 복사하지 못했으면 넣을 것이 없다.
    mocks.falImageSubmit.mockClear()
    db.projects[0].series = SERIES
    db.projects[0].optional_reference_frame_url = null
    expect((await generateStoryboardPOST(storyboardRequest('sh_01_01'))).status).toBe(200)
    expect(submitted().reference_image_urls ?? []).not.toContain(PREV_END_FRAME)
    expect(submitted().prompt).not.toContain(CONTINUITY_MARK)
  })
})
