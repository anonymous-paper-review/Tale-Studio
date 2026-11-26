// 콘티에서 화살표를 고쳐 그 줄로 끝 장을 다시 그린 샷만, 실사 그림 지시(실사 그림체 사진 길 · 다른 그림체 길, 한 샷 · 네 샷 시트)에 그 읽은 줄을 움직임으로 싣는다 (오너 2026-11-22 R1 · 리드 2026-11-26 나눔 — m-director)
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  falImageSubmit: vi.fn(),
  moderated: [] as unknown[][],
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: async () => ({ ok: true as const, projectId: PROJECT_ID, userId: 'user-1', viaShare: false }),
}))
vi.mock('@/lib/generation-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-quota')>()),
  checkGenerationCapacity: async () => ({ ok: true, queued: 0, limit: 6, scope: 'user', category: 'image', axis: 'user_image' }),
}))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  reserveGenerationJob: async () => ({ id: 'job-1', project_id: PROJECT_ID, fal_key_id: 'key-1', request_id: 'reserved:job-1', status: 'queued' }),
  confirmGenerationJobReceipt: async () => undefined,
  rejectGenerationJobReservation: async () => undefined,
}))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageSubmit: mocks.falImageSubmit }))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: async () => undefined }))
vi.mock('@/lib/style-anchor', () => ({ resolveStyleAnchor: async () => null, applyStyleAnchor: (_a: unknown, opts: unknown) => opts }))
vi.mock('@/lib/style-facets/photo-look', () => ({ resolvePhotoLook: async () => null }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://hook.test/webhook', resolveWebhookBaseUrl: () => 'https://base.test' }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({
  deriveEnBatch: async (items: Array<{ id: string; native: string }>) => new Map(items.map((i) => [i.id, i.native])),
}))
vi.mock('@/lib/moderation/creem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/moderation/creem')>()
  return {
    ...actual,
    assertUserTextAllowed: vi.fn((parts: unknown[], context: Parameters<typeof actual.assertUserTextAllowed>[1]) => {
      mocks.moderated.push(parts)
      return actual.assertUserTextAllowed(parts as Parameters<typeof actual.assertUserTextAllowed>[0], context)
    }),
  }
})
vi.mock('@/lib/series/continuity', () => ({ loadSeriesFirstShotContinuity: async () => null, seriesContinuityPromptLine: () => '' }))
vi.mock('@/lib/director/storyboard-strip', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/director/storyboard-strip')>()),
  composeRoughReferenceStrip: async () => ({ buffer: Buffer.from('sheet'), sheetFormat: 'horizontal_16:9', geometry: { frameAxis: 'rows', repaintCanvas: '1024x1712' } }),
  composeRealFixStrip: async () => ({ buffer: Buffer.from('fix sheet'), sheetFormat: 'horizontal_16:9', geometry: { frameAxis: 'rows', repaintCanvas: '1024x1712' } }),
}))
vi.mock('@/lib/storage/media', () => ({
  mediaUpload: async () => ({ error: null }),
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
}))

import { POST } from '@/app/api/director/generate-storyboard/route'
import { buildRealGridPrompt, buildRealStripPrompt } from '@/lib/director/storyboard-strip'
import { buildPhotoGridPrompt, buildPhotoStripPrompt } from '@/lib/director/photo-strip'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
// 이 시험을 위해 지은 샷 — 샷 글은 옛 움직임(앞으로 걸어감)이고, 사람이 화살표를 고쳐 읽은 줄은 돌아서 카메라 쪽으로 온다.
const SHOT_TEXT = 'Min-ho walks forward toward the vending machine.'
const LINE = 'The figure on the left turns around and walks toward the camera, ending large in the lower right.'
const MOVEMENT = `- Movement (the director edited it after the shot description was written; where the two disagree, follow this movement and reference panel 3): ${LINE}`
const LOOK = { clause: 'Shot on 35mm film.', key: 'real' } as unknown as Parameters<typeof buildPhotoStripPrompt>[1]['photoLook']
const realStrip = (opts: Partial<Parameters<typeof buildRealStripPrompt>[1]> = {}) => buildRealStripPrompt(SHOT_TEXT, { characterRefCount: 1, hasStyleRef: false, ...opts })
const photoStrip = (opts: Partial<Parameters<typeof buildPhotoStripPrompt>[1]> = {}) => buildPhotoStripPrompt(SHOT_TEXT, { photoLook: LOOK, characterRefCount: 1, ...opts })
const realGrid = (opts: Partial<Parameters<typeof buildRealGridPrompt>[1]> = {}) => buildRealGridPrompt(3, { characterRefCount: 1, hasStyleRef: false, ...opts })
const photoGrid = (opts: Partial<Parameters<typeof buildPhotoGridPrompt>[1]> = {}) => buildPhotoGridPrompt(3, { photoLook: LOOK, characterRefCount: 1, ...opts })

const ROUGH_FRAMES = { start: 'https://r/start.png', direction: 'https://r/dir.png?v=2', end: 'https://r/end.png?v=3' }
const READ = { en: LINE, ko: null, source: 'user', direction: ROUGH_FRAMES.direction, at: 1, endDrawn: ROUGH_FRAMES.end }
let db: Record<string, Array<Record<string, unknown>>>
function queryFor(table: string) {
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'in', 'order', 'gte', 'limit', 'not', 'is']) q[name] = () => q
  q.maybeSingle = q.single = async () => ({ data: db[table]?.[0] ?? null, error: null })
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: db[table] ?? [], error: null }).then(resolve)
  return q
}
const request = (body: Record<string, unknown> = {}) => new Request('http://localhost/api/director/generate-storyboard', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ projectId: PROJECT_ID, writerShotId: 'sh_01_01', prompt: SHOT_TEXT, ...body }),
})
const submittedPrompt = () => (mocks.falImageSubmit.mock.calls[0]?.[0] as { prompt: string }).prompt

beforeEach(() => {
  vi.clearAllMocks()
  mocks.moderated = []
  db = {
    projects: [{ workspace_id: 'ws-1', style_anchor_key: null, custom_style_anchor: null, settings: { format: 'horizontal_16:9' } }],
    shots: [{
      shot_id: 'sh_01_01', scene_id: 'sc_01', sort_order: 0, characters: [], character_appearance_keys: {},
      rough_storyboard: { frames: ROUGH_FRAMES, generatedAt: 1, directionRead: READ },
      storyboard_image: null, static_spec: null, director_refs: null, dynamic_spec: null, check_notes: null, prompt: SHOT_TEXT,
    }],
    scenes: [], locations: [], location_appearances: [], characters: [], character_appearances: [],
  }
  mocks.from.mockImplementation(queryFor)
  mocks.falImageSubmit.mockResolvedValue({ request_id: 'fal-1', model: 'openai/gpt-image-2/edit', fal_key_id: 'key-1', fal_request: {} })
})

describe('실사 지시문의 읽은 줄 — 지시문 만드는 곳', () => {
  it('실사 한 샷을 그릴 때 그 샷의 끝 장을 그린 읽은 줄이 있으면 그 줄을 움직임으로 싣고, 샷 글과 다르면 그 줄과 참고 끝 칸을 따르라고 적는다 — 실사 그림체(사진 길) · 다른 그림체 길 모두', () => {
    // 왜(오너 R1): 끝 장을 고친 화살표대로 다시 그렸는데 실사 지시가 옛 샷 글만 따르면 실사 끝 그림이 옛 움직임으로 돌아간다.
    //   샷 글은 지우지 않는다(인물 · 소품 · 분위기가 들어 있다) — 다를 때 무엇을 따를지만 적는다(dev 5bc92642 와 같은 문장).
    for (const [name, prompt] of [['other styles', realStrip({ directionLine: LINE })], ['photo', photoStrip({ directionLine: LINE })]] as const) {
      expect(prompt, name).toContain(MOVEMENT)
      expect(prompt.indexOf('- Shot description:'), name).toBeLessThan(prompt.indexOf('- Movement ('))
      expect(prompt.indexOf('- Movement ('), name).toBeLessThan(prompt.indexOf('- No text'))
    }
  })

  it('실사 네 샷 시트를 그릴 때 끝 장을 그린 읽은 줄이 있는 칸만 그 줄을 칸 번호와 함께 싣는다 — 두 길 모두', () => {
    // 왜(오너 R1): 네 샷 시트는 칸마다 샷이 달라 칸 번호가 있어야 한다. 시트에는 샷 글이 없어 다툼이 없다 — 그 칸의 3행(끝)과 같은 움직임이라고만 적는다.
    for (const [name, prompt] of [['other styles', realGrid({ directionLines: [LINE, null, 'The camera pulls back to a wide shot.'] })], ['photo', photoGrid({ directionLines: [LINE, null, 'The camera pulls back to a wide shot.'] })]] as const) {
      const at = prompt.indexOf("- Per-column movement (the director's latest movement for these columns; it matches that column's row 3 END panel):")
      expect(at, name).toBeGreaterThan(0)
      const block = prompt.slice(at, prompt.indexOf('- No text'))
      expect(block, name).toContain(`Column 1: ${LINE}`)
      expect(block, name).toContain('Column 3: The camera pulls back to a wide shot.')
      expect(block, name).not.toContain('Column 2:')
    }
  })

  it('읽은 줄이 없거나 빈 줄이면 실사 지시는 한 글자도 바뀌지 않는다 — 두 길 · 한 샷과 네 샷 시트 모두', () => {
    // 왜: 리드 조건 — 화살표를 고치지 않은 샷의 지시문은 그대로다(other-styles-unchanged · 실사 고정본 시험도 그대로 통과).
    expect(realStrip({ directionLine: null })).toBe(realStrip())
    expect(realStrip({ directionLine: '   ' })).toBe(realStrip())
    expect(photoStrip({ directionLine: null })).toBe(photoStrip())
    expect(realGrid({ directionLines: [null, '', null] })).toBe(realGrid())
    expect(photoGrid({ directionLines: [null, null, null] })).toBe(photoGrid())
  })
})

describe('실사 지시문의 읽은 줄 — 그림 요청', () => {
  it('한 샷 실사 요청은 그 샷 러프 기록에 끝 장을 그린 읽은 줄이 있으면 그 줄을 지시에 싣고 내용 검사에도 넣는다', async () => {
    // 왜(오너 R1 · 10/11 약속): 읽은 줄에는 사람이 연출 장에 쓴 손글씨 · 고친 글이 옮겨진다 — 그림 지시에 싣기 전에 내용 검사를 거친다.
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(submittedPrompt()).toContain(MOVEMENT)
    expect(mocks.moderated.flat()).toContain(LINE)
  })

  it('읽은 줄이 낡았거나(연출 장이 바뀜) [그대로]를 골라 끝 장에 쓰지 않은 줄이면 한 샷 실사 지시에 싣지 않는다', async () => {
    // 왜(리드 Q-a · 오너 R1): 실사는 끝 장에 쓴 줄만 싣는다 — 끝 장이 옛 움직임이면 지시만 새 움직임을 말해 칸이 어긋난다.
    db.shots[0]!.rough_storyboard = { frames: ROUGH_FRAMES, generatedAt: 1, directionRead: { ...READ, direction: 'https://r/dir.png?v=1' } }
    await POST(request())
    expect(submittedPrompt()).not.toContain('- Movement (')
    vi.clearAllMocks()
    mocks.from.mockImplementation(queryFor)
    mocks.falImageSubmit.mockResolvedValue({ request_id: 'fal-2', model: 'openai/gpt-image-2/edit', fal_key_id: 'key-1', fal_request: {} })
    db.shots[0]!.rough_storyboard = { frames: ROUGH_FRAMES, generatedAt: 1, directionRead: { ...READ, endDrawn: null } }
    await POST(request())
    expect(submittedPrompt()).not.toContain('- Movement (')
  })

  it('바꿀 점으로 지금 그림을 고칠 때는 읽은 줄을 싣지 않는다 — 바꿀 점 밖은 지금 그림 그대로', async () => {
    // 왜: 고치기(오너 O8 (a))는 바꿀 점만 바꾸고 나머지를 지킨다 — 움직임 줄을 더하면 고치지 않은 움직임까지 다시 그리게 된다.
    db.shots[0]!.storyboard_image = { url: 'https://m/s.png', status: 'completed', frames: { start: 'https://m/s.png', direction: 'https://m/d.png', end: 'https://m/e.png' }, generatedAt: 2 }
    await POST(request({ changeNote: 'Add a red scarf.' }))
    expect(submittedPrompt()).toContain('Make ONLY this change: Add a red scarf.')
    expect(submittedPrompt()).not.toContain(LINE)
  })

  it('네 샷 시트 요청도 칸마다 끝 장을 그린 읽은 줄을 칸 번호와 함께 싣고 내용 검사에 넣는다', () => {
    // 왜(오너 R1): Storyboard [시작] 실사(네 샷 시트)도 한 샷과 같은 조건이어야 같은 샷이 길에 따라 달리 그려지지 않는다.
    const batch = readFileSync('src/app/api/director/generate-storyboard-batch/route.ts', 'utf8')
    expect(batch).toMatch(/directionLine: freshDirectionLine\(s\.rough_storyboard\),/)
    expect(batch.match(/directionLines: group\.map\(\(s\) => s\.directionLine\),/g)?.length).toBe(2)
    expect(batch).toMatch(/assertUserTextAllowed\(\s*\[[\s\S]*?\.\.\.group\.flatMap\(\(s\) => \(s\.directionLine \? \[s\.directionLine\] : \[\]\)\),[\s\S]*?\],\s*\{ projectId, kind: 'storyboard_real_grid'/)
  })
})
