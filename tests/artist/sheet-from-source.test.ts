// 이 파일이 지키는 약속: 올린 원본 그림이 있는 인물은 시트를 그 그림에 맞춰 만들고, 대표 사진은 원본을 유지한다 (#image-to-artist 2026-09-17).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildCharacterTurnaroundPrompt } from '@/lib/artist/turnaround'
import { keepsSourcePortrait, sheetIdentityReferences } from '@/lib/artist/source-image'

const read = (rel: string) => readFileSync(rel, 'utf8')
const input = { name: '코마츠', appearance: '17세 일본 여고생, 흑발 단발' } as never

describe('출처 그림이 있는 인물의 시트', () => {
  // 왜: 시트는 템플릿 레이아웃에 인물을 채우는 그림이다. 원본을 정체성 참조로 넣지 않으면 글로만 그려 다른 사람이 된다.
  it('출처 그림이 있으면 시트는 그 그림을 정체성 참조로 넣어 만들고, 프롬프트가 그 사람을 그대로 그리라고 말한다', () => {
    expect(sheetIdentityReferences({ sourceImageUrl: 'https://m/src.png', baseFaceUrl: null, priorSheetUrl: null })).toEqual(['https://m/src.png'])
    // 출처 → 기준 얼굴 → 직전 시트 순서. 없는 것은 빠진다.
    expect(
      sheetIdentityReferences({ sourceImageUrl: 'https://m/src.png', baseFaceUrl: 'https://m/base.png', priorSheetUrl: 'https://m/prev.png' }),
    ).toEqual(['https://m/src.png', 'https://m/base.png', 'https://m/prev.png'])
    expect(sheetIdentityReferences({ sourceImageUrl: null, baseFaceUrl: null, priorSheetUrl: 'https://m/prev.png' })).toEqual(['https://m/prev.png'])

    const p = buildCharacterTurnaroundPrompt(input, { hasSourceImage: true })
    expect(p).toMatch(/ORIGINAL picture of this exact character/)
    expect(p).toMatch(/same person/i)
    expect(p).toMatch(/face|hair|outfit/)
    // 원본의 배경·구도는 시트로 가져오지 않는다.
    expect(p).toMatch(/do not copy (its|the) background/i)
    // 출처가 없으면 그 문장은 없다(첫 생성 동작 보존).
    expect(buildCharacterTurnaroundPrompt(input)).not.toMatch(/ORIGINAL picture/)
  })

  // 왜: 시트를 만드는 길이 둘(버튼·자동 초안)이다. 한쪽만 출처를 보면 자동 초안은 다른 사람을 그린다.
  it('버튼 생성과 자동 초안 생성이 같은 출처 그림을 참조한다', () => {
    const route = read('src/app/api/artist/generate-sheet/route.ts')
    expect(route).toMatch(/derived_from_url/)
    expect(route).toMatch(/sheetIdentityReferences\(/)
    expect(route).toMatch(/hasSourceImage/)
    const trigger = read('src/lib/artist/draft-trigger.ts')
    expect(trigger).toMatch(/derived_from_url/)
    expect(trigger).toMatch(/sheetIdentityReferences\(/)
    expect(trigger).toMatch(/hasSourceImage/)
  })

  // 왜: 시트가 착지하면 대표 사진을 시트에서 잘라 덮는다. 출처가 있는 인물은 그 원본이 대표 사진이라 덮으면 안 된다.
  it('시트가 완성돼도 출처 그림이 있는 인물의 대표 사진은 원본을 유지한다', () => {
    expect(keepsSourcePortrait({ derived_from_url: 'https://m/src.png' })).toBe(true)
    expect(keepsSourcePortrait({ derived_from_url: null })).toBe(false)
    expect(keepsSourcePortrait({ derived_from_url: '' })).toBe(false)
    expect(keepsSourcePortrait(null)).toBe(false)
    const finalize = read('src/lib/fal/finalize.ts')
    expect(finalize).toMatch(/keepsSourcePortrait\(/)
  })

  // 왜: 오너 결정 — 원본은 Artist 에서 보여야 한다. 카드가 시트만 보이면 원본이 어디 갔는지 알 수 없다.
  it('Artist 인물 카드는 원본 그림을 함께 보여준다', () => {
    const store = read('src/stores/artist-store.ts')
    expect(store).toMatch(/derived_from_url/)
    expect(store).toMatch(/sourceImageUrl/)
    const panel = read('src/features/artist/character-panel.tsx')
    expect(panel).toMatch(/sourceImageUrl/)
    expect(read('src/lib/i18n/messages-ko.ts')).toMatch(/'Original picture': '원본 그림'/)
  })
})
