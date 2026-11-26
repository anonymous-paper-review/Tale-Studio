// 러프 길이 더한 샷이 있을 때만 그리기 직전에 빈 칸을 다시 채우고, 그 칸(자리 · 자세)으로 러프 지시문을 쓰는지 러프 라우트를 직접 불러 검사한다(오너 2026-11-27 N2)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneStage } from '@/lib/writer/types/pipeline'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  submit: vi.fn(),
  getJob: vi.fn(),
  events: vi.fn(),
  refill: vi.fn(),
  shots: [] as Array<Record<string, unknown>>,
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async () => ({ ok: true, userId: 'owner' }) }))
vi.mock('@/lib/generation-quota', async (original) => ({
  ...await original<typeof import('@/lib/generation-quota')>(),
  checkGenerationCapacity: async () => ({ ok: true }),
  syncFalKeyLimits: async () => undefined,
}))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: mocks.events }))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageSubmit: mocks.submit, DEFAULT_EDIT_IMAGE_MODEL: 'edit', DEFAULT_IMAGE_MODEL: 'image' }))
vi.mock('@/lib/generation-jobs', async (original) => ({
  ...await original<typeof import('@/lib/generation-jobs')>(),
  getGenerationJobById: mocks.getJob,
}))
vi.mock('@/lib/writer/shot-design-state', () => ({ loadShotDesignByMainId: async () => new Map(), resolveShotDesign: () => null }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ deriveEnBatch: async (items: Array<{ id: string; native: string }>) => new Map(items.map((item) => [item.id, item.native])) }))
vi.mock('@/lib/writer/i18n/entity-names', () => ({ ensureEntityNamesEn: async () => ({ characters: new Map() }), ensureStageLandmarkLabelsEn: async () => new Map(), sceneLocationLabelsEn: async () => new Map() }))
vi.mock('@/lib/storage/template-asset', () => ({ templateAssetUrl: async () => null }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://example.test/webhook' }))
vi.mock('@/lib/writer/pipeline/util/added_shot_persist', () => ({ refillAddedShots: mocks.refill }))

import { POST } from '@/app/api/writer/rough-storyboard/route'
import { fillAddedShot, type AddedShotRow } from '@/lib/writer/pipeline/stage/added_shot'
import { describePlacement } from '@/lib/writer/rough-storyboard-grid'

const PROJECT = '11111111-2222-4333-8444-555555555555'
const STAGE: SceneStage = {
  scene_id: 'scene_1', unit: 'm', landmarks: [], axis: { from: 'mina', to: 'jun' }, camera_side: 'right',
  beats: [{ beat: 0, characters: [
    { character_id: 'mina', x: -1, y: 0, facing_deg: 90, posture: 'sitting' },
    { character_id: 'jun', x: 1, y: 0, facing_deg: 270, posture: 'standing' },
  ] }],
}
const PIPELINE: AddedShotRow = {
  shot_id: 'sh_01_01', scene_id: 'sc_01', source: 'pipeline', shot_type: 'WS', characters: ['mina', 'jun'], design_ref: 'shot_1', dynamic_spec: null,
  character_appearance_keys: { mina: 'current', jun: 'current' },
  static_spec: {
    shot_id: 'shot_1', shot_type: 'WS', lens_mm: 35, camera_angle: 'eye_level', framing: { layers: {} }, character_blocking: [],
    camera_setup: { subject: 'group', from_direction: 'S', height: 'eye', lens_mm: 35 },
    screen_layout: { beat: 0, camera: { x: 0, y: -6, z: 1.5, look_at: { x: 0, y: 0, z: 1.2 }, lens_mm: 35, hfov_deg: 54 }, characters: [], issues: [] },
  },
}
const ADDED: AddedShotRow & Record<string, unknown> = {
  shot_id: 'sh_01_02', scene_id: 'sc_01', source: 'manual', shot_type: 'MS', characters: ['mina', 'jun'], design_ref: null, dynamic_spec: null, static_spec: null,
  character_appearance_keys: { mina: 'current', jun: 'current' }, action_description: 'Mina and Jun talk across the table', rough_storyboard: null,
  camera_config: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting_config: { position: 'front', brightness: 50, colorTemp: 5000 },
}
// 진짜 채우기 계산으로 만든 채운 칸 — 러프 길은 다시 채우기(refillAddedShots)가 돌려준 이 칸으로 셀을 써야 한다.
const FILLED = fillAddedShot({ shot: ADDED, sceneShots: [PIPELINE, ADDED], stage: STAGE, format: 'horizontal_16:9' })!.static_spec as {
  screen_layout: { characters: Array<{ character_id: string; start: Parameters<typeof describePlacement>[0] }> }
}

function request(shotIds: string[]) {
  return new Request('http://localhost/api/writer/rough-storyboard', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: PROJECT, shotIds }),
  })
}
function query(table: string) {
  const filters: Record<string, unknown> = {}
  let single = false
  let patch: Record<string, unknown> | undefined
  const q: Record<string, unknown> = {}
  q.select = q.order = q.gte = q.in = q.like = () => q
  q.eq = (key: string, value: unknown) => { filters[key] = value; return q }
  q.update = (value: Record<string, unknown>) => { patch = value; return q }
  q.single = q.maybeSingle = () => { single = true; return q }
  q.then = (resolve: (result: unknown) => unknown) => {
    if (patch) return Promise.resolve({ data: [{ id: filters.id }], error: null }).then(resolve)
    const rows: Record<string, unknown[]> = {
      projects: [{ workspace_id: 'workspace', settings: { format: 'horizontal_16:9' } }],
      shots: mocks.shots,
      scenes: [{ scene_id: 'sc_01', location: 'cafe', time_of_day: 'night', mood: '', stage: STAGE }],
      generation_jobs: [],
    }
    const data = rows[table] ?? []
    return Promise.resolve({ data: single ? data[0] ?? null : data, error: null }).then(resolve)
  }
  return q
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.from.mockImplementation(query)
  mocks.rpc.mockImplementation(async (_name: string, args: { p_shot_ids: string[] }) => ({ data: [{ job_id: 'job-1', shot_ids: args.p_shot_ids, state: 'reserved' }], error: null }))
  mocks.getJob.mockImplementation(async (id: string) => ({ id, project_id: PROJECT, request_id: `reserved:${id}`, status: 'queued', fal_key_id: 'key' }))
  mocks.submit.mockImplementation(async () => ({ request_id: 'fal-1', model: 'image', fal_key_id: 'key' }))
  mocks.refill.mockImplementation(async () => new Map([['sh_01_02', { static_spec: FILLED, character_appearance_keys: { mina: 'current', jun: 'current' }, changed: true }]]))
})

describe('러프를 그릴 때 다시 채우기 — 러프 길', () => {
  // 왜: 러프 길이 그 샷을 그리기 직전에 다시 채워야 러프 · 실사 · 영상이 같은 칸을 본다(고친 뒤 옛 자리가 남지 않게).
  //   더한 샷이 없는 요청은 다시 채우기를 부르지 않는다 — 파이프라인 샷만 그리는 러프는 지금과 한 글자도 같다.
  //   (검토 rev-addshot 5: 라우트 글자가 아니라 라우트를 실제로 돌려 본다.)
  it('러프 길은 더한 샷이 있을 때만 그리기 직전에 다시 채우고, 그 칸으로 그린다', async () => {
    mocks.shots = [{ ...PIPELINE, action_description: 'Mina waits at the table', rough_storyboard: null }]
    const plain = await POST(request(['sh_01_01']))
    expect(plain.status).toBe(200)
    expect(mocks.refill).not.toHaveBeenCalled()
    expect(mocks.submit).toHaveBeenCalledTimes(1)

    mocks.shots = [{ ...ADDED }]
    const added = await POST(request(['sh_01_02']))
    expect(added.status).toBe(200)
    expect(mocks.refill).toHaveBeenCalledTimes(1)
    expect(mocks.refill.mock.calls[0][0]).toBe(PROJECT)
    expect(mocks.refill.mock.calls[0][1]).toEqual(['sh_01_02'])
    // 이미 읽은 샷 · 씬 무대 · 화면 비율을 넘긴다 — 채우기가 같은 것을 다시 읽지 않게(리드 2026-11-27 속도).
    const preloaded = mocks.refill.mock.calls[0][2] as { rows: Array<{ shot_id: string }>; stageByScene: Map<string, unknown>; format: string | null }
    expect(preloaded.rows.map((r) => r.shot_id)).toEqual(['sh_01_02'])
    expect(preloaded.stageByScene.get('sc_01')).toEqual(STAGE)
    expect(preloaded.format).toBe('horizontal_16:9')
    const prompt = String((mocks.submit.mock.calls.at(-1)?.[0] as { prompt?: string }).prompt)
    // 두 사람 더한 샷은 figure 에 이름을 붙인다(이 시험은 영어 이름 사전이 비어 id 가 붙는다).
    for (const [i, c] of FILLED.screen_layout.characters.entries()) {
      expect(prompt).toContain(`figure ${i + 1} (${c.character_id}) ${describePlacement(c.start)}`)
    }
    expect(prompt).toContain('figure 1 is mina and figure 2 is jun')
  })
})
