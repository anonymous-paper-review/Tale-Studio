// Storyboard 실사 보기의 규칙 — 카드가 콘티 · 실사 중 무엇을 보이는지, 어느 카드에 기다림이 뜨는지, [시작]이 무엇을 세는지, 진행 숫자를 검사한다
import { describe, expect, it } from 'vitest'
import {
  realDrawingShotIds,
  storyboardCardPicture,
  storyboardCardWait,
  storyboardRealProgress,
  storyboardStartView,
  type RealBatchFlags,
} from '@/lib/storyboard/real-board'
import type { ActiveJob } from '@/lib/generation-queue'
import type { RoughStoryboardImage } from '@/types/shot'

// 이 시험을 위해 지은 그림들 — 콘티(목각 러프) 세 장과 실사 세 장.
const conti = (id: string): RoughStoryboardImage => ({
  url: `https://x/${id}-rough-start.png`,
  status: 'completed',
  errorMessage: null,
  generatedAt: 10,
  frames: { start: `https://x/${id}-rough-start.png`, direction: `https://x/${id}-rough-dir.png`, end: `https://x/${id}-rough-end.png` },
})
const real = (id: string) => ({
  url: `https://x/${id}-real-start.png`,
  status: 'completed',
  errorMessage: null,
  generatedAt: 20,
  frames: { start: `https://x/${id}-real-start.png`, direction: `https://x/${id}-real-dir.png`, end: `https://x/${id}-real-end.png` },
})
const idle: RealBatchFlags = { busy: false, cancelled: false, shotIds: null }
const none = new Set<string>()

describe('카드가 보이는 그림', () => {
  // 왜(오너 S2 "콘티인 상태로 시작"): Storyboard 에 처음 오면 실사가 없으니 Writer 콘티에서 그린 목각 그림을 그대로 보인다.
  it('실사 그림이 없는 샷 카드는 콘티(목각 러프) 그림을 보인다', () => {
    const picture = storyboardCardPicture(conti('a'), null)
    expect(picture.kind).toBe('conti')
    expect(picture.kind === 'conti' && picture.panel.frames?.start).toBe('https://x/a-rough-start.png')
  })

  // 왜(오너 S2 "(현재)디렉터의 스토리보드 상태"): 실사가 생기면 Director 스토리보드 카드처럼 실사 시작 · 연출 · 끝을 보인다.
  it('실사 그림이 있는 샷 카드는 콘티 대신 실사 시작 · 연출 · 끝 그림을 보인다', () => {
    const picture = storyboardCardPicture(conti('a'), real('a'))
    expect(picture.kind).toBe('real')
    expect(picture.kind === 'real' && picture.panel.frames).toEqual(real('a').frames)
  })

  // 왜(혼자 정한 것 f): 콘티 그림이 없으면 실사도 못 만든다 — 빈 카드가 고장처럼 보이지 않게 따로 알린다.
  it('콘티 그림도 실사 그림도 없는 샷 카드는 그림 대신 콘티 그림이 없다는 자리를 보인다', () => {
    expect(storyboardCardPicture(null, null).kind).toBe('none')
    expect(storyboardCardPicture({ ...conti('a'), status: 'failed', url: '' }, null).kind).toBe('none')
  })

  // 왜: 실사가 있는지는 실사 일괄 서버와 같은 판정으로 본다 — 화면이 "있음"으로 본 샷을 서버가 "없음"으로 그리면 같은 샷을 두 번 만든다.
  it('끝나지 않은 실사 기록만 있는 샷은 실사가 없는 샷으로 보고 콘티 그림을 보인다', () => {
    expect(storyboardCardPicture(conti('a'), { ...real('a'), status: 'generating' }).kind).toBe('conti')
  })
})

describe('카드 위 기다림', () => {
  const job = (id: string, kind: ActiveJob['kind'], target: ActiveJob['target'], cancelledAt?: string): ActiveJob =>
    ({ id, kind, target, ...(cancelledAt ? { cancelledAt } : {}) }) as ActiveJob

  // 왜(오너 S5 · O7): 실사를 만들거나 다시 그리는 동안 화면을 막지 않고 그 카드에만 기다림을 보인다 — 큐에 떠 있는 실사 작업이 진실이다.
  it('실사를 그리는 작업이 떠 있는 샷 카드에만 기다림을 보인다', () => {
    const drawing = realDrawingShotIds([
      job('j1', 'storyboard_real_grid', { writerShotIds: ['a', 'b'] }),
      job('j2', 'shot_storyboard', { writerShotId: 'c' }),
      job('j3', 'shot_rough_storyboard', { shotId: 'd' }),
    ])
    expect([...drawing].sort()).toEqual(['a', 'b', 'c'])
    expect(storyboardCardWait({ shotId: 'a', hasReal: false, hasConti: true, drawing, batch: idle })).toBe('drawing')
    expect(storyboardCardWait({ shotId: 'c', hasReal: true, hasConti: true, drawing, batch: idle })).toBe('drawing')
    expect(storyboardCardWait({ shotId: 'd', hasReal: false, hasConti: true, drawing, batch: idle })).toBe('none')
  })

  // 왜(오너 2026-11-14 7번): 화면에서 멈춘 작업은 fal 에서 끝까지 돌아도 만드는 중이 아니다 — 그 샷은 바로 다시 만들 수 있다.
  it('화면에서 멈춘 실사 작업은 그리는 중으로 세지 않는다', () => {
    const drawing = realDrawingShotIds([job('j1', 'storyboard_real_grid', { writerShotIds: ['a'] }, '2026-11-26T00:00:00Z')])
    expect(drawing.has('a')).toBe(false)
  })

  // 왜(혼자 정한 것, Director 카드와 같은 조건): [시작]이 맡았지만 아직 서버에 보내지 않은 샷은 "곧 그린다"를 보여야 다시 누르지 않는다.
  it('[시작] 일괄이 맡았지만 아직 보내지 않은 샷 카드는 차례를 기다린다고 보인다', () => {
    const batch: RealBatchFlags = { busy: true, cancelled: false, shotIds: ['a', 'b'] }
    expect(storyboardCardWait({ shotId: 'a', hasReal: false, hasConti: true, drawing: none, batch })).toBe('queued')
    expect(storyboardCardWait({ shotId: 'z', hasReal: false, hasConti: true, drawing: none, batch })).toBe('none')
    expect(storyboardCardWait({ shotId: 'a', hasReal: false, hasConti: true, drawing: none, batch: { ...batch, shotIds: null } })).toBe('queued')
  })

  // 왜: 일괄은 실사가 없고 콘티 그림이 있는 샷만 그린다(서버 규칙) — 그 밖의 샷에 기다림을 띄우면 끝나지 않는 기다림이 된다.
  it('실사가 이미 있거나 콘티 그림이 없는 샷은 일괄이 돌아도 차례 기다림을 보이지 않는다', () => {
    const batch: RealBatchFlags = { busy: true, cancelled: false, shotIds: null }
    expect(storyboardCardWait({ shotId: 'a', hasReal: true, hasConti: true, drawing: none, batch })).toBe('none')
    expect(storyboardCardWait({ shotId: 'a', hasReal: false, hasConti: false, drawing: none, batch })).toBe('none')
  })

  // 왜(오너 답 7 — [모두 멈추기]): 멈춘 뒤에는 아직 보내지 않은 장을 보내지 않으니 기다림도 내린다.
  it('[멈추기]를 누른 뒤에는 아직 보내지 않은 샷 카드에 기다림을 보이지 않는다', () => {
    const batch: RealBatchFlags = { busy: true, cancelled: true, shotIds: null }
    expect(storyboardCardWait({ shotId: 'a', hasReal: false, hasConti: true, drawing: none, batch })).toBe('none')
  })
})

describe('[시작] 단추', () => {
  const board = [
    { shotId: 'a', roughStoryboard: conti('a') },
    { shotId: 'b', roughStoryboard: conti('b') },
    { shotId: 'c', roughStoryboard: null },
    { shotId: 'd', roughStoryboard: conti('d') },
  ]
  const realOf = (images: Record<string, unknown>) => (shotId: string) => images[shotId] ?? null

  // 왜(오너 S2): [시작]은 실사가 없는 샷 전부를 만든다 — 콘티 그림이 있어야 만들 수 있으니 그 샷만 보드 순서대로 센다.
  it('[시작]은 실사 그림이 없고 콘티 그림이 있는 샷을 보드 순서대로 센다', () => {
    const view = storyboardStartView({ shots: board, realOf: realOf({ b: real('b') }), drawing: none, batch: idle })
    expect(view.targets).toEqual(['a', 'd'])
    expect(view.mode).toBe('start')
  })

  // 왜(혼자 정한 것 f): 콘티 그림이 없는 샷은 Storyboard 에서 그리지 않는다 — 빼고 세고, 빠진 샷은 따로 알린다.
  it('콘티 그림이 없는 샷은 [시작]이 세지 않고 따로 알린다', () => {
    const view = storyboardStartView({ shots: board, realOf: realOf({}), drawing: none, batch: idle })
    expect(view.targets).not.toContain('c')
    expect(view.noConti).toEqual(['c'])
  })

  // 왜: 다시 그리는 중인 샷(채팅 고치기 등)을 다시 세면 같은 샷에 일을 두 번 맡긴다 — 서버가 둘째를 거절한다.
  it('실사를 그리는 중인 샷은 [시작]이 세지 않는다', () => {
    const view = storyboardStartView({ shots: board, realOf: realOf({}), drawing: new Set(['a']), batch: idle })
    expect(view.targets).toEqual(['b', 'd'])
  })

  // 왜(혼자 정한 것 b, design §1 규칙 2 "크림 단추는 화면에 하나"): 만들 실사가 있으면 [시작]이 지금 할 일이다.
  it('실사 그림이 없는 샷이 있으면 [시작]이 크림 단추이고 [다음: Director로]는 보조 단추다', () => {
    const view = storyboardStartView({ shots: board, realOf: realOf({}), drawing: none, batch: idle })
    expect(view.mode).toBe('start')
    expect(view.nextIsPrimary).toBe(false)
  })

  // 왜(혼자 정한 것 b): 실사가 다 있으면 남은 일은 Director 로 가는 것뿐이다.
  it('모든 샷에 실사 그림이 있으면 [시작]이 사라지고 [다음: Director로]가 크림 단추가 된다', () => {
    const view = storyboardStartView({
      shots: board.filter((s) => s.shotId !== 'c'),
      realOf: realOf({ a: real('a'), b: real('b'), d: real('d') }),
      drawing: none,
      batch: idle,
    })
    expect(view.mode).toBe('all-real')
    expect(view.targets).toEqual([])
    expect(view.nextIsPrimary).toBe(true)
  })

  // 왜(혼자 정한 것 f): 콘티 그림이 없는 샷만 남으면 [시작]으로 만들 것이 없다 — 단추 대신 콘티로 가라는 안내만 남는다.
  it('실사가 없는 샷이 모두 콘티 그림도 없으면 [시작]을 보이지 않는다', () => {
    const view = storyboardStartView({ shots: board, realOf: realOf({ a: real('a'), b: real('b'), d: real('d') }), drawing: none, batch: idle })
    expect(view.mode).toBe('nothing')
    expect(view.noConti).toEqual(['c'])
    expect(view.nextIsPrimary).toBe(true)
  })

  // 왜(혼자 정한 것 c — Director [모두 멈추기]와 같은 약속): 도는 동안 같은 자리에서 멈출 수 있어야 한다.
  it('실사 일괄이 도는 동안 [시작] 자리에 [멈추기]가 보이고, 누른 뒤 정리하는 동안은 멈추는 중으로 꺼진다', () => {
    expect(storyboardStartView({ shots: board, realOf: realOf({}), drawing: none, batch: { busy: true, cancelled: false, shotIds: null } }).mode).toBe('stop')
    expect(storyboardStartView({ shots: board, realOf: realOf({}), drawing: none, batch: { busy: true, cancelled: true, shotIds: null } }).mode).toBe('stopping')
  })
})

describe('진행 줄 숫자', () => {
  // 왜(혼자 정한 것 d): 지금 보드의 진행 줄 자리에 실사 기준 숫자 — 몇 장이 실사가 됐고 몇 장을 만드는 중인지.
  it('진행 줄은 보드 전체 샷 수 · 실사 수 · 만드는 중 수 · 실사 없음 수를 센다', () => {
    const shots = [
      { shotId: 'a', roughStoryboard: conti('a') },
      { shotId: 'b', roughStoryboard: conti('b') },
      { shotId: 'c', roughStoryboard: conti('c') },
      { shotId: 'd', roughStoryboard: null },
    ]
    const images: Record<string, unknown> = { a: real('a'), b: real('b') }
    const progress = storyboardRealProgress({
      shots,
      realOf: (id) => images[id] ?? null,
      drawing: new Set(['b']),
      batch: { busy: true, cancelled: false, shotIds: ['c'] },
    })
    // a = 실사 · b = 다시 그리는 중(만드는 중) · c = 일괄 차례(만드는 중) · d = 실사 없음
    expect(progress).toEqual({ total: 4, real: 1, making: 2, noReal: 1 })
  })
})
