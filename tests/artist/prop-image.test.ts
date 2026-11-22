// 소품 그림 — 소품마다 작품 그림체로 물건 하나만 그린 그림 한 장(Take 없음)을 그리고, 다 그린 그림은 소품 행에 남으며, 카드는 그리기 · 실패 · 설명 바뀜 · 그림체 바뀜을 보인다 (D7, 오너 2026-11-22)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ updates: [] as Array<{ table: string; values: Record<string, unknown>; filters: Array<[string, unknown]> }>, completed: [] as Array<[string, string]> }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const entry = { table, values: {} as Record<string, unknown>, filters: [] as Array<[string, unknown]> }
      const chain: Record<string, unknown> = {}
      chain.update = (values: Record<string, unknown>) => { entry.values = values; db.updates.push(entry); return chain }
      chain.eq = (column: string, value: unknown) => { entry.filters.push([column, value]); return chain }
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve)
      return chain
    },
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: (path: string) => ({ data: { publicUrl: `https://media.test/${path}` } }) }) },
  },
}))
vi.mock('@/lib/storage-thumb', () => ({ uploadThumbnail: async () => {} }))
vi.mock('@/lib/generation-jobs', () => ({
  completeGenerationJob: async (id: string, url: string) => { db.completed.push([id, url]) },
  failGenerationJob: vi.fn(),
  patchGenerationJobResponseSnapshotByRequestId: vi.fn(),
  GenerationJobTerminalTransitionError: class GenerationJobTerminalTransitionError extends Error {},
}))
vi.mock('@/lib/fal/observability', () => ({ buildFalResponseSnapshot: () => ({}) }))
vi.mock('@/lib/generation-jobs-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs-client')>()),
  pollGenerationJob: async () => 'https://media.test/new-ring.png',
}))

import { finalizeGenerationJob } from '@/lib/fal/finalize'
import { buildPropImagePrompt, propImageStale, propImageStamp, PROP_TEXT_RULE } from '@/lib/artist/prop-image'
import { planPropImageSubmit } from '@/lib/artist/prop-image-plan'
import { IMAGE_JOB_KINDS, VIDEO_JOB_KINDS } from '@/lib/generation-quota'
import { LANE_OF_KIND } from '@/lib/generation-batches'
import { FACET_NO_TEXT } from '@/lib/style-facets/no-text'
import { PropPanel } from '@/features/artist/prop-panel'
import { PropDetailPanels } from '@/features/artist/prop-view-dialog'
import { useProjectStore } from '@/stores/project-store'
import { useArtistStore } from '@/stores/artist-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProducerStore } from '@/stores/producer-store'
import type { ResolvedStyleAnchor } from '@/lib/style-anchor'
import type { PropAsset } from '@/types'
import type { GenerationJob } from '@/lib/generation-jobs'

const anchor = {
  key: 'jp_anime', imageUrl: 'https://anchor.test/jp.png', previewUrl: null, usePreviewRef: false, styleClause: null, anchorKind: 'media',
  facets: { probeAnchors: 'clean cel shading', figure: 'slender figures with tall almond eyes', priority: 'Priority order: identity first', negative: 'Avoid photographic texture.' },
} as unknown as ResolvedStyleAnchor
const prop = { name: '은반지', appearance: 'a thin silver ring with a small blue stone' }
const asset = (over: Partial<PropAsset> = {}): PropAsset => ({ propId: 'obj_ring', name: '은반지', appearance: prop.appearance, appearanceNative: '작은 파란 돌이 박힌 가는 은반지', imageUrl: null, sourceHash: null, origin: 'producer', ...over })
function seed<T extends object>(store: { setState: (s: Partial<T>) => void; getInitialState: () => T }, state: Partial<T>) {
  store.setState(state)
  Object.assign(store.getInitialState(), state)
}
const artistInitial = { ...useArtistStore.getInitialState() }
const producerInitial = { ...useProducerStore.getInitialState() }
const projectInitial = { ...useProjectStore.getInitialState() }
beforeEach(() => {
  db.updates.length = 0
  db.completed.length = 0
  seed(useLocaleStore, { locale: 'ko' })
  seed(useProducerStore, { styleAnchorKey: 'jp_anime', customStyleAnchor: null })
})
afterEach(() => {
  seed(useArtistStore, { propAssets: artistInitial.propAssets, propUsage: artistInitial.propUsage, generatingProps: artistInitial.generatingProps, propFailures: artistInitial.propFailures })
  seed(useProducerStore, { styleAnchorKey: producerInitial.styleAnchorKey, customStyleAnchor: producerInitial.customStyleAnchor })
  seed(useProjectStore, { projectId: projectInitial.projectId })
  seed(useLocaleStore, { locale: 'en' })
})

describe('소품 그림 지시문', () => {
  // 왜: 혼자 정한 것 — 실사 샷 이미지의 참고 그림으로 쓸 때 물건만 또렷하고 사람이 섞이지 않게. 오너 "소품도 한 장"(여러 각도 시트가 아니다).
  it('소품 그림은 물건 하나만 정면으로 빈 배경에 그리고, 사람 · 손 · 글자는 그리지 않는다', () => {
    const text = buildPropImagePrompt(prop)
    expect(text).toContain('은반지')
    expect(text).toContain('a thin silver ring with a small blue stone')
    expect(text).toMatch(/alone/i)
    expect(text).toMatch(/front/i)
    expect(text).toMatch(/plain neutral background/i)
    for (const word of ['No people', 'no hands', 'no text']) expect(text).toContain(word)
  })

  // 왜: 오너 결정 대기(리드 2026-11-22 "(c)") — 글씨가 뜻을 나르는 소품(편지 · 간판 · 책 표지)은 글씨를 빼면 다른 물건이 된다(실측: 번진 잉크 글씨 편지 → 글씨 없는 봉투).
  //   스위치 하나로 (b)를 켜 볼 수 있게 하고, 기본은 지금처럼 글자 없음 (a). 켜도 모델이 덧붙이는 이름 · 라벨 · 로고 · 워터마크는 계속 막는다.
  it('글씨 스위치는 기본으로 꺼져 있고, 켜면 설명에 적힌 글씨만 남기고 덧붙인 이름 · 라벨 · 로고는 그리지 않는다', () => {
    expect(PROP_TEXT_RULE).toBe('none')
    expect(buildPropImagePrompt(prop)).toBe(buildPropImagePrompt({ ...prop, textRule: 'none' }))
    const described = buildPropImagePrompt({ ...prop, textRule: 'described' })
    expect(described).not.toContain('no text,')
    expect(described).toMatch(/Writing that the description says is on the object stays on it/)
    for (const word of ['No people', 'no hands', 'no labels', 'no logo', 'no watermark']) expect(described).toContain(word)
    // 기준 그림 없이 그리는 그림체(실사)도 켰을 때는 글자 금지 줄을 붙이지 않는다 — 꺼져 있으면 지금처럼 붙인다.
    expect(planPropImageSubmit({ ...prop, anchor: null, styleWithoutReference: true, textRule: 'described' }).submit.prompt).not.toContain(FACET_NO_TEXT)
    expect(planPropImageSubmit({ ...prop, anchor: null, styleWithoutReference: true }).submit.prompt).toContain(FACET_NO_TEXT)
  })

  // 왜: 첫 시험(2026-11-22)에서 스위치를 켜도 그림체 줄(그림체 조각)이 끝에 "No text, no letters"를 붙여, 글씨만 적고 낱말은 적지 않은 "펼친 편지"가 빈 종이로 나왔다.
  //   인물 시트가 칸 이름 때문에 그 줄을 빼는 것과 같은 까닭으로 — 켰을 때만 뺀다(덧붙인 글씨 금지는 소품 줄에 그대로 있다). 끄면(기본) 지금처럼 붙는다.
  it('글씨 스위치를 켜면 그림체 기준 그림이 있는 그림체에서도 그림체 줄의 글자 금지가 설명의 글씨를 막지 않는다', () => {
    const on = planPropImageSubmit({ ...prop, anchor, styleWithoutReference: false, textRule: 'described' })
    expect(on.submit.prompt).not.toContain(FACET_NO_TEXT)
    expect(on.submit.prompt).toMatch(/Writing that the description says is on the object stays on it/)
    expect(on.submit.prompt).toContain('no logo and no watermark')
    const off = planPropImageSubmit({ ...prop, anchor, styleWithoutReference: false })
    expect(off.submit.prompt).toContain(FACET_NO_TEXT)
  })

  // 왜: 작품 그림체와 같은 그림이어야 샷 이미지에서 겉돌지 않는다. 소품에는 사람이 없어 인물 조각(Figure rules · Priority)은 효과가 없다(사물 시트 규칙과 같다).
  it('그림체 기준 그림이 있으면 소품 그림에 붙이되 인물 조각은 싣지 않는다', () => {
    const plan = planPropImageSubmit({ ...prop, anchor, styleWithoutReference: false })
    expect(plan.submit.reference_image_urls).toEqual(['https://anchor.test/jp.png'])
    expect(plan.submit.prompt).toContain('clean cel shading')
    expect(plan.submit.prompt).not.toContain('slender figures')
    expect(plan.submit.prompt).not.toContain('Priority order')
    expect(plan.submit.aspect_ratio).toBe('1:1')
    expect(plan.model).toBe('openai/gpt-image-2/edit')
  })

  // 왜: 실사는 기준 그림 없이 그린다(2026-10-13 오너) — 배경과 같이 글자 금지 줄을 붙이고 크기로 비율을 정한다.
  it('기준 그림 없이 그리는 그림체(실사)는 소품 그림도 기준 그림 없이 정사각으로 그린다', () => {
    const plan = planPropImageSubmit({ ...prop, anchor: null, styleWithoutReference: true })
    expect(plan.submit.reference_image_urls).toBeUndefined()
    expect(plan.submit.prompt).toContain(FACET_NO_TEXT)
    expect(plan.submit.image_size).toBe('square_hd')
    expect(plan.model).toBe('openai/gpt-image-2')
  })

  // 왜: 카드 · 채팅의 [다시 그리기]에 바꿀 점을 적으면 그 말이 그림에 닿아야 한다(인물 다시 그리기 instruction 과 같다).
  it('바꿀 점을 적어 다시 그리면 그 말을 지시문에 넣는다', () => {
    expect(buildPropImagePrompt({ ...prop, instruction: '돌을 빨간색으로' })).toContain('Requested change: 돌을 빨간색으로')
  })

  // 왜: 정책 거절 뒤 사람이 "안전하게 다시"를 누르면 배경과 같은 순화 문구를 붙인다(약속 B9 와 같은 규칙).
  it('정책 거절 뒤 안전하게 다시 그리면 순화 문구를 붙인다', () => {
    expect(buildPropImagePrompt({ ...prop, safeMode: true })).toMatch(/safe-for-work|non-graphic/i)
  })
})

describe('소품 그림 비용 · 저장', () => {
  // 왜: 기존 약속 — Take 는 영상 전용, 그림은 무과금(take-cost.ts). 소품 그림도 인물 · 배경 그림처럼 사람당 그림 동시 자리만 쓴다.
  it('소품 그림은 Take 를 쓰지 않고 그림 동시 자리만 쓴다', () => {
    expect(IMAGE_JOB_KINDS).toContain('prop_image')
    expect(VIDEO_JOB_KINDS).not.toContain('prop_image')
    expect(LANE_OF_KIND.prop_image).toBe('artist')
    expect(readFileSync('src/app/api/artist/generate-prop/route.ts', 'utf8')).not.toMatch(/take-hold|takeHold|holdTake/)
  })

  // 왜: 다 그린 그림을 화면이 아니라 서버가 소품 행에 적어야 화면을 떠나도 · 새로고침해도 남는다(인물 · 배경 그림과 같다).
  it('다 그려지면 그림이 소품 행에 저장되어 새로고침해도 그대로다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(Buffer.alloc(20_000))))
    const job = { id: 'job-1', project_id: 'project-1', kind: 'prop_image', target: { workspaceId: 'ws-1', propId: 'obj_ring' }, input_snapshot: { source_hash: 'p1:abc:jp_anime' } } as unknown as GenerationJob
    const url = await finalizeGenerationJob(job, { media: 'image', url: 'https://fal.test/out.png', payload: {} })
    expect(url).toContain('ws-1/project-1/props/')
    const update = db.updates.find((entry) => entry.table === 'props')
    expect(update?.values).toEqual({ image_url: url, source_hash: 'p1:abc:jp_anime' })
    expect(update?.filters).toEqual([['project_id', 'project-1'], ['prop_id', 'obj_ring']])
    expect(db.completed).toEqual([['job-1', url]])
    vi.unstubAllGlobals()
  })
})

describe('소품 카드의 그림 상태', () => {
  // 왜: 그림이 없는 소품은 사람이 바로 그릴 수 있어야 한다. 그리는 중에는 단추를 숨겨 두 번 그리지 않게 한다.
  it('소품 그림이 없으면 카드에 [그리기]가 보이고, 그리는 중에는 숨는다', () => {
    seed(useArtistStore, { propAssets: [asset()], propUsage: {}, generatingProps: [], propFailures: {} })
    expect(renderToStaticMarkup(createElement(PropPanel, { columns: 2 }))).toContain('data-testid="artist-prop-draw"')
    seed(useArtistStore, { generatingProps: ['obj_ring'] })
    const drawing = renderToStaticMarkup(createElement(PropPanel, { columns: 2 }))
    expect(drawing).not.toContain('data-testid="artist-prop-draw"')
  })

  // 왜: 배경 카드와 같은 표시(약속 B8) — 실패를 알리고 그 자리에서 다시 그리게 한다.
  it('그림이 실패하면 카드에 "이미지 실패"와 [다시 그리기]가 보인다', () => {
    seed(useArtistStore, { propAssets: [asset()], propUsage: {}, generatingProps: [], propFailures: { obj_ring: { error: 'failed', moderation: false, failCount: 1, safeFailCount: 0 } } })
    const html = renderToStaticMarkup(createElement(PropPanel, { columns: 2 }))
    expect(html).toContain('이미지 실패')
    expect(html).toContain('data-testid="artist-prop-redraw"')
  })

  // 왜: 배경 카드와 같다(약속 B7) — 생김새를 고쳤는데 그림은 예전 생김새면 다시 그려야 한다는 것을 알게.
  it('생김새를 고친 뒤 다시 그리기 전이면 "설명 바뀜"이 보인다', () => {
    expect(propImageStale(propImageStamp('old look', 'jp_anime'), 'new look', 'jp_anime')).toBe('edited')
    seed(useArtistStore, { propAssets: [asset({ imageUrl: 'https://media.test/ring.png', sourceHash: propImageStamp('old look', 'jp_anime') })], propUsage: {}, generatingProps: [], propFailures: {} })
    expect(renderToStaticMarkup(createElement(PropPanel, { columns: 2 }))).toContain('설명 바뀜')
  })

  // 왜: 리드 결정 3(혼자 정한 것) — 작품 그림체를 바꿔 [재생성하기] 해도 소품은 함께 다시 그리지 않는다(작품 스타일 기록을 바꾸지 않는다). 대신 그림체가 바뀐 것을 알리고 그 자리에서 다시 그린다.
  it('작품 그림체가 바뀐 뒤 다시 그리기 전이면 "그림체 바뀜"과 [다시 그리기]가 보인다', () => {
    expect(propImageStale(propImageStamp(prop.appearance, 'watercolor'), prop.appearance, 'jp_anime')).toBe('style')
    seed(useArtistStore, { propAssets: [asset({ imageUrl: 'https://media.test/ring.png', sourceHash: propImageStamp(prop.appearance, 'watercolor') })], propUsage: {}, generatingProps: [], propFailures: {} })
    const html = renderToStaticMarkup(createElement(PropPanel, { columns: 2 }))
    expect(html).toContain('그림체 바뀜')
    expect(html).toContain('data-testid="artist-prop-redraw"')
  })

  // 왜: 정상 경로 고정 — 지금 생김새 · 지금 그림체로 그린 그림, 그리고 지문이 없는 그림(사람이 올린 그림 · 예전 그림)은 바뀜 표시가 없다.
  it('지금 생김새 · 그림체로 그린 그림과 사람이 올린 그림에는 바뀜 표시가 없다', () => {
    expect(propImageStale(propImageStamp(prop.appearance, 'jp_anime'), prop.appearance, 'jp_anime')).toBe('fresh')
    expect(propImageStale(null, prop.appearance, 'jp_anime')).toBe('fresh')
    seed(useArtistStore, { propAssets: [asset({ imageUrl: 'https://media.test/ring.png', sourceHash: propImageStamp(prop.appearance, 'jp_anime') })], propUsage: {}, generatingProps: [], propFailures: {} })
    const html = renderToStaticMarkup(createElement(PropPanel, { columns: 2 }))
    expect(html).not.toContain('바뀜')
    expect(html).not.toContain('data-testid="artist-prop-draw"')
  })
})

describe('소품 그림 창', () => {
  // 왜: 인물 · 배경 카드와 같다(프로토타입 A7) — 그림을 누르면 큰 그림과 생김새 · 바꿀 점 · [다시 그리기]가 있는 창이 열린다.
  it('소품 그림을 누르면 큰 그림과 생김새 · 바꿀 점 · [다시 그리기]가 있는 창이 열린다', () => {
    seed(useArtistStore, { propAssets: [asset({ imageUrl: 'https://media.test/ring.png', sourceHash: propImageStamp(prop.appearance, 'jp_anime') })], propUsage: { obj_ring: { scenes: 1, shots: 3 } }, generatingProps: [], propFailures: {} })
    const html = renderToStaticMarkup(createElement(PropDetailPanels, { propId: 'obj_ring' }))
    expect(html).toContain('https://media.test/ring.png')
    expect(html).toContain('작은 파란 돌이 박힌 가는 은반지')
    expect(html).toContain('data-testid="prop-detail-instruction"')
    expect(html).toContain('data-testid="prop-detail-redraw"')
    expect(html).toContain('씬 1 · 샷 3에 나와요')
    expect(readFileSync('src/features/artist/prop-panel.tsx', 'utf8')).toMatch(/<PropViewDialog/)
  })

  // 왜: 생김새(원천)를 고치는 것과 그림을 새로 그리는 것은 다르다(인물 · 배경과 같다) — 고친 생김새는 저장하고, 그림은 [다시 그리기] 전까지 그대로 "설명 바뀜"이다.
  it('창에서 생김새를 고쳐 적용하면 소품 생김새가 바뀌고 그림은 그대로다', async () => {
    seed(useProjectStore, { projectId: 'project-1' })
    seed(useArtistStore, { propAssets: [asset({ imageUrl: 'https://media.test/ring.png' })], propUsage: {}, generatingProps: [], propFailures: {} })
    const calls: Array<{ url: string; body: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body ?? '{}')) })
      return new Response(JSON.stringify({ ok: true, appearance: 'a thick gold ring', appearanceNative: '두꺼운 금반지' }), { status: 200 })
    }))
    await useArtistStore.getState().updatePropAppearance('obj_ring', '두꺼운 금반지')
    expect(calls[0]).toEqual({ url: '/api/artist/appearance', body: { projectId: 'project-1', characterId: 'obj_ring', appearance: '두꺼운 금반지' } })
    expect(useArtistStore.getState().propAssets[0]).toMatchObject({ appearance: 'a thick gold ring', appearanceNative: '두꺼운 금반지', imageUrl: 'https://media.test/ring.png' })
    vi.unstubAllGlobals()
  })

  // 왜: 카드 · 창의 [다시 그리기]에 적은 바꿀 점이 그리기 창구까지 간다(인물 다시 그리기 instruction 과 같다). 그리는 동안은 그리는 중으로 센다.
  it('바꿀 점을 적어 [다시 그리기]를 누르면 그 말로 다시 그린다', async () => {
    seed(useProjectStore, { projectId: 'project-1' })
    seed(useArtistStore, { propAssets: [asset({ imageUrl: 'https://media.test/ring.png' })], propUsage: {}, generatingProps: [], propFailures: {} })
    const posted: Array<Record<string, unknown>> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/artist/generate-prop') {
        posted.push(JSON.parse(String(init?.body ?? '{}')))
        return new Response(JSON.stringify({ ok: true, jobId: 'job-9', status: 'queued' }), { status: 200 })
      }
      return new Response(JSON.stringify({}), { status: 200 })
    }))
    const run = useArtistStore.getState().generateProp('obj_ring', 'ui', { instruction: '돌을 빨간색으로' })
    expect(useArtistStore.getState().generatingProps).toEqual(['obj_ring'])
    await run
    expect(posted).toEqual([{ projectId: 'project-1', propId: 'obj_ring', actor: 'ui', instruction: '돌을 빨간색으로' }])
    expect(useArtistStore.getState().generatingProps).toEqual([])
    vi.unstubAllGlobals()
  })
})
