// Artist 작품 스타일 기록 화면 — 머리 줄 · 재생성 창 · 생성 기록 창 · 카드 기록 · 처음 스타일 창의 문구와 배선이 프로토타입 그대로다 (2026-10-28 오너, A2 · A5 · A6 · AV · A7)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { KO } from '@/lib/i18n/messages-ko'

const read = (path: string) => readFileSync(path, 'utf8')

describe('머리 줄(A5)', () => {
  it('Artist 위쪽에 작품 스타일 견본 · 이름과 "작품 스타일 · v{n}", [불러오기 · 기록 N] [재생성하기]가 있고, 꺼진 단추는 까닭을 글로 보인다', () => {
    // 왜: 프로토타입 A5 — 지금 작품 스타일과 버전이 늘 보이고, 마우스를 올려야 보이는 안내만으로는 꺼진 까닭을 몰랐다(QA 1차 #06).
    const page = read('src/app/studio/artist/page.tsx')
    expect(page).toContain('<StyleVersionBar completed={artistCompleted} drawing={generatingCount > 0 || regenDrawing} />')
    const bar = read('src/features/artist-room/style-version-bar.tsx')
    expect(bar).toContain("t('Work style · v{n}', { n: header.n })")
    expect(bar).toContain("t('Load · history {count}', { count: header.count })")
    expect(bar).toContain("t('Regenerate everything')")
    expect(bar).toContain('data-testid="artist-style-note"')
    expect(KO['Work style · v{n}']).toBe('작품 스타일 · v{n}')
    expect(KO['Load · history {count}']).toBe('불러오기 · 기록 {count}')
    expect(KO['Regenerate everything']).toBe('재생성하기')
    expect(KO['Regenerating keeps the earlier version here']).toBe('재생성하면 이전 버전이 여기 남아요')
    expect(KO['The style cannot be changed after Storyboard opens.']).toBe('Storyboard를 연 뒤에는 스타일을 바꿀 수 없어요.')
    expect(KO['Drawing the images. You can change the style once they are done.']).toBe('그림을 그리는 중이에요. 다 그린 뒤에 스타일을 바꿀 수 있어요.')
  })

  it('재생성 그림을 그리는 동안에는 [완료하기]가 꺼지고, 잠금 화면에 그린 수/전체 수가 보인다', () => {
    // 왜: 옛 스타일 그림이 섞인 채로 Storyboard 가 열리면 러프 · 샷이 섞인 그림으로 만들어진다. 오래 걸리는 동안 얼마나 남았는지 보인다.
    const page = read('src/app/studio/artist/page.tsx')
    expect(page).toMatch(/const completeBlocked = gaps\.characters\.length \+ gaps\.locations\.length > 0 \|\| regenDrawing/)
    expect(page).toContain("t('Drawing images {drawn}/{total}', { drawn: regen.done, total: regen.total })")
    expect(page).toContain('regenOverlay')
  })
})

describe('재생성 창(A6)', () => {
  it('[재생성하기] 창은 "어떤 스타일로 다시 만들까요?"와 지금 버전이 기록에 남는다는 설명, 처음 스타일 창과 같은 스타일 격자, 요약 줄(다시 만드는 것 · 스타일 · 예상 크레딧)을 보인다', () => {
    // 왜: 프로토타입 A6 — 같은 격자로 고르고, 무엇을 얼마나 다시 그리는지 · 작품 스타일이 바뀌는지를 누르기 전에 본다(긴 대시 없이).
    const dialog = read('src/features/artist-room/regenerate-style-dialog.tsx')
    expect(dialog).toContain("import { StyleGrid } from '@/features/artist-room/style-make-dialog'")
    expect(dialog).toContain("t('Images do not use Takes.')")
    expect(KO['Which style should we remake it in?']).toBe('어떤 스타일로 다시 만들까요?')
    expect(KO['You can remake it in the same style or pick another one. The current version (v{n} · {style}) stays in the history, so you can load it any time.'])
      .toBe('같은 스타일로 다시 만들어도 되고, 다른 스타일을 골라도 돼요. 지금 버전(v{n} · {style})은 기록에 남아서 언제든 불러올 수 있어요.')
    expect(KO['What gets remade']).toBe('다시 만드는 것')
    expect(KO['Characters {persons} · backgrounds {places}, all of them']).toBe('인물 {persons} · 배경 {places} 전체')
    expect(KO['{style} (unchanged)']).toBe('{style} (그대로)')
    expect(KO['{style} · the work style changes to this']).toBe('{style} · 작품 스타일이 이걸로 바뀌어요')
    expect(KO['Images do not use Takes.']).toBe('그림은 Take가 들지 않아요.')
    expect(KO.Remake).toBe('다시 만들기')
  })

  it('고른 스타일로 만든 이전 버전이 있으면 "✦ v{k}에 {스타일}로 만든 게 있어요. 다시 만들지 않고 불러올 수 있어요"와 [v{k} 불러오기]를 보인다', () => {
    // 왜: 프로토타입 A6 — 같은 스타일을 또 그리면 시간이 든다. 조사(로 · 으로)는 스타일 이름에 맞춘다.
    const dialog = read('src/features/artist-room/regenerate-style-dialog.tsx')
    expect(dialog).toContain('previousVersionWithStyle(versions, chosenKey)')
    expect(dialog).toContain('fixKoreanParticles(')
    expect(KO['✦ v{n} was made in {style}. You can load it instead of remaking it.']).toBe('✦ v{n}에 {style}로 만든 게 있어요. 다시 만들지 않고 불러올 수 있어요')
    expect(KO['Load v{n}']).toBe('v{n} 불러오기')
  })
})

describe('생성 기록 창(AV)', () => {
  it('생성 기록 창은 "생성 기록"과 불러오면 스타일도 바뀐다는 설명, 버전마다 인물 · 배경 썸네일 한 줄을 보인다', () => {
    // 왜: 프로토타입 AV — 버전을 그림으로 고른다. 스타일은 작품에 하나라 불러오면 스타일도 바뀐다는 것을 먼저 말한다.
    const dialog = read('src/features/artist-room/version-history-dialog.tsx')
    expect(dialog).toContain('historyOrder(versions)')
    expect(dialog).toContain('version.thumbs.map')
    expect(KO['Generation history']).toBe('생성 기록')
    expect(KO['Load a version you liked. The work has one style, so loading a version also switches the style to that version.'])
      .toBe('마음에 들었던 버전을 불러오세요. 스타일은 작품에 하나라서, 불러오면 스타일도 그 버전으로 바뀌어요.')
  })
})

describe('카드 상세의 기록(A7)', () => {
  it('카드 기록의 다른 스타일 그림은 보이되 [불러오기]가 꺼지고 "v{n} · {스타일} · 다른 스타일"이 붙는다', () => {
    // 왜: 오너 — 카드 하나만 다른 스타일 그림으로 바꾸면 작품 안에 스타일이 섞인다. 어느 버전 그림인지는 보여 준다.
    for (const path of ['src/features/artist/character-view-dialog.tsx', 'src/features/artist/world-view-dialog.tsx']) {
      expect(read(path), path).toContain('describe={historyStyle.describe} hint={historyStyle.hint}')
    }
    expect(read('src/features/artist/detail-parts.tsx')).toContain("title={state?.disabled ? t('It is in another style, so it cannot be loaded') : undefined}")
    expect(KO['It is in another style, so it cannot be loaded']).toBe('다른 스타일이라 불러올 수 없어요')
    expect(KO['v{n} · {style} · another style']).toBe('v{n} · {style} · 다른 스타일')
    expect(KO['Only the same style ({style}) can be loaded']).toBe('같은 스타일({style})만 불러올 수 있어요')
  })
})

describe('처음 만드는 스타일 창(A2)', () => {
  it('처음 만드는 스타일 창은 나중에 [재생성하기]로 다른 스타일을 고를 수 있고 이전 버전은 기록에 남는다고 알린다', () => {
    // 왜: 프로토타입 A2 — 스타일이 하나라는 말만 있으면 처음 고른 스타일을 영영 못 바꾸는 줄 안다.
    const key = 'This work has one style. Every character and background image is made in the style you pick. Later you can pick another style with Regenerate, and the earlier version stays in the history.'
    expect(read('src/features/artist-room/style-make-dialog.tsx')).toContain(key)
    expect(KO[key]).toBe('이 작품의 스타일은 하나예요. 고른 스타일로 인물 · 배경 그림을 모두 만들어요. 나중에 [재생성하기]로 다른 스타일을 다시 고를 수 있고, 이전 버전은 기록에 남아요.')
  })
})
