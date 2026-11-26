// 이미지 모델 H3 Image 를 고를 수 있고, 고르면 H3 Image 의 fal 칸(가로 × 세로 크기 · 참고 그림 16장 · 글 다시 쓰기 끔)으로 보낸다 — 캔버스 샷은 고른 모델로 실제로 그린다 (오너 2026-11-26 D5)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IMAGE_MODELS, IMAGE_MODEL_ORDER, imageModelSupportsSheetCanvas, isImageModelKey, normalizeImageModelKey, resolveImageEndpoint, resolveSheetImageModel } from '@/lib/image-models'
import { detailImageModel, detailImageModels } from '@/lib/director/shot-detail'
import { buildFalImageInput } from '@/lib/writer/llm/fal'
import { computeIgnoredFields, getAllowedFields } from '@/lib/fal/model-schemas'
import { translate } from '@/lib/i18n/translate'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { resetActionGuard } from '@/lib/action-guard'

const EDIT = 'minimax/h3-image/edit'
const T2I = 'minimax/h3-image/text-to-image'
const REFS = ['https://example.test/strip.png', 'https://example.test/hana.png']

describe('H3 Image 이미지 모델', () => {
  it('이미지 모델 목록에 H3 Image 가 있다', () => {
    // 왜: 오너 2026-11-26 D5 "이미지모델 H3image … 까지 늘려줘" — 목록은 Director 샷 상세 · 노드 보기 에셋 · Artist 인물 · 배경 고르기가 함께 쓴다.
    expect(IMAGE_MODEL_ORDER).toContain('h3-image')
    expect(IMAGE_MODELS['h3-image'].label).toBe('H3 Image')
    expect(isImageModelKey('h3-image')).toBe(true)
    expect(normalizeImageModelKey(EDIT)).toBe('h3-image')
    expect(normalizeImageModelKey(T2I)).toBe('h3-image')
  })

  it('H3 Image 는 참고 그림이 있으면 편집 입구, 없으면 새로 그리기 입구로 보낸다', () => {
    // 왜: 인물 시트 · 러프 시트 같은 참고 그림은 편집 입구(최대 16장)만 받는다.
    expect(resolveImageEndpoint('h3-image', true)).toEqual({ endpoint: EDIT, isEdit: true })
    expect(resolveImageEndpoint('h3-image', false)).toEqual({ endpoint: T2I, isEdit: false })
  })

  it('H3 Image 에는 크기를 가로 × 세로 숫자로 보내고 비율 칸은 보내지 않는다', () => {
    // 왜: H3 Image 는 비율 칸이 없고 크기(image_size)로 정한다. 시트 다시 칠하기는 정한 캔버스(예 1536×896)를 그대로 받아야 칸이 맞는다.
    const sheet = buildFalImageInput({ prompt: 'p', image_size: '1536x896', reference_image_urls: REFS }, EDIT)
    expect(sheet).toEqual({ prompt: 'p', image_urls: REFS, image_size: { width: 1536, height: 896 } })
    const single = buildFalImageInput({ prompt: 'p', aspect_ratio: '16:9' }, T2I)
    expect(single.image_size).toEqual({ width: 2048, height: 1152 })
    expect(single).not.toHaveProperty('aspect_ratio')
  })

  it('H3 Image 요청에는 모델이 받지 않는 칸이 없다', () => {
    // 왜: 다른 모델에 붙는 흐림 방지 문구 · seed · 비율 칸을 H3 에 보내면 fal 이 버리거나 거절한다.
    const edit = buildFalImageInput({ prompt: 'p', aspect_ratio: '9:16', reference_image_urls: REFS, negative_prompt: 'blurry', seed: 7 }, EDIT)
    const t2i = buildFalImageInput({ prompt: 'p', aspect_ratio: '1:1', negative_prompt: 'blurry', seed: 7 }, T2I)
    expect(getAllowedFields(EDIT)).toBeTruthy()
    expect(getAllowedFields(T2I)).toBeTruthy()
    expect(computeIgnoredFields(edit, EDIT)).toEqual([])
    expect(computeIgnoredFields(t2i, T2I)).toEqual([])
  })

  it('H3 Image 새로 그리기는 지시문을 다시 쓰지 않게 보낸다', () => {
    // 왜: 우리 지시문(시트 규칙 · 그림체 절)을 그대로 쓰게 — H3 새로 그리기는 기본이 "다시 쓰기 켬"이다. 편집 입구에는 그 칸이 없다.
    expect(buildFalImageInput({ prompt: 'p', aspect_ratio: '1:1' }, T2I).enable_prompt_expansion).toBe(false)
    expect(buildFalImageInput({ prompt: 'p', reference_image_urls: REFS }, EDIT)).not.toHaveProperty('enable_prompt_expansion')
  })

  it('H3 Image 크기는 비율에 맞춘 약 236만 화소이고, 비율도 크기도 모르면 편집에는 크기를 보내지 않는다', () => {
    // 왜: H3 는 넓이 65.5만 화소 밑을 받지 않는다 — fal 의 16:9 견본 크기(1024×576)는 그 밑이라 쓰지 않는다. 모르면 편집 입구가 첫 그림 비율을 따른다.
    expect(buildFalImageInput({ prompt: 'p', aspect_ratio: '9:16' }, T2I).image_size).toEqual({ width: 1152, height: 2048 })
    expect(buildFalImageInput({ prompt: 'p', aspect_ratio: '1:1' }, T2I).image_size).toEqual({ width: 1536, height: 1536 })
    expect(buildFalImageInput({ prompt: 'p', aspect_ratio: 'horizontal_16:9' }, T2I).image_size).toEqual({ width: 2048, height: 1152 })
    expect(buildFalImageInput({ prompt: 'p', reference_image_urls: REFS }, EDIT)).not.toHaveProperty('image_size')
  })

  it('H3 Image 참고 그림은 16장까지만 싣는다', () => {
    // 왜: fal 스키마(11/26) image_urls 는 16장까지 — 넘치면 요청이 통째로 거절된다. 앞(시트 · 인물)부터 남긴다.
    const many = Array.from({ length: 20 }, (_, i) => `https://example.test/${i}.png`)
    expect(buildFalImageInput({ prompt: 'p', reference_image_urls: many }, EDIT).image_urls).toEqual(many.slice(0, 16))
  })

  it('Writer 샷에서 H3 Image 를 고르면 H3 Image 로 러프 시트를 다시 칠한다', () => {
    // 왜: Writer 샷은 러프 세 장 시트를 정한 크기 그대로 다시 칠하는 길이라 크기를 지키는 모델만 돈다 — H3 Image 는 개발 DB 실측 2/2 그대로(1536×896 · 1024×1536).
    expect(imageModelSupportsSheetCanvas('h3-image')).toBe(true)
    expect(resolveSheetImageModel('h3-image')).toBe('h3-image')
    expect(detailImageModels({ writerShotId: 'sh_01_01' })).toContain('h3-image')
    expect(detailImageModel({ writerShotId: 'sh_01_01', imageModel: 'h3-image' })).toBe('h3-image')
  })

  it('H3 Image 설명 글은 영어 · 한국어 두 말로 있다', () => {
    // 왜: 모델 고르기 창(Artist)은 설명 글을 화면 말로 보인다 — 영어 화면에 한국어가, 한국어 화면에 영어가 나오지 않게.
    const description = IMAGE_MODELS['h3-image'].description
    expect(description).not.toMatch(/[가-힣]/)
    expect(translate('ko', description)).not.toBe(description)
    expect(translate('ko', description)).toMatch(/[가-힣]/)
  })
})

describe('캔버스 샷 이미지 모델', () => {
  const api = () => useDirectorCanvasStore.getState()
  let shotId = ''
  beforeEach(() => {
    resetActionGuard()
    api().reset()
    shotId = api().addShotNode(null, { x: 0, y: 0 }, '직접 추가한 샷')
    api().updateNodeData<'shot'>(shotId, { promptOverride: 'A lighthouse at dusk', imageModel: 'h3-image' })
    useDirectorCanvasStore.setState({ projectId: crypto.randomUUID(), viewMode: 'node' })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('캔버스에서 만든 샷은 이미지 모델 칸에서 고른 모델로 그린다', async () => {
    // 왜: 오너 답 5번 "모델 칸에는 실제로 도는 것만" — 캔버스 샷은 모델 칸에 일곱 모델을 보이면서 요청에는 모델을 싣지 않아 늘 기본(GPT Image 2)으로 그렸다.
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetch)
    void api().generateStoryboardImage(shotId)
    await vi.waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url) === '/api/generate/image')).toBe(true))
    const call = fetch.mock.calls.find(([url]) => String(url) === '/api/generate/image')!
    expect(JSON.parse(String(call[1]!.body))).toMatchObject({ imageModel: 'h3-image', prompt: 'A lighthouse at dusk' })
  })

  it('캔버스 샷에 모델을 고르지 않았으면 지금처럼 모델 없이 보낸다(서버 기본 모델)', async () => {
    // 왜: 정상 경로 고정 — 고르지 않은 샷은 지금 그대로 서버 기본(GPT Image 2)으로 그린다.
    api().updateNodeData<'shot'>(shotId, { imageModel: undefined })
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetch)
    void api().generateStoryboardImage(shotId)
    await vi.waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url) === '/api/generate/image')).toBe(true))
    const call = fetch.mock.calls.find(([url]) => String(url) === '/api/generate/image')!
    expect(JSON.parse(String(call[1]!.body))).not.toHaveProperty('imageModel')
  })
})
