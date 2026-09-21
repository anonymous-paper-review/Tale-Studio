// Writer의 완료 숫자는 저장을 마친 러프 이미지 수를 세며 영상·접수·실패·옛 결과의 수정은 새 완료로 세지 않는다.
import { expect, it } from 'vitest'
import { completionsOf, deriveStageBadges, type GenerationBatchRow } from '@/lib/generation-batches'

const iso = (at: number) => new Date(at).toISOString()
const rough = (id: string, shotIds: string[], status: GenerationBatchRow['status'] = 'completed'): GenerationBatchRow => ({
  id, kind: 'shot_rough_storyboard', status, target: { writerShotIds: shotIds },
  created_at: iso(1000), updated_at: iso(2000),
})

it('러프 이미지 한 샷이 완료되면 Writer 숫자는 1부터 오르고 다음 세 샷이 완료되면 4가 된다.', () => {
  const first = rough('first', ['one'])
  expect(deriveStageBadges(completionsOf([first]), { writer: 1000 }, 'artist')).toEqual({ writer: 1 })
  const next = rough('next', ['two', 'three', 'four'])
  expect(deriveStageBadges(completionsOf([first, next]), { writer: 1000 }, 'artist')).toEqual({ writer: 4 })
})

it('러프 이미지의 접수와 실패 및 Director 이미지·영상 완료는 Writer 숫자를 올리지 않는다.', () => {
  const rows: GenerationBatchRow[] = [
    rough('queued', ['queued'], 'queued'), rough('failed', ['failed'], 'failed'),
    ...(['shot_storyboard', 'storyboard_real_grid', 'shot_video', 'shot_previz_video'] as const)
      .map(kind => ({ ...rough(kind, ['director']), kind })),
  ]
  expect(deriveStageBadges(completionsOf(rows), { writer: 1000 }, 'artist').writer ?? 0).toBe(0)
})

it('한 러프 결과의 같은 샷이 중복 기재되거나 같은 완료를 다시 받아도 이미지 수를 중복으로 올리지 않는다.', () => {
  const done = rough('same-result', ['one', 'one', 'two'])
  expect(deriveStageBadges(completionsOf([done, done]), { writer: 1000 }, 'artist')).toEqual({ writer: 2 })
})

it('이미 확인한 러프 완료에 나중에 추적 정보가 붙어도 새 이미지 완료로 다시 알리지 않는다.', () => {
  const done = { ...rough('seen-before', ['one']), completed_at: iso(2000), updated_at: iso(4000) }
  expect(deriveStageBadges(completionsOf([done]), { writer: 3000 }, 'artist')).toEqual({})
})

it('완료 시각이 없는 예전 러프 기록도 기존 저장 시각으로 완료 개수를 표시한다.', () => {
  expect(deriveStageBadges(completionsOf([rough('legacy', ['one'])]), { writer: 1000 }, 'artist')).toEqual({ writer: 1 })
})
