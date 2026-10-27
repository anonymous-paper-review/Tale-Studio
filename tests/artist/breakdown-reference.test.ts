// Artist 브레이크다운 줄에 올린 레퍼런스 그림은 그 인물 · 배경 카드의 그림으로 그대로 쓰고, 그림을 올리지 않은 것만 AI가 그린다 (2026-10-27 오너)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
// 브라우저 저장소 대신 쓰는 가짜 — 초안 저장(producer_draft)은 보낸 값을 그대로 돌려주고, 다른 쓰기는 조용히 성공한다.
vi.mock('@/lib/supabase/client', () => {
  const client = () => ({
    from: () => {
      let row: Record<string, unknown> = {}
      const q: Record<string, unknown> = {}
      q.update = (value: Record<string, unknown>) => { row = value; return q }
      q.eq = () => q
      q.select = () => q
      q.single = async () => ({ data: row, error: null })
      q.maybeSingle = async () => ({ data: { style_anchor_key: 'anime', custom_style_anchor: null }, error: null })
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve)
      return q
    },
  })
  return { createClient: client, createCatalogClient: client }
})
// 서버 렌더(renderToStaticMarkup)는 처음 언어(en)를 읽는다 — 한국어 화면 문구로 확인하려고 t 만 한국어로 고정한다.
vi.mock('@/lib/i18n', async (original) => {
  const actual = await original<typeof import('@/lib/i18n')>()
  return { ...actual, useT: () => (text: string, params?: Record<string, string | number>) => actual.translate('ko', text, params) }
})
// 서버 렌더는 스토어의 처음 값(빈 목록)을 읽는다 — 화면이 지금 값을 읽도록 훅만 지금 값을 고르는 함수로 바꾼다(getState 등은 진짜 스토어).
vi.mock('@/stores/producer-store', async (original) => {
  const actual = await original<typeof import('@/stores/producer-store')>()
  const hook = Object.assign((select: (s: unknown) => unknown) => select(actual.useProducerStore.getState()), actual.useProducerStore)
  return { ...actual, useProducerStore: hook }
})
vi.mock('@/stores/project-store', async (original) => {
  const actual = await original<typeof import('@/stores/project-store')>()
  const hook = Object.assign((select: (s: unknown) => unknown) => select(actual.useProjectStore.getState()), actual.useProjectStore)
  return { ...actual, useProjectStore: hook }
})

import { BreakdownList } from '@/features/artist-room/breakdown-list'
import { resetActionGuard } from '@/lib/action-guard'
import { seriesMakeCounts } from '@/features/series/artist-series'
import { breakdownRows, rowsToDraw } from '@/lib/artist/breakdown'
import { addBreakdownImage, BREAKDOWN_IMAGE_ERROR_TEXT } from '@/lib/artist/breakdown-image'
import { cardsForHandoff } from '@/lib/producer/treatment-cast-sync'
import { stableHash } from '@/lib/stable-hash'
import { translate } from '@/lib/i18n/translate'
import { DOWNSCALE_MAX_EDGE, fitWithin, needsDownscale, UPLOAD_SAFE_BYTES } from '@/lib/upload/downscale'
import { appearingIn, buildSeriesView } from '@/lib/series/view'
import { SERIES_VERSION, type SeriesSnapshot } from '@/lib/series/snapshot'
import { useLocaleStore } from '@/stores/locale-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')
const MEDIA = 'https://example.supabase.co/storage/v1/object/public/media/ws-1/art-project/breakdown'
const MINHO_PICTURE = `${MEDIA}/minho.png`
const HALL_PICTURE = `${MEDIA}/hall.jpg`

let request: ReturnType<typeof vi.fn>
const startBody = () => {
  const call = request.mock.calls.find(([url]) => String(url) === '/api/writer/start')
  return JSON.parse(String((call?.[1] as RequestInit).body)) as {
    cast: { characters: Array<Record<string, unknown>> }
    backgrounds: { locations: Array<Record<string, unknown>> }
  }
}
const pngFile = (name = 'minho.png', bytes = 16) => new File([new Uint8Array(bytes)], name, { type: 'image/png' })
/** 트리트먼트 카드 지문(treatment-cast-sync 와 같은 모양) — 내용이 같으면 손대지 않은 카드다. */
const castHash = (name: string, appearance: string) => stableHash({ name, entityType: 'person', appearance, role: null, arc: null, motivation: null })
const render = () => renderToStaticMarkup(createElement(BreakdownList, { onMake: () => undefined }))
/** testid 가 붙은 단추의 여는 태그 — 꺼짐(disabled) 여부를 본다. */
const buttonTags = (html: string, testId: string) => html.match(new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`, 'g')) ?? []

beforeEach(() => {
  // [만들기] 연타 방어 창(1초)을 테스트마다 비운다.
  resetActionGuard()
  // 산문을 확정했고 아직 [만들기] 전(산문 초안 실행)이다 — 목록을 고칠 수 있다.
  useProjectStore.setState({ projectId: 'art-project', currentStage: 'artist', reachedStage: 'artist', producerLocked: true, treatmentDraft: true })
  useProducerStore.setState({
    storyText: '자판기 앞에서 벌어진 일',
    storyReady: true,
    preserveScript: null,
    styleAnchorKey: 'anime',
    projectSettings: { playtime: 60, genre: '코미디', format: 'horizontal_16:9', tone: [], dialogueLanguage: 'ko' },
    // 트리트먼트가 만들고 아무도 손대지 않은 카드들(지문이 내용과 같다).
    cast: [
      { localId: 'a', characterId: 'minho', name: '민호', entityType: 'person', appearance: '회사원', origin: 'treatment', treatmentHash: castHash('민호', '회사원') },
      { localId: 'b', characterId: 'boss', name: '팀장', entityType: 'person', appearance: '', origin: 'treatment', treatmentHash: castHash('팀장', '') },
    ],
    backgrounds: [{ localId: 'x', locationId: 'hall', name: '회사 복도', visualDescription: '복도', purpose: '', origin: 'treatment', treatmentHash: stableHash({ name: '회사 복도', visualDescription: '복도', purpose: '' }) }],
    error: null,
    syncing: false,
  })
  request = vi.fn(async () => Response.json({ ok: true, sceneGate: false }))
  vi.stubGlobal('fetch', request)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('브레이크다운 레퍼런스 — 카드에 붙이기', () => {
  it('브레이크다운 줄에 레퍼런스 그림을 붙이면 만들기를 누를 때 그 그림을 그대로 쓰라는 표시와 함께 넘긴다', async () => {
    // 왜: 정상 경로 고정 — 오너 "입력한 이미지는 그대로 artist에 사용하면 되". 서버는 이 표시가 있는 그림만 그 카드의 그림으로 바로 적는다.
    useProducerStore.getState().setBreakdownImage('person', 'a', MINHO_PICTURE)
    useProducerStore.getState().setBreakdownImage('background', 'x', HALL_PICTURE)

    expect(await useProducerStore.getState().saveAndHandoff({ artistGate: true })).toBe(true)

    const body = startBody()
    expect(body.cast.characters.find((c) => c.character_id === 'minho')).toMatchObject({ source_image_url: MINHO_PICTURE, source_image_as_is: true })
    expect(body.backgrounds.locations.find((l) => l.location_id === 'hall')).toMatchObject({ source_image_url: HALL_PICTURE, source_image_as_is: true })
  })

  it('레퍼런스 그림을 올리지 않은 카드는 그림 없이 넘겨 지금처럼 AI가 그린다', async () => {
    // 왜: 오너 "이미지가 업로드되지 않은 것이 있다면 우리가 그려주면 되" — 그림이 없는 카드에 그림 표시가 실리면 안 된다.
    useProducerStore.getState().setBreakdownImage('person', 'a', MINHO_PICTURE)
    // 설명만 고친 카드도 넘어간다 — 그 카드에는 그림이 없다.
    useProducerStore.getState().updateCastMember('b', { appearance: '엄한 팀장' })

    await useProducerStore.getState().saveAndHandoff({ artistGate: true })

    const boss = startBody().cast.characters.find((c) => c.character_id === 'boss')
    expect(boss).toMatchObject({ appearance: '엄한 팀장' })
    expect(boss).not.toHaveProperty('source_image_url')
    expect(boss).not.toHaveProperty('source_image_as_is')
  })

  it('트리트먼트가 만든 카드에 그림만 붙였다가 떼면 손대지 않은 카드로 돌아가 넘기지 않는다', () => {
    // 왜: 손대지 않은 트리트먼트 카드는 Writer 가 채운다(2026-10-02). 그림을 뗐는데도 고친 카드로 남으면 빈 목적이 Producer 값으로 굳어 Writer 가 다시 채우지 않는다.
    useProducerStore.getState().setBreakdownImage('background', 'x', HALL_PICTURE)
    expect(cardsForHandoff(useProducerStore.getState()).backgrounds.map((b) => b.localId)).toEqual(['x'])

    useProducerStore.getState().setBreakdownImage('background', 'x', null)

    const hall = useProducerStore.getState().backgrounds[0]
    expect(hall.sourceImageUrl).toBeUndefined()
    expect(hall.sourceImageAsIs).toBeUndefined()
    expect(hall.userEdited).toBeFalsy()
    expect(cardsForHandoff(useProducerStore.getState()).backgrounds).toEqual([])
  })

  it('빈 칸이 있는 트리트먼트 카드에 레퍼런스를 붙여도 만들기가 막히지 않는다', async () => {
    // 왜: 트리트먼트 카드의 빈 칸(팀장 외모 · 복도 목적)은 넘기기를 막지 않는다 — 그림을 붙였다고 필수 칸 검사에 걸리면 [만들기]를 못 누른다.
    useProducerStore.getState().setBreakdownImage('person', 'b', MINHO_PICTURE)
    useProducerStore.getState().setBreakdownImage('background', 'x', HALL_PICTURE)

    expect(await useProducerStore.getState().saveAndHandoff({ artistGate: true })).toBe(true)
    expect(useProducerStore.getState().error).toBeNull()
  })

  it('만들기를 누른 뒤에는 레퍼런스 그림을 붙이거나 뗄 수 없다', () => {
    // 왜: [만들기]는 그때의 목록으로 그림을 만든다 — 그 뒤에 붙인 그림은 어디에도 실리지 않고 사라진다.
    useProducerStore.getState().setBreakdownImage('person', 'a', MINHO_PICTURE)
    useProjectStore.setState({ treatmentDraft: false })

    expect(useProducerStore.getState().setBreakdownImage('person', 'b', HALL_PICTURE)).toBe(false)
    expect(useProducerStore.getState().setBreakdownImage('person', 'a', null)).toBe(false)

    expect(useProducerStore.getState().cast.map((c) => c.sourceImageUrl)).toEqual([MINHO_PICTURE, undefined])
  })

  it('만들기에서 올린 레퍼런스 그림을 붙이지 못했다는 답이 오면 화면 언어로 다시 누르라고 알린다', async () => {
    // 왜: 서버는 올린 그림을 못 적으면 AI 가 대신 그리지 않게 멈춘다(reference_image_failed) — 화면이 영어 진단문을 그대로 보이면 무엇을 할지 모른다.
    request.mockImplementation(async () => Response.json({ error: 'Could not attach the uploaded reference pictures. Please try again.', code: 'reference_image_failed' }, { status: 500 }))
    useProducerStore.getState().setBreakdownImage('person', 'a', MINHO_PICTURE)
    useLocaleStore.setState({ locale: 'ko' })

    try {
      expect(await useProducerStore.getState().saveAndHandoff({ artistGate: true })).toBe(false)
      expect(useProducerStore.getState().error).toBe('올린 레퍼런스 그림을 붙이지 못했어요. 다시 시도해 주세요.')
    } finally {
      useLocaleStore.setState({ locale: 'en' })
    }
  })
})

describe('만들기 창의 수', () => {
  it('레퍼런스 그림을 붙인 줄은 새로 그리는 수에서 빠지고 그대로 쓰는 수로 따로 센다', () => {
    // 왜: 오너 "업로드되지 않은 것만 우리가 그려주면 되" — 올린 줄까지 그리는 수에 넣으면 그 그림을 또 그린다고 읽힌다.
    useProducerStore.getState().setBreakdownImage('person', 'a', MINHO_PICTURE)
    const { cast, backgrounds } = useProducerStore.getState()

    const { draw, asIs } = rowsToDraw(breakdownRows(cast, backgrounds))

    expect(draw.map((row) => row.name)).toEqual(['팀장', '회사 복도'])
    expect(asIs).toBe(1)
    const dialog = read('src/features/artist-room/style-make-dialog.tsx')
    expect(dialog).toMatch(/rowsToDraw\(/)
    expect(dialog).toMatch(/data-testid="artist-make-as-is"[\s\S]*?t\('Reference'\)[\s\S]*?t\('Used as is \{count\}', \{ count: asIs \}\)/)
    expect(translate('ko', 'Reference')).toBe('레퍼런스')
  })

  it('채팅에서 붙인 인물 그림은 시트를 새로 그리니 그리는 수에 남고, 배경에 붙은 그림은 그대로 쓰는 수에 든다', () => {
    // 왜: 넘길 때 서버가 하는 일(#image-to-artist 2026-09-17)과 창의 숫자가 같아야 한다 — 인물은 그 그림을 따라 시트를 새로 그리고, 배경은 그 그림이 그대로 와이드샷이 된다.
    const rows = breakdownRows(
      [{ localId: 'c', name: '코마츠', entityType: 'person', appearance: '', sourceImageUrl: MINHO_PICTURE }],
      [{ localId: 'y', name: '교실', visualDescription: '', sourceImageUrl: HALL_PICTURE }],
    )

    expect(rows.map((row) => [row.name, row.imageUrl, row.imageAsIs])).toEqual([
      ['코마츠', MINHO_PICTURE, false],
      ['교실', HALL_PICTURE, true],
    ])
    expect(rowsToDraw(rows).draw.map((row) => row.name)).toEqual(['코마츠'])
  })

  it('시리즈 다음 화에서 이어받은 줄에 레퍼런스를 붙이면 앞 화 그림 수가 아니라 그대로 쓰는 수로 센다', () => {
    // 왜: 올린 그림이 앞 화 그림보다 먼저 적힌다(사람이 이 화에서 올린 그림이 이긴다, 2026-10-26) — 앞 화 그림을 그대로 쓴다고 세면 다른 그림이 나온다고 오해한다.
    const series: SeriesSnapshot = {
      version: SERIES_VERSION, prevProjectId: 'prev-1', prevTitle: '첫 화', copiedAt: '2026-10-27T00:00:00.000Z',
      characters: ['mina', 'junho'].map((id) => ({ characterId: id, name: id, role: 'supporting', appearance: '', personality: [], sheetUrl: `https://img.test/${id}.webp`, portraitUrl: null, styleId: 'jp_anime' })),
      locations: [], voices: [], styleId: 'jp_anime', format: null, dialogueLanguage: null, continuesLastScene: false, copyFailures: [], designTokens: null, world: null,
    }
    const view = buildSeriesView({ series, prevProjectId: 'prev-1', prevDeleted: false, currentStyleId: 'jp_anime', appearance: appearingIn({ scenes: { scenes: [{ characters_in_scene: ['mina', 'junho'], location: 'cafe' }] } }) })
    const rows = breakdownRows(
      [
        { localId: 'series:mina', characterId: 'mina', name: '미나', entityType: 'person', appearance: '', sourceImageUrl: MINHO_PICTURE, sourceImageAsIs: true },
        { localId: 'series:junho', characterId: 'junho', name: '준호', entityType: 'person', appearance: '' },
      ],
      [],
    )

    const { draw, asIs } = rowsToDraw(rows)

    expect(asIs).toBe(1)
    expect(seriesMakeCounts(draw, view, 'jp_anime')).toEqual({ newPersons: 0, newPlaces: 0, reuse: 1, redraw: 0, kept: 0 })
  })
})

describe('브레이크다운 줄 화면', () => {
  it('레퍼런스가 없는 줄에는 레퍼런스 올리기 칸이, 붙은 줄에는 작은 그림과 빼기 단추가 보인다', () => {
    // 왜: 프로토타입 A1 — 줄마다 설명 아래 "레퍼런스" 칸. 한 줄에 그림은 하나라 붙으면 올리기 칸 대신 그 그림과 빼기 단추가 보인다.
    useProducerStore.getState().setBreakdownImage('person', 'a', MINHO_PICTURE)

    const html = render()

    expect(html.match(/>레퍼런스</g)).toHaveLength(3)
    expect(buttonTags(html, 'breakdown-image-add')).toHaveLength(2)
    expect(buttonTags(html, 'breakdown-image-thumb')).toHaveLength(1)
    expect(buttonTags(html, 'breakdown-image-remove')).toHaveLength(1)
    expect(buttonTags(html, 'breakdown-image-add')[0]).toMatch(/aria-label="레퍼런스 이미지 올리기"/)
    expect(buttonTags(html, 'breakdown-image-remove')[0]).toMatch(/aria-label="레퍼런스 빼기"/)
    expect(html).toContain(MINHO_PICTURE)
  })

  it('레퍼런스가 붙은 줄은 그 그림을 그대로 쓴다고 알리고, 채팅에서 붙인 인물 그림은 시트가 그 그림을 따라 만들어진다고 알린다', () => {
    // 왜: 같은 칸에 보여도 쓰임이 다르다 — 그대로 쓰는 그림인지 시트를 새로 그리는 출처인지 줄에서 알아야 한다.
    useProducerStore.setState((s) => ({
      cast: [
        { ...s.cast[0], sourceImageUrl: MINHO_PICTURE, sourceImageAsIs: true },
        { ...s.cast[1], sourceImageUrl: `${MEDIA}/boss.png` },
      ],
    }))

    const html = render()

    expect(html).toContain('그대로 써요')
    expect(html).toContain('시트는 이 그림을 따라 만들어요')
  })

  it('만들기를 누른 뒤처럼 목록을 고칠 수 없으면 레퍼런스 올리기 · 바꾸기 · 빼기 단추가 꺼진다', () => {
    // 왜: 고칠 수 없는 동안 단추가 살아 있으면 올린 그림이 조용히 버려진다.
    useProducerStore.getState().setBreakdownImage('person', 'a', MINHO_PICTURE)
    expect(buttonTags(render(), 'breakdown-image-add').every((tag) => !/disabled=""/.test(tag))).toBe(true)

    useProjectStore.setState({ treatmentDraft: false })
    const html = render()

    for (const id of ['breakdown-image-add', 'breakdown-image-thumb', 'breakdown-image-remove']) {
      expect(buttonTags(html, id).length).toBeGreaterThan(0)
      expect(buttonTags(html, id).every((tag) => /disabled=""/.test(tag))).toBe(true)
    }
  })

  it('레퍼런스 그림을 올리는 동안에는 목록이 맞아요 · 그림 만들기 단추가 꺼진다', () => {
    // 왜: 올리기가 끝나기 전에 만들기가 나가면 그 그림은 실리지 않고 AI 가 그린다.
    const list = read('src/features/artist-room/breakdown-list.tsx')
    expect(list).toMatch(/onBusyChange=\{/)
    expect(list).toMatch(/disabled=\{rows\.length === 0 \|\| uploading > 0\}[^>]*data-testid="breakdown-make"/)
  })

  it('목록 위에 레퍼런스로 올린 그림은 그대로 쓰고 나머지는 AI가 그린다는 안내가 보인다', () => {
    // 왜: 오너 요청의 두 문장을 화면이 그대로 말해야 사람이 무엇을 올릴지 정한다.
    expect(render()).toContain('레퍼런스로 올린 그림은 그 카드의 그림으로 그대로 써요. 나머지는 AI가 그려요.')
  })
})

describe('레퍼런스 그림 올리기', () => {
  const target = { projectId: 'art-project', kind: 'person' as const, localId: 'a' }

  it('JPG · PNG · WebP 가 아닌 파일을 고르면 권리 확인 창을 띄우지 않고 그림 파일을 고르라고 알린다', async () => {
    // 왜: 받을 수 없는 파일로 권리 확인부터 받으면 확인한 뒤에야 거절된다.
    const confirm = vi.fn(async () => true)
    const upload = vi.fn()

    const result = await addBreakdownImage(target, new File(['x'], 'minho.gif', { type: 'image/gif' }), { confirm, upload })

    expect(result).toEqual({ status: 'error', error: 'not_image' })
    expect(confirm).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
    expect(translate('ko', BREAKDOWN_IMAGE_ERROR_TEXT.not_image)).toBe('JPG · PNG · WebP 그림을 골라 주세요.')
  })

  it('올리기 전에 그림 사용 권리를 확인하고, 확인하지 않으면 올리지 않는다', async () => {
    // 왜: 채팅 · 그림체 올리기와 같은 동의 창 — 동의 없이 남의 그림이나 얼굴이 보관함에 올라가면 안 된다.
    const confirm = vi.fn(async () => false)
    const upload = vi.fn()
    const file = pngFile()

    const result = await addBreakdownImage(target, file, { confirm, upload })

    expect(confirm).toHaveBeenCalledWith([file])
    expect(result).toEqual({ status: 'cancelled' })
    expect(upload).not.toHaveBeenCalled()
    expect(useProducerStore.getState().cast[0].sourceImageUrl).toBeUndefined()
  })

  it('올리는 동안 그 줄을 올리는 중으로 두고, 다 올리면 그 그림을 줄에 붙인다', async () => {
    // 왜: 정상 경로 고정 — 올리는 중 표시가 [만들기]를 막고, 끝나면 그 줄의 카드가 그림을 갖는다.
    const busy: boolean[] = []
    const upload = vi.fn(async () => {
      expect(busy).toEqual([true])
      return { url: MINHO_PICTURE }
    })

    const result = await addBreakdownImage(target, pngFile(), { confirm: async () => true, upload, onBusy: (value) => busy.push(value) })

    expect(result).toEqual({ status: 'attached', url: MINHO_PICTURE })
    expect(busy).toEqual([true, false])
    expect(useProducerStore.getState().cast[0]).toMatchObject({ sourceImageUrl: MINHO_PICTURE, sourceImageAsIs: true })
  })

  it('올리기에 실패하면 그 줄에 이유를 남기고 그림은 붙이지 않는다', async () => {
    // 왜: 실패를 숨기면 사람은 그림이 붙은 줄 알고 [만들기]를 누르고, AI 가 그린 그림을 받는다.
    request.mockImplementation(async () => Response.json({ error: 'Could not read this picture.', code: 'invalid_image' }, { status: 400 }))
    const unreadable = await addBreakdownImage(target, pngFile(), { confirm: async () => true })
    request.mockImplementation(async () => new Response('Request Entity Too Large', { status: 413 }))
    const tooLarge = await addBreakdownImage(target, pngFile(), { confirm: async () => true })
    request.mockImplementation(async () => Response.json({ error: 'Upload failed' }, { status: 500 }))
    const failed = await addBreakdownImage(target, pngFile(), { confirm: async () => true })

    expect([unreadable, tooLarge, failed]).toEqual([
      { status: 'error', error: 'unreadable' },
      { status: 'error', error: 'too_large' },
      { status: 'error', error: 'failed' },
    ])
    expect(request.mock.calls.every(([url]) => String(url) === '/api/artist/breakdown-image')).toBe(true)
    expect(useProducerStore.getState().cast[0].sourceImageUrl).toBeUndefined()
    // 이유는 화면 언어로 보인다.
    for (const key of Object.values(BREAKDOWN_IMAGE_ERROR_TEXT)) expect(translate('ko', key)).not.toBe(key)
  })

  it('4MB 를 넘는 그림은 긴 변 2048px 로 줄여서 올리고 그보다 작은 그림은 그대로 올린다', async () => {
    // 왜: Vercel 이 4.5MB 넘는 요청을 함수가 돌기 전에 거절한다 — 큰 사진을 그대로 보내면 이유도 모른 채 실패한다.
    expect(UPLOAD_SAFE_BYTES).toBe(4 * 1024 * 1024)
    expect(DOWNSCALE_MAX_EDGE).toBe(2048)
    expect(needsDownscale(UPLOAD_SAFE_BYTES)).toBe(false)
    expect(needsDownscale(UPLOAD_SAFE_BYTES + 1)).toBe(true)
    expect(fitWithin(4000, 3000, DOWNSCALE_MAX_EDGE)).toEqual({ width: 2048, height: 1536 })
    expect(fitWithin(1200, 6000, DOWNSCALE_MAX_EDGE)).toEqual({ width: 410, height: 2048 })
    expect(fitWithin(1000, 800, DOWNSCALE_MAX_EDGE)).toEqual({ width: 1000, height: 800 })

    const small = pngFile('small.png', 1024)
    const big = pngFile('big.png', UPLOAD_SAFE_BYTES + 1)
    const shrunk = new File([new Uint8Array(1024)], 'big.jpg', { type: 'image/jpeg' })
    const shrink = vi.fn(async () => shrunk)
    const upload = vi.fn(async () => ({ url: MINHO_PICTURE }))

    await addBreakdownImage(target, small, { confirm: async () => true, upload, shrink })
    await addBreakdownImage(target, big, { confirm: async () => true, upload, shrink })

    expect(shrink).toHaveBeenCalledTimes(1)
    expect(shrink).toHaveBeenCalledWith(big)
    expect(upload.mock.calls.map((call) => (call as unknown[])[1])).toEqual([small, shrunk])
  })
})
