// 약속 C — 새 모습은 카드에서도 채팅에서도 만들 수 있고 기본 모습을 참조해서 그려진다 (_tdd.md C, 2026-09-04 오너 확정)
//
//   오너 결정: C4 새 모습은 만든 직후 이미지를 자동 생성한다(2안). C8 지우기·이름 바꾸기·기본 지정까지(1안).
//   탭 모양은 같은 카드 안 탭(1안). 문장 하나 = 테스트 하나. 화면 모양은 스크린샷으로 검수한다.
//   열 번째(배경도 같은 모습 탭)는 별도 파일(promise-c-location-appearances)에서 다룬다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  requireProjectAccess: vi.fn(),
  appearanceI18nFields: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.requireProjectAccess }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ appearanceI18nFields: mocks.appearanceI18nFields }))
// 스토어가 끌어오는 브라우저 supabase 클라이언트 — 이 파일의 스토어 테스트는 fetch 만 쓴다.
vi.mock('@/lib/supabase/client', () => {
  const chain: Record<string, unknown> = {}
  for (const m of ['from', 'select', 'insert', 'update', 'upsert', 'eq', 'in', 'single', 'maybeSingle', 'order']) chain[m] = () => chain
  ;(chain as { then: (resolve: (value: unknown) => unknown) => unknown }).then = (resolve) => resolve({ data: null, error: null })
  return { createClient: () => chain }
})

import { PATCH, DELETE } from '@/app/api/artist/character-appearance/route'
import { AUTO_APPLY_UPDATE_TYPES, extractAppearanceCreations, validateUpdates } from '@/lib/artist/chat-updates'
import { createPendingProposal } from '@/lib/pending-proposal'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import type { CharacterAsset } from '@/types/asset'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

function chain(result: unknown, single?: unknown) {
  const value: Record<string, unknown> = {}
  for (const m of ['select', 'update', 'insert', 'delete', 'eq', 'in', 'order']) value[m] = vi.fn(() => value)
  value.maybeSingle = vi.fn(async () => single ?? result)
  value.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected)
  return value
}

function req(body: unknown, method: string) {
  return new NextRequest('http://localhost/api/artist/character-appearance', {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function character(): CharacterAsset {
  return {
    characterId: 'char_3',
    name: '옥화',
    entityType: 'person',
    views: { main: null, back: null, sideLeft: null, sideRight: null },
    viewCandidates: {},
    appearances: [
      { appearanceKey: 'current', label: '현재', isDefault: true, narrativeTime: 'present', sheetUrl: 'sheet', portraitUrl: 'portrait', appearance: 'now', appearanceNative: null, viewCandidates: {} },
      { appearanceKey: 'young', label: '젊은 시절', isDefault: false, narrativeTime: 'past', sheetUrl: null, portraitUrl: null, appearance: 'young', appearanceNative: null, viewCandidates: {} },
    ],
  } as CharacterAsset
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.requireProjectAccess.mockResolvedValue({ ok: true, userId: 'user-1' })
  mocks.appearanceI18nFields.mockImplementation(async (_id: string, native: string) => ({ appearance: native, appearance_native: native, i18n_provenance: {} }))
  useProjectStore.setState({ projectId: 'project-1' })
  useArtistStore.setState({ characterAssets: [character()], generatingViews: [], error: null })
})

describe('약속 C — 모습 만들기: 화면과 채팅', () => {
  it('캐릭터 카드 위쪽에 모습 탭 줄이 항상 보이고, 모습이 하나뿐이어도 "+ 모습 추가"가 있다', () => {
    const panel = read('src/features/artist/character-panel.tsx')
    // 탭 줄을 모습 개수로 숨기지 않는다(사물만 예외).
    expect(panel).not.toMatch(/appearances\?\.length \?\? 0\) > 1 &&/)
    expect(panel).toMatch(/\{!isObject && \(\s*<div className="mb-2 flex flex-wrap gap-1"/)
    expect(panel).toMatch(/t\('\+ Add appearance'\)/)
    expect(panel).toMatch(/<AppearanceCreateDialog charId=\{createFor\}/)
  })

  it('"+ 모습 추가"를 누르면 이름·시점(과거/현재/미래)·외형을 적는 창이 뜨고, 저장하면 새 탭이 생긴다', () => {
    const dialog = read('src/features/artist/appearance-create-dialog.tsx')
    expect(dialog).toMatch(/t\('Appearance name'\)/)
    expect(dialog).toMatch(/\['past', 'present', 'future'\]/)
    expect(dialog).toMatch(/t\('Appearance \(what changes from the default look\)'\)/)
    // 저장 = createAppearance(스토어가 새 탭 행을 추가한다)
    expect(dialog).toMatch(/createAppearance\(char\.characterId, label\.trim\(\), appearance\.trim\(\), time, \{ generate: true, actor: 'ui' \}\)/)
  })

  it('채팅에서 새 모습을 만들어 달라고 하면 승인 뒤 그 캐릭터에 그 모습이 추가된다', () => {
    // 자동 실행 화이트리스트에서 빠졌다(과금이 생기므로) → 승인 채널로만 흐른다.
    expect(AUTO_APPLY_UPDATE_TYPES.has('createAppearance')).toBe(false)
    const raw = [{ type: 'createAppearance', characterId: 'char_3', label: '늙은 모습', appearance: '흰 머리', narrativeTime: 'future' }]
    expect(validateUpdates(raw)).toEqual([])
    expect(extractAppearanceCreations(raw)).toEqual([{ characterId: 'char_3', label: '늙은 모습', appearance: '흰 머리', narrativeTime: 'future' }])
    const proposal = createPendingProposal({ stage: 'artist', kind: 'artistCreateAppearance', target: '옥화', action: 'add', impact: [], payload: raw[0] })
    expect(JSON.parse(JSON.stringify(proposal)).kind).toBe('artistCreateAppearance')
    const store = read('src/stores/global-chat-store.ts')
    expect(store).toMatch(/kind: 'artistCreateAppearance'/)
    expect(store).toMatch(/proposal\.kind === 'artistCreateAppearance'/)
    expect(store).toMatch(/createAppearance\(characterId, label, appearance, time, \{ generate: true, actor: 'chat' \}\)/)
    expect(read('src/app/api/artist/chat/route.ts')).toMatch(/appearanceCreations: extractAppearanceCreations\(raw\)/)
  })

  it('새 모습은 만든 직후 자동으로 이미지가 만들어진다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, characterId: 'char_3', appearanceKey: 'old', label: '늙은 모습', narrativeTime: 'future', appearance: '흰 머리', appearanceNative: '흰 머리' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const generateCharacterView = vi.fn().mockResolvedValue(null)
    useArtistStore.setState({ generateCharacterView })
    const key = await useArtistStore.getState().createAppearance('char_3', '늙은 모습', '흰 머리', 'future', { generate: true, actor: 'ui' })
    expect(key).toBe('old')
    expect(generateCharacterView).toHaveBeenCalledWith('char_3', 'old', 'main', 'ui', undefined, undefined, undefined)
    expect(useArtistStore.getState().characterAssets[0].appearances.map((a) => a.appearanceKey)).toEqual(['current', 'young', 'old'])
    // 옵션이 없으면(예: 옛 호출) 이미지를 만들지 않는다.
    generateCharacterView.mockClear()
    await useArtistStore.getState().createAppearance('char_3', '또 다른', '설명', 'past')
    expect(generateCharacterView).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('새 모습 이미지는 기본 모습 이미지를 참조로 해서 그려진다', () => {
    // 기존 동작 — 시트 라우트가 기본 모습 portrait 를 정체성 참조로 쓰고, 없으면 만들기를 거부한다.
    const route = read('src/app/api/artist/generate-sheet/route.ts')
    expect(route).toMatch(/const baseFaceUrl = appearance\.is_default \? null : \(defaultAppearance\.portrait_url as string\)/)
    expect(route).toMatch(/Default appearance portrait is required for non-default appearance generation/)
  })

  it('채팅에서 특정 모습을 다시 그려 달라고 하면 기본 모습이 아니라 그 모습이 다시 그려진다', async () => {
    const out = validateUpdates([{ type: 'regenerateCharacter', characterId: 'char_3', appearanceKey: 'young' }])
    expect(out).toEqual([{ type: 'regenerateCharacter', characterId: 'char_3', appearanceKey: 'young' }])
    const generateCharacterAllViews = vi.fn().mockResolvedValue(null)
    useArtistStore.setState({ generateCharacterAllViews })
    await useArtistStore.getState().applyUpdates(out as never)
    expect(generateCharacterAllViews).toHaveBeenCalledWith('char_3', 'young', 'chat', undefined, undefined)
    // 모르는 키면 기본 모습으로 돌아간다.
    await useArtistStore.getState().applyUpdates([{ type: 'regenerateCharacter', characterId: 'char_3', appearanceKey: 'nope' }] as never)
    expect(generateCharacterAllViews).toHaveBeenLastCalledWith('char_3', 'current', 'chat', undefined, undefined)
    // 안내문이 모델에게 appearanceKey 를 알려 준다.
    expect(read('src/app/api/artist/chat/route.ts')).toMatch(/"appearanceKey":"<appearance key>"/)
  })

  it('채팅에서 모델 이름을 말하면 그 모델로, 지시를 붙이면 그 지시로 그려진다', async () => {
    const out = validateUpdates([{ type: 'regenerateCharacter', characterId: 'char_3', appearanceKey: 'young', model: 'nano-banana', instruction: '더 낡게' }])
    expect(out[0]).toMatchObject({ model: 'nano-banana', instruction: '더 낡게' })
    const generateCharacterAllViews = vi.fn().mockResolvedValue(null)
    useArtistStore.setState({ generateCharacterAllViews })
    await useArtistStore.getState().applyUpdates(out as never)
    expect(generateCharacterAllViews).toHaveBeenCalledWith('char_3', 'young', 'chat', '더 낡게', 'nano-banana')
  })

  it('모습을 지우거나 이름을 바꾸거나 기본 모습으로 지정할 수 있다', async () => {
    // 이름 바꾸기
    const rename = chain({ data: [{ appearance_key: 'young', label: '어린 시절', narrative_time: 'past', is_default: false }], error: null }, { data: { appearance_key: 'young', is_default: false, narrative_time: 'past' }, error: null })
    mocks.from.mockImplementation(() => rename)
    const r1 = await PATCH(req({ projectId: 'p', characterId: 'char_3', appearanceKey: 'young', label: '어린 시절' }, 'PATCH'))
    expect(r1.status).toBe(200)
    expect(await r1.json()).toMatchObject({ label: '어린 시절' })
    expect((rename.update as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({ label: '어린 시절' })
    // 기본 모습 지정 — 다른 모습의 is_default 를 먼저 내리고 대상을 올린다.
    const setDefault = chain({ data: [{ appearance_key: 'young', label: '젊은 시절', narrative_time: 'past', is_default: true }], error: null }, { data: { appearance_key: 'young', is_default: false, narrative_time: 'past' }, error: null })
    mocks.from.mockImplementation(() => setDefault)
    const r2 = await PATCH(req({ projectId: 'p', characterId: 'char_3', appearanceKey: 'young', isDefault: true }, 'PATCH'))
    expect(r2.status).toBe(200)
    const updates = (setDefault.update as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(updates[0]).toEqual({ is_default: false })
    expect(updates[1]).toMatchObject({ is_default: true })
    // 기본 모습은 못 지운다, 다른 모습은 후보 이미지와 함께 지운다.
    const delDefault = chain({ data: null, error: null }, { data: { appearance_key: 'current', is_default: true }, error: null })
    mocks.from.mockImplementation(() => delDefault)
    const r3 = await DELETE(req({ projectId: 'p', characterId: 'char_3', appearanceKey: 'current' }, 'DELETE'))
    expect(r3.status).toBe(409)
    const del = chain({ data: null, error: null }, { data: { appearance_key: 'young', is_default: false }, error: null })
    mocks.from.mockImplementation(() => del)
    const r4 = await DELETE(req({ projectId: 'p', characterId: 'char_3', appearanceKey: 'young' }, 'DELETE'))
    expect(r4.status).toBe(200)
    expect(mocks.from).toHaveBeenCalledWith('character_image_candidates')
    expect((del.delete as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
    // 팝업에 세 조작이 있다.
    const dialog = read('src/features/artist/character-view-dialog.tsx')
    expect(dialog).toMatch(/renameAppearance\(char\.characterId, appearanceKey, renameDraft\.trim\(\)\)/)
    expect(dialog).toMatch(/setDefaultAppearance\(char\.characterId, appearanceKey\)/)
    expect(dialog).toMatch(/deleteAppearance\(char\.characterId, appearanceKey\)/)
  })

  it('Artist AI는 뒷모습·측면 4뷰를 말하지 않는다', () => {
    const route = read('src/app/api/artist/chat/route.ts')
    const prose = route.slice(route.indexOf('const ARTIST_SYSTEM'), route.indexOf('function parseUpdates'))
    expect(prose).not.toMatch(/4뷰|뒷모습|측면 뷰|"views":\[/)
    expect(prose).toMatch(/Never talk about separate back\/side views/)
    // 채팅 맥락 요약과 넘김 안내에도 4뷰 어휘가 없다.
    const store = read('src/stores/global-chat-store.ts')
    expect(store).not.toMatch(/with no back or side views yet/)
    expect(store).not.toMatch(/\['main', 'back', 'sideLeft', 'sideRight'\] as const/)
  })
})
