// 작품 스타일을 다시 그리는 동안 뜨는 기다리는 창의 제목 · 설명 · 단계 줄(11/5 시안 AR, 사실과 맞게)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'
import { regenOverlayDescription, regenStepLines, type RegenSlot, type RegenSlotState } from '@/lib/artist/style-versions'

const PAGE = 'src/app/studio/artist/page.tsx'

describe('다시 그리는 기다리는 창 문구', () => {
  it('다시 그리는 동안 기다리는 창 제목은 "다시 그리고 있어요"다', () => {
    // 왜: 11/5 시안 AR — 처음 만들 때와 같은 "그림을 만들고 있어요"로는 이미 있던 그림을 새 스타일로 다시 그리는 중인지 모른다.
    expect(readFileSync(PAGE, 'utf8')).toContain("t(regenRun.stopped ? 'Some images were not drawn' : 'Redrawing the images')")
    expect(translate('ko', 'Redrawing the images')).toBe('다시 그리고 있어요')
  })

  it('다시 그리는 기다리는 창은 이 창을 닫아도 계속 그리지만 Artist 화면을 떠나면 멈춘다고 알린다', () => {
    // 왜: 다시 그리는 그림은 Artist 화면이 열려 있을 때만 그린다. 시안 문구 "창을 닫아도 계속 그려요"만 두면 화면을 떠나도 그리는 줄 안다(리드 2026-11-09 "사실대로").
    expect(regenOverlayDescription('ko', { style: '3D 애니메이션', n: 2 })).toBe('3D 애니메이션 · v2로 그려요. 이 창을 닫아도 계속 그려요. Artist 화면을 떠나면 멈춰요.')
    expect(regenOverlayDescription('en', { style: '3D Animation', n: 2 })).toBe('Drawing in 3D Animation · v2. It keeps drawing if you close this window, and stops if you leave the Artist screen.')
    expect(readFileSync(PAGE, 'utf8')).toContain('regenOverlayDescription(locale, { style: regenStyleLabel, n: regen.n })')
  })

  it('버전 번호 받침에 맞춰 "로 · 으로"를 붙인다', () => {
    // 왜: v3 · v6 처럼 받침 있게 읽히는 번호 뒤에 "로"가 붙으면 어색하다(v3으로 · v2로).
    expect(regenOverlayDescription('ko', { style: '실사', n: 3 })).toMatch(/^실사 · v3으로 그려요\./)
  })
})

const slot = (kind: RegenSlot['kind'], id: string, appearanceKey: string | null, phase: 0 | 1 = 0): RegenSlot => ({ kind, id, appearanceKey, phase, fromUrl: null })
const NAMES: Record<string, string> = { minho: '민호', boss: '팀장', tin: '틴장', hall: '회사 복도', roof: '옥상', cafe: '카페' }
const nameOf = (entity: { kind: RegenSlot['kind']; id: string }) => NAMES[entity.id] ?? null
function lines(slots: RegenSlot[], states: Record<string, RegenSlotState>, stopped = false) {
  return regenStepLines('ko', { regen: { slots, states }, stopped, nameOf })
}

describe('다시 그리는 기다리는 창의 단계 줄', () => {
  it('다시 그리는 기다리는 창은 인물 · 배경 단위로 다 그린 것 · 그리는 것 · 기다리는 것을 한 줄씩 보인다', () => {
    // 왜: 11/5 시안 AR "민호 · 다 그렸어요 / 팀장 그리는 중 / 틴장 · 배경 기다리는 중" — 덮개 너머 카드가 잘 안 보여도 어디까지 왔는지 안다.
    const slots = [slot('character', 'minho', 'current'), slot('character', 'boss', 'current'), slot('character', 'tin', 'current'), slot('location', 'hall', null)]
    expect(lines(slots, { 'c:minho:current': 'done', 'c:boss:current': 'drawing', 'c:tin:current': 'todo', 'l:hall:default': 'todo' })).toEqual([
      { label: '민호 · 다 그렸어요', state: 'done' },
      { label: '팀장 그리는 중', state: 'current' },
      { label: '틴장 · 회사 복도 기다리는 중', state: 'todo' },
    ])
  })

  it('한 인물 · 배경의 모습이 여럿이면 모두 끝나야 다 그린 줄에 든다', () => {
    // 왜: 다른 모습은 기본 모습이 끝난 뒤에 그린다 — 기본 모습만 끝난 인물을 "다 그렸어요"로 보이면 거짓이다.
    const slots = [slot('character', 'minho', 'current'), slot('character', 'minho', 'young', 1)]
    expect(lines(slots, { 'c:minho:current': 'done', 'c:minho:young': 'todo' })).toEqual([{ label: '민호 기다리는 중', state: 'todo' }])
  })

  it('그리지 못한 칸이 섞여 끝난 인물 · 배경은 어느 줄에도 넣지 않는다', () => {
    // 왜: 못 그린 것을 "다 그렸어요"로 보이면 안 된다 — 못 그린 수와 [남은 그림 다시 그리기]는 머리 줄 · 카드가 알린다.
    const slots = [slot('character', 'minho', 'current'), slot('character', 'minho', 'young', 1), slot('character', 'boss', 'current')]
    expect(lines(slots, { 'c:minho:current': 'done', 'c:minho:young': 'failed', 'c:boss:current': 'done' })).toEqual([{ label: '팀장 · 다 그렸어요', state: 'done' }])
  })

  it('다시 그리기가 멈추면 기다리는 줄을 두지 않는다', () => {
    // 왜: 멈춘 뒤에는 [남은 그림 다시 그리기]를 눌러야 그린다 — 기다린다고 보이면 거짓이다.
    const slots = [slot('character', 'minho', 'current'), slot('character', 'tin', 'current')]
    expect(lines(slots, { 'c:minho:current': 'done', 'c:tin:current': 'todo' }, true)).toEqual([{ label: '민호 · 다 그렸어요', state: 'done' }])
  })

  it('한 줄의 이름이 넷 이상이면 셋까지 적고 나머지는 수로 보인다', () => {
    // 왜: 인물 · 배경이 많은 작품에서 한 줄이 기다리는 창 폭을 넘쳐 여러 줄로 늘어지지 않게.
    const ids = ['minho', 'boss', 'tin', 'roof', 'cafe']
    const slots = ids.map((id) => slot('character', id, 'current'))
    const states = Object.fromEntries(ids.map((id) => [`c:${id}:current`, 'todo' as const]))
    expect(lines(slots, states)).toEqual([{ label: '민호 · 팀장 · 틴장 외 2 기다리는 중', state: 'todo' }])
  })

  it('영어 화면의 단계 줄도 같은 뜻으로 보인다', () => {
    // 왜: 정상 경로 고정 — 영어로 쓰는 사람도 같은 정보를 본다.
    const slots = [slot('character', 'minho', 'current'), slot('character', 'boss', 'current')]
    const en = regenStepLines('en', { regen: { slots, states: { 'c:minho:current': 'done', 'c:boss:current': 'drawing' } }, stopped: false, nameOf: (entity) => (entity.id === 'minho' ? 'Minho' : 'Boss') })
    expect(en).toEqual([{ label: 'Minho: done', state: 'done' }, { label: 'Drawing Boss', state: 'current' }])
  })

  it('그린 수/전체 수는 단계 줄 아래 한 줄로 남는다', () => {
    // 왜: 오래 걸리는 동안 얼마나 남았는지 숫자로도 본다(재생성 잠금 화면 약속 그대로).
    const page = readFileSync(PAGE, 'utf8')
    expect(page).toContain("progressLabel={t('Drawing images {drawn}/{total}', { drawn: regen.done, total: regen.total })}")
    expect(page).toContain('steps={regenStepLines(locale, { regen, stopped: regenRun.stopped, nameOf: regenNameOf })}')
  })
})

