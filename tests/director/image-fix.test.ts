// Writer 샷의 이미지를 고칠 때(바꿀 점이 있고 지금 실사 그림이 있으면) 지금 세 칸을 합친 시트를 1번 참고 그림으로 보내 바꿀 점만 바꾸게 하고, 지금 그림이 없으면 예전처럼 바꿀 점을 글 끝에 붙인다 (오너 2026-11-26 O5 · 채팅 고치기 재료 (a))
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  falImageSubmit: vi.fn(),
  composed: [] as Array<{ start: string; direction: string; end: string }>,
  stripPrompts: [] as string[],
  uploads: [] as string[],
  reserved: [] as Array<Record<string, unknown>>,
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
  reserveGenerationJob: async (input: Record<string, unknown>) => {
    mocks.reserved.push(input)
    return { id: 'job-1', project_id: PROJECT_ID, fal_key_id: 'key-1', request_id: 'reserved:job-1', status: 'queued' }
  },
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
  composeRoughReferenceStrip: async (frames: { start: string; direction: string; end: string }) => {
    mocks.composed.push(frames)
    return { buffer: Buffer.from('sheet'), sheetFormat: 'horizontal_16:9', geometry: { frameAxis: 'rows', repaintCanvas: '1024x1712' } }
  },
  buildRealStripPrompt: (shotPrompt: string) => {
    mocks.stripPrompts.push(shotPrompt)
    return 'ROUGH STRIP PROMPT'
  },
}))
vi.mock('@/lib/storage/media', () => ({
  mediaUpload: async (path: string) => {
    mocks.uploads.push(path)
    return { error: null }
  },
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
}))

import { POST } from '@/app/api/director/generate-storyboard/route'
import { storageKeySegment } from '@/lib/storage/key-segment'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const ROUGH = { start: 'https://r/start.png', direction: 'https://r/dir.png', end: 'https://r/end.png' }
const REAL = { start: 'https://m/real-start.png', direction: 'https://m/real-dir.png', end: 'https://m/real-end.png' }
let db: Record<string, Array<Record<string, unknown>>>

// 표 이름으로 답하고, eq 로 건 칸이 행에 있으면 그 값으로 거른다(앞 샷 찾기 — sort_order).
function queryFor(table: string) {
  const filters: Record<string, unknown> = {}
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'in', 'order', 'gte', 'limit', 'not', 'is']) q[name] = () => q
  q.eq = (column: string, value: unknown) => {
    filters[column] = value
    return q
  }
  const rows = () => (db[table] ?? []).filter((row) => Object.entries(filters).every(([key, value]) => !(key in row) || row[key] === value))
  q.maybeSingle = q.single = async () => ({ data: rows()[0] ?? null, error: null })
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve)
  return q
}
const request = (body: Record<string, unknown>) => new Request('http://localhost/api/director/generate-storyboard', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ projectId: PROJECT_ID, writerShotId: 'sh_01_01', prompt: 'A woman waits on a rainy platform.', ...body }),
})
const submitted = () => mocks.falImageSubmit.mock.calls[0]?.[0] as { prompt: string; reference_image_urls: string[]; image_size?: string }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.composed = []
  mocks.stripPrompts = []
  mocks.uploads = []
  mocks.reserved = []
  mocks.moderated = []
  db = {
    projects: [{ workspace_id: 'ws-1', style_anchor_key: null, custom_style_anchor: null, settings: { format: 'horizontal_16:9' } }],
    shots: [{
      shot_id: 'sh_01_01', scene_id: 'sc_01', sort_order: 0, characters: [], character_appearance_keys: {},
      rough_storyboard: { frames: ROUGH, generatedAt: 1 },
      storyboard_image: { url: REAL.start, status: 'completed', frames: REAL, generatedAt: 2 },
      static_spec: null, director_refs: null, dynamic_spec: null, check_notes: null, prompt: 'A woman waits on a rainy platform.',
    }],
    scenes: [], locations: [], location_appearances: [], characters: [], character_appearances: [],
  }
  mocks.from.mockImplementation(queryFor)
  mocks.falImageSubmit.mockResolvedValue({ request_id: 'fal-1', model: 'openai/gpt-image-2/edit', fal_key_id: 'key-1', fal_request: {} })
})

describe('이미지 고치기 = 지금 그림을 바탕으로', () => {
  it('바꿀 점이 있고 지금 실사 그림이 있으면 지금 세 칸을 합친 시트를 1번 참고 그림으로 보내고, "바꿀 점만 바꾸고 나머지는 그대로" 지시문으로 다시 칠한다', async () => {
    // 왜: 오너 2026-11-26 채팅 고치기 재료 (a) "지금 그림을 참고로" — 예전에는 연필 러프에서 새로 칠해 바꿀 점 밖도 매번 달라졌다(4a02fe1f "맥락있게 수정이 안 된다").
    const response = await POST(request({ changeNote: 'add raindrops on the window behind her' }))
    expect(response.status).toBe(200)
    expect(mocks.composed).toEqual([REAL])
    expect(mocks.uploads.some((path) => path.endsWith(`${storageKeySegment('sh_01_01')}_storyboard_fix_strip.png`))).toBe(true)
    const sent = submitted()
    expect(sent.reference_image_urls[0]).toMatch(/_storyboard_fix_strip\.png/)
    expect(sent.prompt).toContain('Make ONLY this change: add raindrops on the window behind her')
    expect(sent.prompt).toContain('Keep everything else exactly as it is in the first reference image')
    expect(sent.prompt).toContain('A woman waits on a rainy platform.')
    expect(sent.image_size).toBe('1024x1712')
  })

  it('바꿀 점이 있어도 지금 실사 그림이 없으면 예전처럼 러프 시트로 그리고 바꿀 점을 글 끝에 붙인다', async () => {
    // 왜: 고칠 그림이 없으면 바탕으로 삼을 것이 없다 — 처음 그리기와 같은 길에 바꿀 점만 더한다(지금 동작 그대로).
    db.shots[0]!.storyboard_image = null
    const response = await POST(request({ changeNote: 'add raindrops on the window behind her' }))
    expect(response.status).toBe(200)
    expect(mocks.composed).toEqual([ROUGH])
    expect(submitted().prompt).toBe('ROUGH STRIP PROMPT')
    expect(mocks.stripPrompts[0]).toContain('A woman waits on a rainy platform.\n\nChange from the previous image: add raindrops on the window behind her')
    expect(mocks.falImageSubmit).toHaveBeenCalledTimes(1)
  })

  it('바꿀 점이 없으면 지금처럼 러프 시트로 다시 칠한다', async () => {
    // 왜: 정상 경로 고정 — 글 없는 다시 만들기(같은 설정)는 고치기가 아니다. 그림 지시문은 글자까지 그대로.
    const response = await POST(request({}))
    expect(response.status).toBe(200)
    expect(mocks.composed).toEqual([ROUGH])
    expect(submitted().prompt).toBe('ROUGH STRIP PROMPT')
    expect(mocks.stripPrompts[0]).not.toContain('Change from the previous image')
  })

  it('고친 그림은 바탕 그림이 따른 러프 시각을 이어받는다 — 그 뒤 러프가 바뀌었으면 "러프 바뀜" 표시가 남는다', async () => {
    // 왜: 고친 그림은 지금 그림의 구도를 그대로 잇는다 — 새 러프 시각을 적으면 바뀐 러프를 따르지 않았는데도 표시가 사라진다(약속 I4).
    db.shots[0]!.rough_storyboard = { frames: ROUGH, generatedAt: 5 }
    db.shots[0]!.storyboard_image = { url: REAL.start, status: 'completed', frames: REAL, generatedAt: 2, roughGeneratedAt: 1 }
    await POST(request({ changeNote: 'add raindrops on the window behind her' }))
    expect((mocks.reserved[0]!.target as Record<string, unknown>).roughGeneratedAt).toBe(1)
    mocks.reserved = []
    await POST(request({}))
    expect((mocks.reserved[0]!.target as Record<string, unknown>).roughGeneratedAt).toBe(5)
  })

  it('바꿀 점도 내용 검사에 넣는다', async () => {
    // 왜: 바꿀 점은 사람이 쓴 글이다 — 샷 글처럼 돈이 드는 요청 전에 검사한다.
    await POST(request({ changeNote: 'add raindrops on the window behind her' }))
    expect(mocks.moderated.flat()).toContain('add raindrops on the window behind her')
  })

  it('바꿀 점이 너무 길면(1000자 넘음) 그리기 전에 거절한다', async () => {
    // 왜: 바꿀 점은 한두 문장이다 — 긴 글이 시트 지시문을 밀어내지 않게 하고, 돈이 드는 요청 전에 막는다.
    const response = await POST(request({ changeNote: 'x'.repeat(1001) }))
    expect(response.status).toBe(400)
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
  })
})

describe('Director 에서 고친 글(director_prompt)을 그림 서버가 먼저 쓴다', () => {
  it('샷에 Director 에서 고친 글이 있으면 그림 서버는 화면이 보낸 글 대신 그 글로 그린다 — Storyboard 다시 그리기가 Writer 글을 보내도', async () => {
    // 왜: 리드 2026-11-26 — Storyboard 다시 그리기 · 다른 기기는 Writer 글을 보낸다. 서버가 DB 의 고친 글을 먼저 써야 어디서 만들어도 같은 글이다.
    db.shots[0]!.director_prompt = 'A woman waits on a rainy platform holding a red umbrella.'
    await POST(request({}))
    expect(mocks.stripPrompts[0]).toContain('A woman waits on a rainy platform holding a red umbrella.')
    expect(mocks.reserved[0]!.inputSnapshot).toMatchObject({ prompt_source: 'director_prompt' })
  })

  it('Director 에서 고친 글이 없으면(null) 화면이 보낸 글 그대로 그린다', async () => {
    // 왜: 정상 경로 고정 — 고친 적 없는 샷 · 캔버스 샷은 지금과 같다.
    db.shots[0]!.director_prompt = null
    await POST(request({ prompt: 'A woman waits on a rainy platform at night.' }))
    expect(mocks.stripPrompts[0]).toContain('A woman waits on a rainy platform at night.')
    expect(mocks.reserved[0]!.inputSnapshot).not.toHaveProperty('prompt_source')
  })

  it('Director 화면이 자기 글이라고 알린 요청은 DB 의 고친 글로 바꾸지 않고 보낸 글로 그린다', async () => {
    // 왜: Director 화면은 막 고친 글(저장 전 0.5초 안)을 보낸다 — DB 는 아직 옛 글일 수 있다.
    db.shots[0]!.director_prompt = 'An older edit that is still in the database.'
    await POST(request({ prompt: 'The edit applied a moment ago.', promptSource: 'director' }))
    expect(mocks.stripPrompts[0]).toContain('The edit applied a moment ago.')
    expect(mocks.stripPrompts[0]).not.toContain('An older edit')
    expect(mocks.reserved[0]!.inputSnapshot).not.toHaveProperty('prompt_source')
  })

  it('앞 샷을 Director 에서 고쳤으면 이어짐 줄도 앞 샷의 고친 글을 옮긴다', async () => {
    // 왜: 이어짐 줄("앞 샷은 … 였다")이 옛 Writer 글을 옮기면 고친 앞 샷과 옷 · 소품이 어긋난다.
    db.shots = [
      { ...db.shots[0]!, shot_id: 'sh_01_02', sort_order: 1, scene_id: 'sc_01' },
      { shot_id: 'sh_01_01', sort_order: 0, scene_id: 'sc_01', prompt: 'She buys a ticket.', director_prompt: 'She buys a ticket in a yellow raincoat.', action_description: null },
    ]
    await POST(request({ writerShotId: 'sh_01_02' }))
    expect(mocks.stripPrompts[0]).toContain('the previous shot showed "She buys a ticket in a yellow raincoat."')
  })
})
