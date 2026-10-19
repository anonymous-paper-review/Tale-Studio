// 리뉴얼 1차: Artist 는 확정 산문의 인물 · 배경 글 목록 → [만들기] → 그림 카드 → [완료하기] 순서로 보인다 (2026-10-19)
import { describe, expect, it } from 'vitest'
import { artistPhase, assetCompletionGaps, breakdownRows, makingProgress } from '@/lib/artist/breakdown'

const cast = [
  { localId: 'a', name: '민호', entityType: 'person' as const, appearance: '서른 살 회사원, 남색 정장' },
  { localId: 'b', name: '팀장', entityType: 'person' as const, appearance: '' },
  { localId: 'c', name: '자판기', entityType: 'object' as const, appearance: '낡은 음료 자판기' },
]
const backgrounds = [{ localId: 'x', name: '회사 복도', visualDescription: '형광등이 깜빡이는 복도', purpose: '' }]

describe('브레이크다운 목록', () => {
  // 왜: 프로토타입 A1 — 산문을 확정하면 인물 · 배경을 글 목록으로 보여 준다(그림은 아직 없다).
  it('확정 산문에서 뽑은 인물 · 배경을 글 목록으로 보여 준다', () => {
    const rows = breakdownRows(cast, backgrounds)

    expect(rows.map((row) => [row.kind, row.name, row.description])).toEqual([
      ['person', '민호', '서른 살 회사원, 남색 정장'],
      ['person', '팀장', ''],
      ['background', '회사 복도', '형광등이 깜빡이는 복도'],
    ])
  })

  // 왜: 사물은 Artist 카드가 따로 없다(artist-objects-props-gap) — 목록에도 넣지 않는다.
  it('사물은 브레이크다운 목록에 넣지 않는다', () => {
    expect(breakdownRows(cast, backgrounds).some((row) => row.name === '자판기')).toBe(false)
  })
})

describe('Artist 화면 단계', () => {
  const base = { proseLocked: true, draftRun: true, status: { started: true, current_status: 'awaiting_confirmation', current_stage: 'storyCheck' }, hasAssets: false }

  // 왜: [만들기] 전에는 그림 카드가 아니라 글 목록이다.
  it('만들기 전에는 글 목록을 보여 준다', () => {
    expect(artistPhase(base)).toBe('list')
  })

  // 왜: [만들기]를 누르면 인물 · 배경 디자인과 그림이 다 될 때까지 화면을 잠근다.
  it('만들기를 누른 뒤 인물 · 배경 디자인이 끝나기 전에는 만드는 중이다', () => {
    expect(artistPhase({ ...base, draftRun: false, status: { started: true, current_status: 'running', current_stage: 'visualFormat' } })).toBe('making')
  })

  // 왜: 디자인이 끝나 완료하기를 기다리면 카드로 그림을 보고 고친다.
  it('완료하기를 기다리면 그림 카드를 보여 준다', () => {
    expect(artistPhase({ ...base, draftRun: false, status: { started: true, current_status: 'awaiting_artist', current_stage: 'v2Design' }, hasAssets: true })).toBe('cards')
  })

  // 왜: 완료한 뒤에도 Artist 로 돌아와 고칠 수 있다(Artist ⇄ Storyboard) — 다시 완료하지 않고 Storyboard 로 가기만 한다.
  it('완료한 뒤에 다시 열면 카드를 보여 주고 Storyboard 로 가기만 한다', () => {
    expect(artistPhase({ ...base, draftRun: false, status: { started: true, current_status: 'running', current_stage: 'decoupage' }, hasAssets: true })).toBe('done')
    expect(artistPhase({ ...base, draftRun: false, status: { started: true, current_status: 'completed', current_stage: 'persistShots', pipeline_completed: true }, hasAssets: true })).toBe('done')
  })

  // 왜: 정상 경로 고정 — 리뉴얼 전에 끝까지 만든 프로젝트는 그림 카드를 그대로 본다.
  it('예전 흐름으로 끝까지 만든 프로젝트는 그림 카드를 그대로 본다', () => {
    expect(artistPhase({ proseLocked: true, draftRun: false, status: { started: true, current_status: 'completed', current_stage: 'persistShots', pipeline_completed: true }, hasAssets: true })).toBe('done')
  })
})

describe('그림 만드는 중', () => {
  // 왜: 프로토타입 A4 — 디자인 · 그림 진행을 단계와 장수로 보여 준다.
  it('디자인 단계와 그린 장수로 진행을 보여 준다', () => {
    expect(makingProgress({ current_stage: 'actVisualArc', current_status: 'running' }, { charsReady: 0, charsTotal: 0, worldsReady: 0, worldsTotal: 0 })).toMatchObject({ step: 0 })
    expect(makingProgress({ current_stage: 'v2Design', current_status: 'running' }, { charsReady: 0, charsTotal: 2, worldsReady: 0, worldsTotal: 1 })).toMatchObject({ step: 1 })
    expect(makingProgress({ current_stage: 'v2Design', current_status: 'awaiting_artist' }, { charsReady: 1, charsTotal: 2, worldsReady: 1, worldsTotal: 1 })).toMatchObject({ step: 2, drawn: 2, total: 3 })
  })

  // 왜: 그림이 다 되면 잠금을 푼다.
  it('그림이 다 되면 만드는 중이 끝난다', () => {
    expect(makingProgress({ current_stage: 'v2Design', current_status: 'awaiting_artist' }, { charsReady: 2, charsTotal: 2, worldsReady: 1, worldsTotal: 1 })).toMatchObject({ done: true })
  })
})

describe('완료하기 조건', () => {
  // 왜: 프로토타입 A9 — 대표 그림이 하나라도 없으면 [완료하기]가 꺼진다. 화면도 서버와 같은 규칙.
  it('대표 그림이 없는 인물 · 배경이 있으면 완료하기를 끈다', () => {
    const gaps = assetCompletionGaps(
      [
        { characterId: 'minho', name: '민호', entityType: 'person', appearances: [{ isDefault: true, sheetUrl: 'https://img/minho.png' }] },
        { characterId: 'boss', name: '팀장', entityType: 'person', appearances: [{ isDefault: true, sheetUrl: null }] },
        { characterId: 'cup', name: '컵', entityType: 'object', appearances: [] },
      ],
      [{ locationId: 'hall', name: '회사 복도', wideShot: null }],
    )

    expect(gaps).toEqual({ characters: ['팀장'], locations: ['회사 복도'] })
  })
})
