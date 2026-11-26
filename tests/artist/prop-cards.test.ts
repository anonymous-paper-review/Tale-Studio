// Artist 소품 카드 — 소품(props 행)을 읽어 소품 묶음에 그림 한 장짜리 카드로 보이고, 나오는 씬 · 샷 수를 적고, ⌘/Ctrl+클릭하면 채팅에 @이름이 날아간다 (D7 · D9, 오너 2026-11-22)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const flight = vi.hoisted(() => ({ launched: [] as Array<{ label: string; toChat: boolean }>, mentioned: new Set<string>() }))
vi.mock('@/lib/mention-flight', () => ({
  chatInputHasMention: (label: string) => flight.mentioned.has(label),
  launchMentionFlight: (opts: { label: string; toChat: boolean }) => flight.launched.push({ label: opts.label, toChat: opts.toChat }),
}))

import { orderPropsByUsage, propAssetsFromRows, propPlacementMatches, propUsage, type PropRow } from '@/lib/artist/props'
import { artistMentionItems } from '@/lib/artist/mention-items'
import { PropPanel, mentionPropCard } from '@/features/artist/prop-panel'
import { useArtistStore } from '@/stores/artist-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useLocaleStore } from '@/stores/locale-store'
import type { PropAsset } from '@/types'

const row = (over: Partial<PropRow> = {}): PropRow => ({
  prop_id: 'obj_ring', name: '은반지', appearance: 'a thin silver ring', appearance_native: '가는 은반지', image_url: null, source_hash: null, origin: 'producer', ...over,
})
const asset = (over: Partial<PropAsset> = {}): PropAsset => ({
  propId: 'obj_ring', name: '은반지', appearance: 'a thin silver ring', appearanceNative: '가는 은반지', imageUrl: null, sourceHash: null, origin: 'producer', ...over,
})
/** 정적 그리기는 스토어 처음 값을 읽는다 — 처음 값도 같이 맞춘다. */
function seed<T extends object>(store: { setState: (s: Partial<T>) => void; getInitialState: () => T }, state: Partial<T>) {
  store.setState(state)
  Object.assign(store.getInitialState(), state)
}
const artistInitial = { ...useArtistStore.getInitialState() }
beforeEach(() => {
  flight.launched.length = 0
  flight.mentioned.clear()
  seed(useLocaleStore, { locale: 'ko' })
})
afterEach(() => {
  seed(useArtistStore, { propAssets: artistInitial.propAssets, propUsage: artistInitial.propUsage })
  seed(useLocaleStore, { locale: 'en' })
})

describe('소품 카드', () => {
  // 왜: D7 — 오너 "소품도 한 장이고 중요하게 생각되는 소품만 관리". Writer 는 소품을 props 표에 저장하지만 Artist 는 읽지 않아 카드가 없었다.
  it('Artist 는 소품(props 행)을 읽어 소품 묶음에 카드로 보인다', () => {
    expect(propAssetsFromRows([row()], new Set())).toEqual([asset()])
    // 화면 말 생김새가 비면 영어 생김새를 보인다. 출처를 모르면 Writer 것으로 본다.
    expect(propAssetsFromRows([row({ appearance_native: null, origin: 'odd' })], new Set())[0]).toMatchObject({ appearanceNative: 'a thin silver ring', origin: 'writer' })
    expect(readFileSync('src/stores/artist-store.ts', 'utf8')).toMatch(/\.from\('props'\)\s*\.select\('prop_id, name, appearance, appearance_native, image_url, source_hash, origin'\)/)
    seed(useArtistStore, { propAssets: [asset()], propUsage: { obj_ring: { scenes: 1, shots: 2 } } })
    const html = renderToStaticMarkup(createElement(PropPanel, { columns: 2 }))
    expect(html).toContain('은반지')
    expect(html).toContain('소품')
    expect(html).toContain('가는 은반지')
  })

  // 왜: 예전 저장 고장(2026-10-10 운영 806e2cc2)으로 같은 사물이 인물 행과 소품 행에 둘 다 있는 프로젝트가 있다 — 카드가 둘이 되고 고치기는 409 로 막힌다. 인물 카드가 이미 그 사물을 보인다.
  it('같은 id 가 인물 행에도 있으면 소품 카드를 따로 만들지 않는다', () => {
    expect(propAssetsFromRows([row(), row({ prop_id: 'notebook', name: '공책' })], new Set(['notebook'])).map((p) => p.propId)).toEqual(['obj_ring'])
  })

  // 왜: 샷의 소품 칸(prop_placement)은 모델이 소품 id 를 쓰기도 하고 이름을 쓰기도 한다(개발 DB 실측: 값 883개 중 영어 글 537개). 대소문자 · 밑줄 · 관사만 다른 이름은 같은 소품이다.
  it('샷 소품 칸 값이 소품 id 이거나 이름과 같으면(대소문자 · 밑줄 · 관사 무시) 그 소품이 나오는 샷으로 센다', () => {
    const ring = asset({ propId: 'obj_ring', name: 'Silver Ring' })
    expect(propPlacementMatches(ring, 'obj_ring')).toBe(true)
    expect(propPlacementMatches(ring, 'the silver_ring')).toBe(true)
    expect(propPlacementMatches(ring, ' Silver ring ')).toBe(true)
    expect(propPlacementMatches(ring, 'silver ring box')).toBe(false)
    expect(propPlacementMatches(ring, '')).toBe(false)
  })

  // 왜: 많이 쓰이는 소품이 일관성에 중요하다 — 나오는 샷이 많은 소품을 앞에 두고, 카드에 씬 · 샷 수를 적어 어디에 쓰이는지 알게 한다.
  //   씬 수는 씬 등장 목록에 그 id 가 있는 씬과 그 소품이 나오는 샷의 씬을 합쳐 센다(씬 등장 목록에 빠져도 "씬 0 · 샷 12"로 보이지 않게).
  it('소품 카드는 나오는 씬 · 샷 수를 보이고, 많이 나오는 소품이 앞에 온다', () => {
    const ring = asset({ propId: 'obj_ring', name: '은반지' })
    const letter = asset({ propId: 'obj_letter', name: '편지' })
    const usage = propUsage([ring, letter], [
      { sceneId: 'sc_01', charactersPresent: ['char_a', 'obj_letter'] },
      { sceneId: 'sc_02', charactersPresent: ['obj_letter', 'obj_ring'] },
    ], [
      { shotId: 'sh_01', sceneId: 'sc_02', propPlacement: [{ prop: 'obj_ring' }] },
      { shotId: 'sh_02', sceneId: 'sc_03', propPlacement: [{ prop: 'obj_ring' }, { prop: 'cup' }] },
      { shotId: 'sh_03', sceneId: 'sc_01', propPlacement: [{ prop: 'obj_letter' }] },
      { shotId: 'sh_04', sceneId: 'sc_03', propPlacement: 'not a list' },
    ])
    expect(usage).toEqual({ obj_ring: { scenes: 2, shots: 2 }, obj_letter: { scenes: 2, shots: 1 } })
    expect(orderPropsByUsage([letter, ring], usage).map((p) => p.propId)).toEqual(['obj_ring', 'obj_letter'])
    seed(useArtistStore, { propAssets: [ring], propUsage: usage })
    expect(renderToStaticMarkup(createElement(PropPanel, { columns: 2 }))).toContain('씬 2 · 샷 2에 나와요')
  })

  // 왜: 사물 카드로 정했지만 샷 나누기가 그 소품을 어느 샷에도 쓰지 않았을 수 있다 — 샷 이미지 참고에 안 쓰인다는 것을 알게.
  it('아직 어느 샷에도 안 나오는 소품은 카드에 그렇다고 적는다', () => {
    seed(useArtistStore, { propAssets: [asset()], propUsage: {} })
    expect(renderToStaticMarkup(createElement(PropPanel, { columns: 2 }))).toContain('아직 샷에 나오지 않아요')
  })
})

describe('소품 카드 멘션', () => {
  // 왜: D9 — 오너 "command + 마우스 좌클릭하면 채팅창에 @ 로 mention ... 모든 탭에서, 애니메이션도 동일하게". 인물 · 배경 카드(world-panel · character-panel)와 같다.
  it('소품 카드를 ⌘/Ctrl+클릭하면 채팅 입력에 @이름이 들어가고 카드에서 채팅으로 이름이 날아간다', () => {
    const toggled: string[] = []
    useChatUiStore.setState({ requestMentionToggle: (label: string) => { toggled.push(label) } })
    mentionPropCard('은반지', 10, 20)
    expect(toggled).toEqual(['은반지'])
    expect(flight.launched).toEqual([{ label: '은반지', toChat: true }])
    // 이미 들어 있으면 빼고, 이름은 채팅에서 카드로 돌아온다.
    flight.mentioned.add('은반지')
    mentionPropCard('은반지', 10, 20)
    expect(flight.launched[1]).toEqual({ label: '은반지', toChat: false })
    const src = readFileSync('src/features/artist/prop-panel.tsx', 'utf8')
    expect(src).toMatch(/onClickCapture=\{\(e\) => \{\s*if \(!isMentionModifierClick\(e\) \|\| !prop\.name\.trim\(\)\) return/)
  })

  // 왜: D9 — 멘션은 채팅 @고르기 목록에 있어야 켜진다(입력창 글자와 목록 이름을 맞춘다).
  it('Artist 채팅 @목록에 소품이 "소품" 꼬리표로 들어간다', () => {
    const items = artistMentionItems({
      characters: [{ characterId: 'char_a', name: '민호' }],
      worlds: [{ locationId: 'loc_1', name: '복도' }],
      props: [asset()],
      breakdown: [],
    }, { character: '인물', location: '배경', prop: '소품' })
    expect(items).toEqual([
      { id: 'char_a', label: '민호', hint: '인물' },
      { id: 'loc_1', label: '복도', hint: '배경' },
      { id: 'obj_ring', label: '은반지', hint: '소품' },
    ])
    expect(readFileSync('src/components/layout/global-chat.tsx', 'utf8')).toMatch(/artistMentionItems\(/)
  })

  // 왜: 내부 id 금지(오너 E5) — 채팅 답에 소품 id(obj_ring)가 새면 이름으로 바꿔 보인다. 인물 · 배경은 이미 그렇게 한다.
  it('채팅 답에 소품 id 가 나오면 이름으로 바뀌어 보인다', () => {
    expect(readFileSync('src/components/layout/global-chat.tsx', 'utf8')).toMatch(/for \(const p of artistProps\) put\(p\.propId, p\.name\)/)
  })

  // 왜: D9 "모든 탭" — Artist 첫 화면(글 목록, [만들기] 전)에는 카드가 아직 없어 멘션이 안 됐다. 그때 @목록은 글 목록의 이름이다.
  it('Artist 첫 화면(글 목록) 줄도 ⌘/Ctrl+클릭으로 멘션된다', () => {
    const items = artistMentionItems({ characters: [], worlds: [], props: [], breakdown: [{ id: 'local-1', name: '민호', kind: 'person' }, { id: 'local-2', name: '복도', kind: 'background' }] }, { character: '인물', location: '배경', prop: '소품' })
    expect(items).toEqual([{ id: 'local-1', label: '민호', hint: '인물' }, { id: 'local-2', label: '복도', hint: '배경' }])
    const src = readFileSync('src/features/artist-room/breakdown-list.tsx', 'utf8')
    expect(src).toMatch(/requestMentionToggle\(row\.name\)/)
    expect(src).toMatch(/launchMentionFlight\(/)
  })
})
