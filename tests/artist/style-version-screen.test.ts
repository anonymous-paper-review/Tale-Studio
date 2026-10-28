// Artist 작품 스타일 기록 화면 — 머리 줄 · 재생성 창 · 생성 기록 창 · 카드 기록 · 처음 스타일 창의 문구와 배선이 프로토타입 그대로다 (2026-10-28 오너, A2 · A5 · A6 · AV · A7)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { KO } from '@/lib/i18n/messages-ko'
import { StyleVersionBar } from '@/features/artist-room/style-version-bar'
import { StyleReturnCard } from '@/features/artist-room/style-return-card'
import { RegenStoppedActions } from '@/features/artist-room/regen-stopped-actions'
import { useArtistVersionStore } from '@/stores/artist-version-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProducerStore } from '@/stores/producer-store'

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

// ── 그려 보기(2026-10-28 검토 지적: 소스 글 확인만으로는 화면에 무엇이 보이는지 모른다) ──

/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다(recheck-screen 과 같은 방법). */
function serveCurrent(...stores: Array<{ getState: () => object; getInitialState: () => object }>) {
  for (const store of stores) Object.assign(store.getInitialState(), store.getState())
}
const html = (element: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(element).replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
const tagOf = (out: string, testId: string) => out.match(new RegExp(`<[a-z]+[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? ''
const isDisabled = (out: string, testId: string) => / disabled=""/.test(tagOf(out, testId))
const versionView = (n: number, styleKey: string, current: boolean) => ({ n, styleId: styleKey, styleKey, customStyle: null, current, active: [], createdAt: '', thumbs: [] })
const SLOTS = [{ kind: 'character' as const, id: 'minho', appearanceKey: 'current', phase: 0 as const, fromUrl: null }]

function screenState(input: { versions: ReturnType<typeof versionView>[]; stopped?: boolean }) {
  useLocaleStore.setState({ locale: 'ko' })
  useProducerStore.setState({
    styleAnchorKey: 'watercolor', customStyleAnchor: null,
    styleAnchors: [
      { key: 'real', label: '실사', medium: 'photo', imageUrl: null, previewUrl: null, subtitle: null },
      { key: 'watercolor', label: '수채화', medium: 'watercolor', imageUrl: null, previewUrl: null, subtitle: null },
    ],
  } as never)
  useArtistVersionStore.setState({
    projectId: 'p1', versions: input.versions, currentN: input.versions.find((v) => v.current)?.n ?? 1, loaded: true, busy: null,
    regen: input.stopped ? { n: 2, startedAt: '', fromN: 1, slots: SLOTS, states: { 'c:minho:current': 'todo' }, total: 1, done: 0, failed: 0, drawing: 0, complete: false, announced: false } : null,
    run: { running: false, stopped: !!input.stopped, userWaitSince: null },
  })
  serveCurrent(useLocaleStore, useProducerStore, useArtistVersionStore)
}

describe('머리 줄 그려 보기', () => {
  it('머리 줄은 작품 스타일 이름 · "작품 스타일 · v{n}" · [불러오기 · 기록 N]을 그리고, 기록이 하나면 [불러오기]가 꺼지고 "재생성하면 이전 버전이 여기 남아요"를 보인다', () => {
    // 왜: 프로토타입 A5 — 지금 스타일과 버전이 늘 보이고, 꺼진 단추는 까닭을 글로 보인다(QA 1차 #06).
    screenState({ versions: [versionView(1, 'watercolor', true)] })
    const out = html(createElement(StyleVersionBar, { completed: false, drawing: false }))
    expect(out).toContain('수채화')
    expect(out).toContain('작품 스타일 · v1')
    expect(out).toContain('불러오기 · 기록 1')
    expect(isDisabled(out, 'artist-version-history-open')).toBe(true)
    expect(isDisabled(out, 'artist-regen-open')).toBe(false)
    expect(out).toContain('재생성하면 이전 버전이 여기 남아요')
  })

  it('Storyboard를 연 뒤에는 머리 줄의 두 단추가 꺼지고 "Storyboard를 연 뒤에는 스타일을 바꿀 수 없어요."를 보인다', () => {
    // 왜: 오너 결정(2) — 스타일을 바꾸는 일은 Storyboard 를 열기 전에만 한다.
    screenState({ versions: [versionView(1, 'real', false), versionView(2, 'watercolor', true)] })
    const out = html(createElement(StyleVersionBar, { completed: true, drawing: false }))
    expect(out).toContain('작품 스타일 · v2')
    expect(isDisabled(out, 'artist-version-history-open')).toBe(true)
    expect(isDisabled(out, 'artist-regen-open')).toBe(true)
    expect(out).toContain('Storyboard를 연 뒤에는 스타일을 바꿀 수 없어요.')
  })

  it('재생성 그림이 멈추면 머리 줄에 까닭과 [남은 그림 다시 그리기] · [이전 버전으로 돌아가기]가 보이고, [불러오기]는 켜지고 [재생성하기]는 꺼진다', () => {
    // 왜: 멈춘 재생성은 다 그릴 때까지 모든 길을 막았다 — 남은 그림을 다시 그리거나 이전 버전으로 돌아가는 길을 보인다(2026-10-28 검토 지적).
    screenState({ versions: [versionView(1, 'real', false), versionView(2, 'watercolor', true)], stopped: true })
    const out = html(createElement(StyleVersionBar, { completed: false, drawing: false }))
    expect(out).toContain('그리지 못한 그림이 있어요. 남은 그림을 다시 그리거나 이전 버전으로 돌아갈 수 있어요.')
    expect(out).toContain('남은 그림 다시 그리기')
    expect(out).toContain('이전 버전으로 돌아가기')
    expect(isDisabled(out, 'artist-version-history-open')).toBe(false)
    expect(isDisabled(out, 'artist-regen-open')).toBe(true)
    // 같은 단추는 잠금 화면 아래에도 그대로 쓴다.
    const actions = html(createElement(RegenStoppedActions))
    expect(tagOf(actions, 'artist-regen-resume')).not.toBe('')
    expect(tagOf(actions, 'artist-regen-go-back')).not.toBe('')
  })

  it('버전을 불러오는 동안 머리 줄은 "버전을 불러오는 중이에요."를 보이고 두 단추를 끈다', () => {
    // 왜: 불러오는 동안 "그림을 그리는 중이에요"가 보여 아직 그리는 줄 알았다(2026-10-28 개발 DB e2e).
    screenState({ versions: [versionView(1, 'real', false), versionView(2, 'watercolor', true)], stopped: true })
    useArtistVersionStore.setState({ busy: 'load' })
    serveCurrent(useArtistVersionStore)
    const out = html(createElement(StyleVersionBar, { completed: false, drawing: false }))
    expect(out).toContain('버전을 불러오는 중이에요.')
    expect(out).not.toContain('그림을 그리는 중이에요')
    expect(isDisabled(out, 'artist-version-history-open')).toBe(true)
    expect(isDisabled(out, 'artist-regen-open')).toBe(true)
  })

  it('재생성 그림을 그리는 중에는 돌아가기 단추를 보이지 않는다', () => {
    // 왜: 그리는 중에 돌아가면 늦게 온 그림이 불러온 버전에 들어간다 — 멈췄을 때만 보인다.
    screenState({ versions: [versionView(1, 'real', false), versionView(2, 'watercolor', true)] })
    expect(html(createElement(RegenStoppedActions))).toBe('')
  })
})

describe('채팅 카드 그려 보기(AY)', () => {
  it('채팅 카드는 이전 버전마다 [v{n} · {스타일} 불러오기] 단추를 그리고, 이전 버전이 없으면 [재생성하기]를 그린다', () => {
    // 왜: 프로토타입 AY — 다시 그리지 않고 돌아가는 길을 단추로 보인다. 돌아갈 버전이 없으면 다른 스타일로 만드는 길.
    screenState({ versions: [versionView(1, 'real', false), versionView(2, 'watercolor', true)] })
    const withVersions = html(createElement(StyleReturnCard, { options: [{ n: 1, label: 'v1 · 실사 불러오기' }], regenerate: false }))
    expect(withVersions).toContain('v1 · 실사 불러오기')
    expect(withVersions).not.toContain('재생성하기')
    const none = html(createElement(StyleReturnCard, { options: [], regenerate: true }))
    expect(none).toContain('재생성하기')
  })
})

