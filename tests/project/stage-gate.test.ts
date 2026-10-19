// 리뉴얼 단계(Producer → Writer → Artist → Storyboard → Director → Editor)가 어떤 사실로 하나씩 열리는지 (2026-10-19)
import { describe, it, expect } from 'vitest'
import { STAGES, STAGE_LABEL } from '@/lib/constants'
import { reachedStageFromFacts, canEnterStage, proseLockedFromFacts, type StageFacts } from '@/lib/stage-gate'

// id 는 옛 이름: entry=Producer, producer=Writer, artist=Artist, writer=Storyboard
const fresh: StageFacts = { storedStage: 'producer', treatmentStarted: false, runContinued: false, hasShots: false }

describe('리뉴얼 단계 열림', () => {
  it('단계는 Producer, Writer, Artist, Storyboard, Director, Editor 순서로 보인다', () => {
    expect(STAGES.map((s) => STAGE_LABEL[s.id])).toEqual(['Producer', 'Writer', 'Artist', 'Storyboard', 'Director', 'Editor'])
  })

  it('새 프로젝트는 Producer만 열려 있다', () => {
    expect(reachedStageFromFacts(fresh)).toBe('entry')
    expect(canEnterStage('entry', fresh)).toBe(true)
    expect(canEnterStage('producer', fresh)).toBe(false)
  })

  it('산문 초안을 시작하면 Writer가 열린다', () => {
    const f = { ...fresh, treatmentStarted: true }
    expect(reachedStageFromFacts(f)).toBe('producer')
    expect(canEnterStage('producer', f)).toBe(true)
    expect(canEnterStage('artist', f)).toBe(false)
  })

  it('산문을 확정하면 Artist가 열리고 산문이 잠긴다', () => {
    const f: StageFacts = { ...fresh, storedStage: 'artist', treatmentStarted: true }
    expect(reachedStageFromFacts(f)).toBe('artist')
    expect(canEnterStage('artist', f)).toBe(true)
    expect(proseLockedFromFacts(f)).toBe(true)
    expect(proseLockedFromFacts({ ...fresh, treatmentStarted: true })).toBe(false)
  })

  it('Artist에서 완료하기 전에는 Storyboard가 열리지 않는다', () => {
    const f: StageFacts = { ...fresh, storedStage: 'artist', treatmentStarted: true }
    expect(canEnterStage('writer', f)).toBe(false)
  })

  it('완료하기로 Storyboard를 열면 Artist와 Storyboard를 오갈 수 있다', () => {
    const f: StageFacts = { ...fresh, storedStage: 'writer', treatmentStarted: true, runContinued: true }
    expect(canEnterStage('artist', f)).toBe(true)
    expect(canEnterStage('writer', f)).toBe(true)
    expect(canEnterStage('director', f)).toBe(false)
  })

  it('예전 방식으로 샷까지 만든 프로젝트는 Storyboard까지 열린다', () => {
    const f: StageFacts = { ...fresh, storedStage: 'artist', treatmentStarted: true, runContinued: true, hasShots: true }
    expect(reachedStageFromFacts(f)).toBe('writer')
    expect(canEnterStage('artist', f)).toBe(true)
    expect(canEnterStage('writer', f)).toBe(true)
  })

  it('예전 방식으로 산문을 넘긴 프로젝트는 Artist까지 열린다', () => {
    const f: StageFacts = { ...fresh, treatmentStarted: true, runContinued: true }
    expect(reachedStageFromFacts(f)).toBe('artist')
    expect(proseLockedFromFacts(f)).toBe(true)
  })

  it('한 번 연 단계는 사실을 다시 못 읽어도 닫히지 않는다', () => {
    const f: StageFacts = { ...fresh, storedStage: 'director' }
    expect(reachedStageFromFacts(f)).toBe('director')
    expect(canEnterStage('writer', f)).toBe(true)
    expect(proseLockedFromFacts(f)).toBe(true)
  })
})
