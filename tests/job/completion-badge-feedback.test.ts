// 단계 배지는 중복 수신을 제외한 성공 완료만 세고 지금 보고 있는 단계에는 남기지 않는다.
import { expect, it } from 'vitest'
import { completionsOf, deriveStageBadges, type GenerationBatchRow } from '@/lib/generation-batches'
it('왼쪽 단계 배지는 아직 확인하지 않은 새 완료 수임을 알 수 있게 표시한다.', () => {
  const done: GenerationBatchRow = { id:'same',kind:'shot_rough_storyboard',status:'completed',target:{writerShotIds:['a','b']},created_at:new Date(2000).toISOString() }
  const rows = [done, done, {...done,id:'active',status:'queued' as const}, {...done,id:'failed',status:'failed' as const}]
  expect(deriveStageBadges(completionsOf(rows), {writer:1000}, 'artist')).toEqual({writer:2})
})
it('현재 보고 있는 단계에는 미확인 완료 배지가 남지 않는다.', () => {
  expect(deriveStageBadges([{stage:'writer',lane:'writer-rough',at:2000,units:9}], {writer:1000}, 'writer')).toEqual({})
})
