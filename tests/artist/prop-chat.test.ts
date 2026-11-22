// Artist 채팅과 소품 — "소품 다시 그려줘"는 인물 · 배경처럼 승인 카드를 거쳐 다시 그리고, 채팅은 새 소품 카드를 만들지 않으며, 채팅 문맥에 소품 목록과 그림 유무가 실린다 (D7 · 리드 결정 2, 2026-11-22)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { countNewCardUpdates, validateUpdates } from '@/lib/artist/chat-updates'
import { artistPropContextLines } from '@/lib/artist/props'
import type { PropAsset } from '@/types'

const read = (path: string) => readFileSync(path, 'utf8')
const asset = (over: Partial<PropAsset> = {}): PropAsset => ({ propId: 'obj_ring', name: '은반지', appearance: 'a thin silver ring', appearanceNative: '가는 은반지', imageUrl: null, sourceHash: null, origin: 'producer', ...over })

describe('채팅 소품 다시 그리기', () => {
  // 왜: 리드 결정 2 — 채팅으로도 소품을 다시 그린다. 인물 · 배경 다시 그리기와 같은 길이다: 명령 → 승인 카드("승인 전에는 시작하지 않아요") → 승인하면 그린다.
  it('채팅에서 소품을 다시 그려 달라고 하면 인물 · 배경처럼 승인 카드를 띄우고, 승인하면 다시 그린다', () => {
    expect(validateUpdates([{ type: 'regenerateProp', propId: 'obj_ring', instruction: '돌을 빨간색으로', model: 'nano-banana-2', safeMode: true, extra: 'x' }])).toEqual([
      { type: 'regenerateProp', propId: 'obj_ring', instruction: '돌을 빨간색으로', model: 'nano-banana-2', safeMode: true },
    ])
    expect(validateUpdates([{ type: 'regenerateProp' }, { type: 'regenerateProp', propId: 7 }])).toEqual([])
    const store = read('src/stores/global-chat-store.ts')
    expect(store).toMatch(/u\.type === 'regenerateCharacter' \|\| u\.type === 'regenerateWorldAsset' \|\| u\.type === 'regenerateProp'/)
    expect(store).toMatch(/kind: 'artistRegenerateProp'/)
    expect(store).toMatch(/proposal\.kind === 'artistRegenerateProp'[\s\S]{0,600}generateProp\(propId, 'chat'/)
  })

  // 왜: 기존 규칙(2026-10-27 "채팅 추가 막고 안내") — 소품도 산문 · Producer 에서만 생긴다. 모델이 지어낸 만들기 명령은 세기만 하고 실행하지 않는다.
  it('채팅은 새 소품 카드를 만들지 않는다', () => {
    expect(countNewCardUpdates([{ type: 'createProp', name: '칼' }, { type: 'addObject', name: '칼' }])).toBe(2)
    expect(validateUpdates([{ type: 'createProp', name: '칼' }])).toEqual([])
  })

  // 왜: 모델이 소품 id 를 지어내지 않게, 그림이 있는지 알고 답하게 — 인물 · 장소 목록과 같은 자리에 소품 목록을 싣는다.
  it('채팅 문맥에 소품 목록과 그림 유무가 실린다', () => {
    expect(artistPropContextLines([asset(), asset({ propId: 'obj_letter', name: '편지', imageUrl: 'https://media.test/letter.png' })])).toEqual([
      '- 은반지 (obj_ring) — no image',
      '- 편지 (obj_letter) — has image',
    ])
    expect(read('src/stores/global-chat-store.ts')).toMatch(/`### 소품 \(\$\{a\.propAssets\.length\}\)`,\s*\.\.\.\(propLines\.length \? propLines : \['- \(없음\)'\]\)/)
  })

  // 왜: 모델이 쓸 수 있는 명령을 지시문에 적어야 쓴다 — 소품 다시 그리기 명령과 규칙(정확한 id · 새 소품 없음 · 생김새 바꾸기는 도구).
  it('Artist 채팅 지시문은 소품 다시 그리기 명령을 알려 준다', () => {
    const route = read('src/app/api/artist/chat/route.ts')
    expect(route).toContain('{"type":"regenerateProp","propId":"<id>","instruction":"...","model":"<image-model>"}')
    expect(route).toMatch(/regenerateCharacter, regenerateWorldAsset 또는 regenerateProp 에 "safeMode":true/)
  })
})
